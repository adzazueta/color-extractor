import type { IncomingMessage, ServerResponse } from "node:http";
import type { LabError } from "../api.js";

/** A response with a status and a fixed message. Messages never echo request values. */
export class HttpError extends Error {
  readonly status: number;
  readonly problems: readonly string[] | undefined;

  constructor(status: number, message: string, problems?: readonly string[]) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.problems = problems;
  }
}

/** Bytes discarded after a body is refused, before the connection is dropped. */
export const MAX_DISCARDED_BYTES: number = 1_048_576;

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(text));
  setCommonHeaders(response);
  response.end(text);
}

export function sendError(
  response: ServerResponse,
  status: number,
  message: string,
  problems?: readonly string[],
): void {
  const body: LabError = problems === undefined ? { error: message } : { error: message, problems };
  sendJson(response, status, body);
}

export function sendBytes(response: ServerResponse, contentType: string, bytes: Uint8Array): void {
  response.statusCode = 200;
  response.setHeader("content-type", contentType);
  response.setHeader("content-length", bytes.byteLength);
  setCommonHeaders(response);
  response.end(bytes);
}

export function sendStatus(response: ServerResponse, status: number): void {
  response.statusCode = status;
  setCommonHeaders(response);
  response.end();
}

const discarding = new WeakMap<IncomingMessage, Promise<void>>();

/**
 * Reads and drops what is left of a request body. It settles when the body has ended (or the
 * connection is gone), so a response sent afterwards never races unread bytes: closing a socket
 * with unread data resets the connection and can lose the response. More than `limit` bytes
 * destroys the connection instead.
 */
export function discardBody(
  request: IncomingMessage,
  limit: number = MAX_DISCARDED_BYTES,
): Promise<void> {
  const known = discarding.get(request);
  if (known !== undefined) return known;
  const done = new Promise<void>((resolve) => {
    if (request.complete || request.readableEnded || request.destroyed) {
      resolve();
      return;
    }
    let discarded = 0;
    request.on("data", (chunk: Uint8Array) => {
      discarded += chunk.byteLength;
      if (discarded > limit) request.destroy();
    });
    request.on("end", resolve);
    request.on("close", resolve);
    request.on("error", () => resolve());
    request.resume();
  });
  discarding.set(request, done);
  return done;
}

function isJsonContentType(header: string | undefined): boolean {
  if (header === undefined) return false;
  const [type = ""] = header.split(";");
  return type.trim().toLowerCase() === "application/json";
}

/**
 * Reads a JSON body of at most `limit` bytes.
 *
 * @throws HttpError 415 unless the content type is application/json, 413 above the limit, and 400
 * when the body is not valid JSON. After a 415 or 413, the rest of the body has been discarded.
 */
export async function readJsonBody(request: IncomingMessage, limit: number): Promise<unknown> {
  if (!isJsonContentType(request.headers["content-type"])) {
    await discardBody(request);
    throw new HttpError(415, "The request body must be application/json.");
  }
  const tooLarge = new HttpError(413, `The request body must not exceed ${limit} bytes.`);
  const declared = request.headers["content-length"];
  if (declared !== undefined && !(Number(declared) <= limit)) {
    await discardBody(request);
    throw tooLarge;
  }
  const text = await new Promise<string | null>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("close", onClose);
    };
    const onData = (chunk: Uint8Array) => {
      total += chunk.byteLength;
      if (total > limit) {
        cleanup();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new HttpError(400, "The request was aborted."));
    };
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("close", onClose);
  });
  if (text === null) {
    await discardBody(request);
    throw tooLarge;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "The request body is not valid JSON.");
  }
}
