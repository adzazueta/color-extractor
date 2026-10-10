import type { IncomingMessage } from "node:http";
import { describe, expect, test } from "vite-plus/test";
import { isLoopbackAddress, rejectReason } from "../../../../lab/server/security.js";

function fakeRequest(
  remoteAddress: string | undefined,
  headers: Readonly<Record<string, string>>,
): IncomingMessage {
  return { socket: { remoteAddress }, headers } as unknown as IncomingMessage;
}

const HOST = "localhost:5173";

describe("isLoopbackAddress", () => {
  test.each(["127.0.0.1", "127.1.2.3", "127.255.255.255", "::1", "::ffff:127.0.0.1"])(
    "%s is loopback",
    (address) => {
      expect(isLoopbackAddress(address)).toBe(true);
    },
  );

  test.each([
    undefined,
    "",
    "192.168.1.5",
    "10.0.0.1",
    "128.0.0.1",
    "0.0.0.0",
    "::",
    "::2",
    "::ffff:10.0.0.1",
    "::ffff:192.168.1.5",
    "fe80::1",
    "127.0.0.256",
    "1270.0.0.1",
  ])("%s is not loopback", (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });
});

describe("rejectReason", () => {
  test("a plain request from this machine passes", () => {
    expect(rejectReason(fakeRequest("127.0.0.1", { host: HOST }))).toBeNull();
    expect(rejectReason(fakeRequest("::1", { host: "[::1]:5173" }))).toBeNull();
    expect(rejectReason(fakeRequest("::1", { host: "127.0.0.1:5173" }))).toBeNull();
    expect(rejectReason(fakeRequest("::1", { host: "localhost" }))).toBeNull();
  });

  test("a remote peer is refused", () => {
    for (const address of ["192.168.1.5", "::ffff:192.168.1.5", undefined]) {
      expect(rejectReason(fakeRequest(address, { host: HOST }))).toBe("remote address");
    }
  });

  test("a Host that does not name this machine is refused", () => {
    for (const host of [
      "evil.example",
      "evil.example:5173",
      "localhost.evil.example",
      "127.0.0.1.nip.io",
      "sub.localhost:5173",
      "[::2]:5173",
      "localhost:5173:1",
      "",
    ]) {
      expect(rejectReason(fakeRequest("127.0.0.1", { host })), host).toBe("host");
    }
    expect(rejectReason(fakeRequest("127.0.0.1", {}))).toBe("host");
  });

  test("an Origin must be the lab's own origin", () => {
    expect(rejectReason(fakeRequest("::1", { host: HOST, origin: `http://${HOST}` }))).toBeNull();
    for (const origin of [
      "http://localhost:3000",
      "https://localhost:5173",
      "http://127.0.0.1:5173",
      "http://evil.example",
      "null",
      "",
    ]) {
      expect(rejectReason(fakeRequest("::1", { host: HOST, origin })), origin).toBe("origin");
    }
  });

  test("Sec-Fetch-Site must be same-origin or none", () => {
    for (const site of ["same-origin", "none"]) {
      expect(rejectReason(fakeRequest("::1", { host: HOST, "sec-fetch-site": site }))).toBeNull();
    }
    for (const site of ["same-site", "cross-site", ""]) {
      expect(rejectReason(fakeRequest("::1", { host: HOST, "sec-fetch-site": site })), site).toBe(
        "sec-fetch-site",
      );
    }
  });
});
