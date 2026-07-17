import http, { type RequestOptions as HttpReqOptions } from 'node:http'
import https from 'node:https'
import { ColorExtractorError } from '../core/errors.js'
import { isPrivateAddress } from './security-private.js'

export type ResolveAndFetch = (
  url: string,
  signal: AbortSignal,
  hostOptions?: { allowPrivateNetworks?: boolean },
) => Promise<Response>

export type LookupFunction = (
  hostname: string,
  options: { all: true } & { signal?: AbortSignal },
) => Promise<Array<{ address: string; family: number }>>

const HOP_BY_HOP = new Set([
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'upgrade',
])

const defaultLookup: LookupFunction = async (hostname, options) => {
  const { lookup } = await import('node:dns/promises')
  return lookup(hostname, options)
}

export interface CreateResolveAndFetchOptions {
  readonly lookup?: LookupFunction
  readonly allowPrivateNetworks?: boolean
}

function isIPv4(s: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)
}

function isIPv6(s: string): boolean {
  return s.includes(':')
}

function stripIPv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1)
  }
  return hostname
}

function toResponseHeaders(
  incoming: Record<string, string | string[] | undefined>,
): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(incoming)) {
    if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== undefined) headers.append(key, v)
      }
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

function lookupWithAbortSignal(
  lookupFn: LookupFunction,
  hostname: string,
  signal: AbortSignal,
): Promise<Array<{ address: string; family: number }>> {
  if (signal.aborted) {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    return Promise.reject(err)
  }

  return new Promise((resolveLookup, reject) => {
    const onAbort = (): void => {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      reject(err)
    }

    signal.addEventListener('abort', onAbort, { once: true })

    lookupFn(hostname, { all: true, signal }).then(
      (result) => {
        signal.removeEventListener('abort', onAbort)
        resolveLookup(result)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

export function createResolveAndFetch(
  options: CreateResolveAndFetchOptions = {},
): ResolveAndFetch {
  const lookup = options.lookup ?? defaultLookup
  const allowPrivateNetworks = options.allowPrivateNetworks ?? false

  return async (url: string, signal: AbortSignal, hostOptions?: { allowPrivateNetworks?: boolean }): Promise<Response> => {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname
    const privateOk = hostOptions?.allowPrivateNetworks ?? allowPrivateNetworks

    let addresses: Array<{ address: string; family: number }>
    if (isIPv4(hostname) || isIPv6(hostname)) {
      if (!privateOk && isPrivateAddress(hostname)) {
        throw new ColorExtractorError(
          'COLOR_EXTRACTOR_UNSAFE_URL',
          `Hostname "${hostname}" is a private network address and is blocked.`,
          { cause: { hostname } },
        )
      }
      addresses = [{ address: hostname, family: isIPv4(hostname) ? 4 : 6 }]
    } else {
      addresses = await lookupWithAbortSignal(lookup, hostname, signal)
    }

    if (addresses.length === 0) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSAFE_URL',
        `Hostname "${hostname}" resolved to an empty address list; blocked.`,
        { cause: { hostname } },
      )
    }

    if (!privateOk) {
      for (const entry of addresses) {
        if (isPrivateAddress(entry.address)) {
          throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSAFE_URL',
            `Hostname "${hostname}" resolves to a private address (${entry.address}) and is blocked.`,
            { cause: { hostname, address: entry.address } },
          )
        }
      }
    }

    const rawIp = addresses[0]!.address
    const targetIp = stripIPv6Brackets(rawIp)
    const isHttps = parsedUrl.protocol === 'https:'
    const port = parsedUrl.port ? Number(parsedUrl.port) : isHttps ? 443 : 80
    const path = parsedUrl.pathname + parsedUrl.search

    const httpOptions: Record<string, unknown> = {
      hostname: targetIp,
      port,
      path,
      method: 'GET',
      headers: { Host: hostname, accept: '*/*' },
      signal,
      rejectUnauthorized: true,
    }
    if (isHttps && !isIPv4(hostname) && !isIPv6(hostname)) {
      httpOptions.servername = hostname
    }

    return new Promise<Response>((resolve, reject) => {
      const mod = isHttps ? https : http
      const req = mod.request(httpOptions as HttpReqOptions, (res) => {
        let cancelled = false
        const body = new ReadableStream({
          async pull(controller) {
            if (cancelled) return
            const chunk: Buffer = res.read()
            if (chunk === null) {
              await new Promise<void>((notify) => {
                const onReadable = (): void => { cleanup(); notify() }
                const onEnd = (): void => { cleanup(); notify() }
                const onError = (err: Error): void => { cleanup(); controller.error(err); notify() }
                const cleanup = (): void => {
                  res.off('readable', onReadable)
                  res.off('end', onEnd)
                  res.off('error', onError)
                }
                res.on('readable', onReadable)
                res.on('end', onEnd)
                res.on('error', onError)
              })
              if (cancelled) return
              const next: Buffer = res.read()
              if (next === null) { controller.close(); return }
              controller.enqueue(new Uint8Array(next))
            } else {
              controller.enqueue(new Uint8Array(chunk))
            }
          },
          cancel() {
            cancelled = true
            res.destroy()
            req.destroy()
          },
        })
        const headers = toResponseHeaders(
          res.headers as Record<string, string | string[] | undefined>,
        )
        resolve(
          new Response(body, {
            status: res.statusCode ?? 500,
            statusText: res.statusMessage ?? '',
            headers,
          }),
        )
      })
      req.on('error', reject)
      req.end()
    })
  }
}

export const defaultResolveAndFetch: ResolveAndFetch = createResolveAndFetch()
