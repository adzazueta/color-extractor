import { ColorExtractorError } from '../core/errors.js'
import type { ParsedRemoteUrl } from './security.js'
import type { RemoteOptions } from '../core/options.js'

const LOOPBACK_V4 = [
  [127, 0, 0, 0],
  [127, 255, 255, 255],
] as const
const LINK_LOCAL_V4 = [
  [169, 254, 0, 0],
  [169, 254, 255, 255],
] as const
const CGNAT_V4 = [
  [100, 64, 0, 0],
  [100, 127, 255, 255],
] as const
const METADATA_V4 = [
  [169, 254, 169, 254],
  [169, 254, 169, 254],
] as const
const PRIVATE_V4_RANGES = [
  [[10, 0, 0, 0], [10, 255, 255, 255]],
  [[172, 16, 0, 0], [172, 31, 255, 255]],
  [[192, 168, 0, 0], [192, 168, 255, 255]],
  [LOOPBACK_V4[0], LOOPBACK_V4[1]],
  [LINK_LOCAL_V4[0], LINK_LOCAL_V4[1]],
  [CGNAT_V4[0], CGNAT_V4[1]],
] as const

function ip4ToInt(parts: readonly number[]): number {
  if (parts.length !== 4) return 0
  return (
    ((parts[0]! & 0xff) << 24) |
    ((parts[1]! & 0xff) << 16) |
    ((parts[2]! & 0xff) << 8) |
    (parts[3]! & 0xff)
  )
}

function inRange(value: number, lo: number, hi: number): boolean {
  return value >= lo && value <= hi
}

function ip4InAnyRange(ip: number, ranges: readonly (readonly [readonly number[], readonly number[]])[]): boolean {
  for (const [lo, hi] of ranges) {
    if (inRange(ip, ip4ToInt(lo), ip4ToInt(hi))) return true
  }
  return false
}

export function isPrivateIPv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const parts = [m[1], m[2], m[3], m[4]].map((s) => Number.parseInt(s as string, 10))
  if (parts.some((n) => n < 0 || n > 255)) return false
  const ip = ip4ToInt(parts)
  if (ip === 0) return true
  if (ip4InAnyRange(ip, PRIVATE_V4_RANGES)) return true
  if (ip4InAnyRange(ip, [METADATA_V4])) return true
  return false
}

function extractMappedIPv4(hostname: string): string | null {
  let normalized = hostname.toLowerCase()
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1)
  }
  normalized = normalized.split('%')[0]!
  if (!normalized.startsWith('::ffff:')) return null
  const tail = normalized.slice('::ffff:'.length)
  const m = /^([0-9a-f]{1,3})\.([0-9a-f]{1,3})\.([0-9a-f]{1,3})\.([0-9a-f]{1,3})$/i.exec(tail)
  if (m) {
    const parts = [m[1]!, m[2]!, m[3]!, m[4]!].map((s) => Number.parseInt(s, 10))
    if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)) {
      return parts.join('.')
    }
  }
  if (m) {
    const parts = [m[1], m[2], m[3], m[4]].map((s) => Number.parseInt(s as string, 16))
    if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)) {
      return parts.join('.')
    }
  }
  const m2 = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail)
  if (m2) {
    const hi = Number.parseInt(m2[1] as string, 16)
    const lo = Number.parseInt(m2[2] as string, 16)
    if (hi >= 0 && lo >= 0 && hi <= 0xffff && lo <= 0xffff) {
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
    }
  }
  return null
}

export function isPrivateIPv6(hostname: string): boolean {
  let normalized = hostname.toLowerCase()
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1)
  }
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true
  const stripped = normalized.split('%')[0]!
  if (!stripped.includes(':')) return false
  if (stripped.startsWith('fc') || stripped.startsWith('fd')) return true
  if (stripped.startsWith('fe8') || stripped.startsWith('fe9') || stripped.startsWith('fea') || stripped.startsWith('feb')) {
    return true
  }
  const mapped = extractMappedIPv4(hostname)
  if (mapped !== null) {
    return isPrivateIPv4(mapped)
  }
  return false
}

export function isPrivateAddress(hostname: string): boolean {
  return isLocalHostname(hostname) || isPrivateIPv4(hostname) || isPrivateIPv6(hostname)
}

export function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost') return true
  if (lower.endsWith('.localhost')) return true
  if (lower === 'localhost.localdomain') return true
  return false
}

export interface ResolvedAddress {
  readonly hostname: string
  readonly address: string
  readonly family: 4 | 6
}

export type ResolveHostname = (hostname: string) => Promise<ResolvedAddress[]>

const defaultResolver: ResolveHostname = async () => {
  throw new ColorExtractorError(
    'COLOR_EXTRACTOR_DECODE_FAILED',
    'No DNS resolver was provided. Pass a resolver in the security boundary call site.',
  )
}

export function assertPublicHostnameSync(
  parsed: ParsedRemoteUrl,
  options: Pick<RemoteOptions, 'allowPrivateNetworks'>,
): void {
  if (options.allowPrivateNetworks) return
  const host = parsed.hostname
  if (isLocalHostname(host)) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSAFE_URL',
      `Hostname "${host}" resolves to a local address and is blocked by default. Set remote.allowPrivateNetworks to permit it.`,
      { cause: { hostname: host } },
    )
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSAFE_URL',
      `Hostname "${host}" is a private network address and is blocked by default. Set remote.allowPrivateNetworks to permit it.`,
      { cause: { hostname: host, ipv4Mapped: extractMappedIPv4(host) } },
    )
  }
}

export async function assertPublicHostname(
  parsed: ParsedRemoteUrl,
  options: Pick<RemoteOptions, 'allowPrivateNetworks'>,
  resolver: ResolveHostname = defaultResolver,
): Promise<void> {
  assertPublicHostnameSync(parsed, options)
  if (options.allowPrivateNetworks) return
  const host = parsed.hostname
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return
  if (host.includes(':')) return
  let resolved: ResolvedAddress[]
  try {
    resolved = await resolver(host)
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSAFE_URL',
      `Could not resolve hostname "${host}" for safety check.`,
      { cause: err },
    )
  }
  for (const entry of resolved) {
    if (isLocalHostname(entry.address)) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSAFE_URL',
        `Hostname "${host}" resolves to a local address (${entry.address}) and is blocked by default.`,
        { cause: { hostname: host, address: entry.address } },
      )
    }
    if (entry.family === 4 && isPrivateIPv4(entry.address)) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSAFE_URL',
        `Hostname "${host}" resolves to a private IPv4 address (${entry.address}) and is blocked by default.`,
        { cause: { hostname: host, address: entry.address } },
      )
    }
    if (entry.family === 6 && isPrivateIPv6(entry.address)) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSAFE_URL',
        `Hostname "${host}" resolves to a private IPv6 address (${entry.address}) and is blocked by default.`,
        { cause: { hostname: host, address: entry.address } },
      )
    }
  }
}
