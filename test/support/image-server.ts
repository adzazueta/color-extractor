import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import type { Plugin } from "vite-plus";
import { encodeTestImage, TEST_IMAGE_NAMES, type TestImageName } from "./images.js";

const PREFIX = "/__test-images__/";

export interface TestImageServer {
  readonly origin: string;
  close(): Promise<void>;
}

interface RouteContext {
  readonly cors: boolean;
  readonly crossOrigin: string | undefined;
}

function isTestImageName(name: string): name is TestImageName {
  return (TEST_IMAGE_NAMES as readonly string[]).includes(name);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function end(response: ServerResponse, status: number, text: string): void {
  response.statusCode = status;
  response.setHeader("content-type", "text/plain");
  response.end(text);
}

async function respond(
  request: IncomingMessage,
  response: ServerResponse,
  context: RouteContext,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(PREFIX)) {
    end(response, 404, "not found");
    return;
  }
  const name = decodeURIComponent(url.pathname.slice(PREFIX.length));
  const query = url.searchParams;
  if (name === "cross-origin" && context.crossOrigin !== undefined) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ origin: context.crossOrigin }));
    return;
  }
  if (context.cors && query.get("cors") === "1") {
    response.setHeader("access-control-allow-origin", "*");
  }
  const delay = Number(query.get("delay") ?? "0");
  if (delay > 0) {
    await wait(delay);
  }
  const status = Number(query.get("status") ?? "200");
  if (status !== 200) {
    end(response, status, "error");
    return;
  }
  let body: Uint8Array;
  if (name === "filler") {
    const size = Number(query.get("bytes") ?? "0");
    if (!Number.isInteger(size) || size < 0) {
      end(response, 400, "bad bytes");
      return;
    }
    body = new Uint8Array(size);
  } else if (isTestImageName(name)) {
    body = await encodeTestImage(name);
  } else {
    end(response, 404, "not found");
    return;
  }
  response.statusCode = 200;
  response.setHeader("content-type", "application/octet-stream");
  const half = Math.floor(body.length / 2);
  if (query.get("stall") === "1") {
    response.setHeader("content-length", String(body.length));
    response.write(body.subarray(0, half));
    return; // never completes; the socket is destroyed when the server closes
  }
  if (query.get("chunked") === "1") {
    response.write(body.subarray(0, half));
    await wait(10);
    response.end(body.subarray(half));
    return;
  }
  response.setHeader("content-length", String(body.length));
  response.end(body);
}

function handle(request: IncomingMessage, response: ServerResponse, context: RouteContext): void {
  respond(request, response, context).catch(() => {
    if (!response.headersSent) {
      end(response, 500, "error");
    } else {
      response.destroy();
    }
  });
}

/** Starts a standalone image server on 127.0.0.1 with a free port. With `cors`, `?cors=1` adds the CORS header. */
export async function startTestImageServer(options: { cors: boolean }): Promise<TestImageServer> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((request, response) =>
    handle(request, response, { cors: options.cors, crossOrigin: undefined }),
  );
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) {
          socket.destroy();
        }
      }),
  };
}

/** Serves the test images same-origin from Vite's dev server, next to a cross-origin server for the CORS cases. */
export function testImageServer(): Plugin {
  let cross: TestImageServer | undefined;
  return {
    name: "test-image-server",
    async configureServer(server) {
      const started = await startTestImageServer({ cors: true });
      cross = started;
      server.httpServer?.once("close", () => {
        void cross?.close();
      });
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith(PREFIX) === true) {
          handle(request, response, { cors: false, crossOrigin: started.origin });
        } else {
          next();
        }
      });
    },
  };
}
