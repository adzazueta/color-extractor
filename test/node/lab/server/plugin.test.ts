import { readFile } from "node:fs/promises";
import {
  createServer as createHttpServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServer,
  resolveConfig,
  type ConfigEnv,
  type Connect,
  type Plugin,
  type UserConfig,
  type ViteDevServer,
} from "vite-plus";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import * as analyzer from "../../../../eval/lib/analyze.js";
import type { LabAnalysis, LabError, LabInventory } from "../../../../lab/api.js";
import type { LabHandler } from "../../../../lab/server/handler.js";
import { lab } from "../../../../lab/server/plugin.js";
import { createEvalFixture, type EvalFixture } from "../../../support/eval-fixture.js";

const REPO = fileURLToPath(new URL("../../../..", import.meta.url));
const API = "/__lab/api";

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface Listening {
  readonly port: number;
  call(path: string, headers?: Readonly<Record<string, string>>): Promise<Reply>;
  close(): Promise<void>;
}

async function listen(
  handle: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<Listening> {
  const server: Server = createHttpServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    call: (path, headers = {}) =>
      new Promise<Reply>((resolve, reject) => {
        const outgoing = request(
          {
            host: "127.0.0.1",
            port,
            path,
            agent: false,
            headers: { host: `localhost:${port}`, ...headers },
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                headers: response.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          },
        );
        outgoing.on("error", reject);
        outgoing.end();
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

let fixture: EvalFixture;

beforeAll(async () => {
  fixture = await createEvalFixture();
});
afterAll(async () => {
  await fixture.cleanup();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("apply", () => {
  const apply = lab().apply as (config: UserConfig, env: ConfigEnv) => boolean;

  test("only vp dev applies the plugin", () => {
    expect(apply({}, { command: "serve", mode: "development" })).toBe(true);
    expect(apply({}, { command: "serve", mode: "production" })).toBe(true);
    expect(apply({}, { command: "serve", mode: "test" })).toBe(false);
    expect(apply({}, { command: "build", mode: "production" })).toBe(false);
    expect(apply({}, { command: "build", mode: "development" })).toBe(false);
    expect(apply({}, { command: "build", mode: "test" })).toBe(false);
  });

  test.each([
    ["serve", "development", true],
    ["serve", "test", false],
    ["build", "production", false],
  ] as const)(
    "the repository's vite.config.ts in %s mode %s: %s",
    async (command, mode, applied) => {
      const config = await resolveConfig(
        { configFile: join(REPO, "vite.config.ts"), mode, logLevel: "silent" },
        command,
      );
      expect(config.plugins.some((plugin) => plugin.name === "color-extractor-lab")).toBe(applied);
    },
  );
});

interface FakeServer {
  readonly server: ViteDevServer;
  readonly middlewares: Connect.NextHandleFunction[];
  readonly watchers: ((event: string, file: string) => void)[];
  readonly closers: (() => void)[];
}

function fakeServer(host: string | boolean | undefined, root = fixture.repoRoot): FakeServer {
  const middlewares: Connect.NextHandleFunction[] = [];
  const watchers: ((event: string, file: string) => void)[] = [];
  const closers: (() => void)[] = [];
  const server = {
    config: { root, server: { host } },
    environments: { ssr: {} },
    middlewares: { use: (handle: Connect.NextHandleFunction) => middlewares.push(handle) },
    watcher: {
      on: (event: string, listener: (event: string, file: string) => void) => {
        if (event === "all") watchers.push(listener);
      },
    },
    httpServer: {
      once: (event: string, listener: () => void) => event === "close" && closers.push(listener),
    },
  };
  return { server: server as unknown as ViteDevServer, middlewares, watchers, closers };
}

function configure(plugin: Plugin, server: ViteDevServer): unknown {
  return (plugin.configureServer as (server: ViteDevServer) => unknown)(server);
}

describe("configureServer", () => {
  test.each([true, "0.0.0.0", "192.168.1.5", "::", "example.com"])(
    "refuses to start with host %s",
    (host) => {
      const fake = fakeServer(host);
      expect(() => configure(lab({ evalDir: fixture.evalDir }), fake.server)).toThrow(
        "The lab only listens on localhost. Remove --host or server.host.",
      );
      expect(fake.middlewares).toHaveLength(0);
    },
  );

  test.each([undefined, "localhost", "127.0.0.1", "::1"])("starts with host %s", (host) => {
    const fake = fakeServer(host);
    configure(lab({ evalDir: fixture.evalDir }), fake.server);
    expect(fake.middlewares).toHaveLength(1);
    expect(fake.watchers).toHaveLength(1);
    expect(fake.closers).toHaveLength(1);
  });

  test("the evaluation folder defaults to COLOR_EXTRACTOR_EVAL_DIR", async () => {
    vi.stubEnv("COLOR_EXTRACTOR_EVAL_DIR", fixture.evalDir);
    const fake = fakeServer(undefined);
    configure(lab(), fake.server);
    const middleware = fake.middlewares[0];
    if (middleware === undefined) throw new Error("no middleware");
    const server = await listen((req, res) => middleware(req, res, () => undefined));
    try {
      const reply = await server.call(`${API}/inventory`);
      expect(reply.status).toBe(200);
      const inventory = JSON.parse(reply.body) as LabInventory;
      expect(inventory.evalDir).toBe(fixture.evalDir);
      expect(inventory.images).toHaveLength(6);
    } finally {
      await server.close();
    }
  });

  test("edits under src/ and eval/lib/ invalidate the caches; other files do not", () => {
    const root = "/work/color-extractor";
    const fake = fakeServer(undefined, root);
    configure(lab({ evalDir: fixture.evalDir }), fake.server);
    const handler = fake.middlewares[0] as unknown as LabHandler;
    const invalidate = vi.spyOn(handler, "invalidate");
    const [watcher] = fake.watchers;
    if (watcher === undefined) throw new Error("no watcher");
    const cases: [string, string, boolean][] = [
      ["change", `${root}/src/core/pipeline/parameters.ts`, true],
      ["add", `${root}/src/node/new.ts`, true],
      ["unlink", `${root}/eval/lib/analyze.ts`, true],
      ["change", `${root}/eval/lib/color.ts`, true],
      ["change", `${root}/eval/annotations/dev.json`, false],
      ["change", `${root}/eval/config.ts`, false],
      ["change", `${root}/lab/ui/viewer.ts`, false],
      ["change", `${root}/srcx/a.ts`, false],
      ["change", `${root}/eval/library/a.ts`, false],
      ["change", "/elsewhere/src/a.ts", false],
    ];
    for (const [event, file, expected] of cases) {
      invalidate.mockClear();
      watcher(event, file);
      expect(invalidate.mock.calls.length, file).toBe(expected ? 1 : 0);
    }
  });

  test("closing the HTTP server closes the handler", async () => {
    const fake = fakeServer(undefined);
    configure(lab({ evalDir: fixture.evalDir }), fake.server);
    const middleware = fake.middlewares[0];
    if (middleware === undefined) throw new Error("no middleware");
    const close = vi.spyOn(middleware as unknown as LabHandler, "close");
    for (const closer of fake.closers) closer();
    expect(close).toHaveBeenCalledTimes(1);
    const server = await listen((req, res) => middleware(req, res, () => undefined));
    try {
      expect((await server.call(`${API}/inventory`)).status).toBe(503);
    } finally {
      await server.close();
    }
  });
});

describe("inside a real Vite dev server", () => {
  async function startVite(mode: string): Promise<{ vite: ViteDevServer; http: Listening }> {
    const vite = await createServer({
      configFile: false,
      root: REPO,
      mode,
      logLevel: "silent",
      appType: "custom",
      resolve: { tsconfigPaths: true },
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      plugins: [lab({ evalDir: fixture.evalDir })],
    });
    const http = await listen((req, res) => vite.middlewares(req, res));
    return { vite, http };
  }

  test("analysis goes through the SSR module runner and Vite checks Host first", async () => {
    const { vite, http } = await startVite("development");
    try {
      const orange = fixture.images.orange;
      const reply = await http.call(`${API}/analysis/${orange.sha256}?count=5`);
      expect(reply.status).toBe(200);
      const analysis = JSON.parse(reply.body) as LabAnalysis;
      const bytes = await readFile(join(fixture.evalDir, orange.set, orange.relativePath));
      const decoded = await analyzer.decodeEvalImage(bytes);
      expect(analysis.perceptual).toEqual(analyzer.extractEvalColors(decoded, "perceptual", 5));
      expect(analysis.population).toEqual(analyzer.extractEvalColors(decoded, "population", 5));

      const blind = await http.call(`${API}/analysis/${fixture.images["test-a"].sha256}?count=5`);
      expect(blind.status).toBe(403);
      expect((JSON.parse(blind.body) as LabError).error).toContain("blind annotation");

      // Vite's host check runs before the lab's middleware.
      const foreign = await http.call(`${API}/inventory`, { host: "evil.example" });
      expect(foreign.status).toBe(403);
      expect(foreign.body).toContain("Blocked request");

      const redirect = await http.call("/");
      expect(redirect.status).toBe(302);
      expect(redirect.headers.location).toBe("/lab/");
    } finally {
      await http.close();
      await vite.close();
    }
  });

  test("in mode test the lab is not there", async () => {
    const { vite, http } = await startVite("test");
    try {
      for (const path of [`${API}/inventory`, "/"]) {
        const reply = await http.call(path);
        expect(reply.status, path).toBe(404);
        expect(reply.headers["content-type"]).not.toContain("application/json");
      }
    } finally {
      await http.close();
      await vite.close();
    }
  });
});
