import type { IncomingMessage } from "node:http";
import { isIPv4 } from "node:net";

/** A Host header that names this machine: localhost, 127.x.x.x, or [::1], with an optional port. */
const LOOPBACK_HOST = /^(?:localhost|127(?:\.[0-9]{1,3}){3}|\[::1\])(?::[0-9]{1,5})?$/i;

/** 127.0.0.0/8, ::1, or 127.0.0.0/8 mapped to IPv6. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  if (address === "::1") return true;
  const ipv4 = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  return isIPv4(ipv4) && ipv4.startsWith("127.");
}

/**
 * Why a lab API request is refused, or null when it may proceed. The checks, in order:
 *
 * 1. the peer is a loopback address;
 * 2. the Host header names this machine (Vite also checks it, against `server.allowedHosts`);
 * 3. an Origin header, when present, is exactly the lab's own origin;
 * 4. Sec-Fetch-Site, when present, is `same-origin` or `none` (typed in the address bar).
 */
export function rejectReason(request: IncomingMessage): string | null {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return "remote address";
  const host = request.headers.host;
  if (host === undefined || !LOOPBACK_HOST.test(host)) return "host";
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return "origin";
  const site = request.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && site !== "none") return "sec-fetch-site";
  return null;
}
