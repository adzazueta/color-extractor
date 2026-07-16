import { describe, it, expect } from 'vitest'
import { ColorExtractorError } from '../../src/core/errors.js'
import { parseRemoteUrl } from '../../src/node/security.js'
import {
  assertPublicHostname,
  assertPublicHostnameSync,
  isLocalHostname,
  isPrivateIPv4,
  isPrivateIPv6,
  type ResolvedAddress,
  type ResolveHostname,
} from '../../src/node/security-private.js'

function expectUnsafeCode(fn: () => unknown, code: string = 'COLOR_EXTRACTOR_UNSAFE_URL'): void {
  try {
    fn()
    expect.fail('expected throw')
  } catch (e) {
    expect((e as ColorExtractorError).code).toBe(code)
  }
}

function fixedResolver(entries: ResolvedAddress[]): ResolveHostname {
  return async (hostname: string) => {
    void hostname
    return entries
  }
}

describe('isPrivateIPv4 (ADZ-73)', () => {
  it('flags 127.0.0.1 as private (loopback)', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true)
  })

  it('flags 10.0.0.1 as private (RFC1918)', () => {
    expect(isPrivateIPv4('10.0.0.1')).toBe(true)
  })

  it('flags 172.16.0.1 as private (RFC1918)', () => {
    expect(isPrivateIPv4('172.16.0.1')).toBe(true)
  })

  it('flags 192.168.1.1 as private (RFC1918)', () => {
    expect(isPrivateIPv4('192.168.1.1')).toBe(true)
  })

  it('flags 169.254.1.1 as private (link-local)', () => {
    expect(isPrivateIPv4('169.254.1.1')).toBe(true)
  })

  it('flags 169.254.169.254 as private (cloud metadata)', () => {
    expect(isPrivateIPv4('169.254.169.254')).toBe(true)
  })

  it('flags 100.64.0.1 as private (CGNAT)', () => {
    expect(isPrivateIPv4('100.64.0.1')).toBe(true)
  })

  it('flags 0.0.0.0 as private (review #1)', () => {
    expect(isPrivateIPv4('0.0.0.0')).toBe(true)
  })

  it('does not flag 8.8.8.8 as private', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false)
  })

  it('does not flag 1.1.1.1 as private', () => {
    expect(isPrivateIPv4('1.1.1.1')).toBe(false)
  })
})

describe('isPrivateIPv6 (ADZ-73)', () => {
  it('flags ::1 as private (loopback)', () => {
    expect(isPrivateIPv6('::1')).toBe(true)
  })

  it('flags fc00::1 as private (ULA)', () => {
    expect(isPrivateIPv6('fc00::1')).toBe(true)
  })

  it('flags fe80::1 as private (link-local)', () => {
    expect(isPrivateIPv6('fe80::1')).toBe(true)
  })

  it('flags :: as private (unspecified, review #1)', () => {
    expect(isPrivateIPv6('::')).toBe(true)
  })

  it('flags 0:0:0:0:0:0:0:0 as private (unspecified expanded)', () => {
    expect(isPrivateIPv6('0:0:0:0:0:0:0:0')).toBe(true)
  })

  it('flags ::ffff:127.0.0.1 as private (IPv4-mapped loopback, review #1)', () => {
    expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true)
  })

  it('flags ::ffff:169.254.169.254 as private (IPv4-mapped metadata, review #1)', () => {
    expect(isPrivateIPv6('::ffff:169.254.169.254')).toBe(true)
  })

  it('flags ::ffff:10.0.0.1 as private (IPv4-mapped RFC1918)', () => {
    expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true)
  })

  it('flags ::ffff:7f7f:1 as private (IPv4-mapped hex format)', () => {
    expect(isPrivateIPv6('::ffff:7f7f:1')).toBe(true)
  })

  it('flags [::ffff:127.0.0.1] (bracket form)', () => {
    expect(isPrivateIPv6('[::ffff:127.0.0.1]')).toBe(true)
  })

  it('flags ::ffff:8.8.8.8 as private (does not whitelist public IPv4-mapped)', () => {
    // 8.8.8.8 is not private, so this should NOT be flagged.
    expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false)
  })

  it('does not flag 2001:4860:4860::8888 as private', () => {
    expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false)
  })
})

describe('isLocalHostname (ADZ-73)', () => {
  it('flags "localhost"', () => {
    expect(isLocalHostname('localhost')).toBe(true)
  })

  it('flags "my.localhost"', () => {
    expect(isLocalHostname('my.localhost')).toBe(true)
  })

  it('does not flag "example.com"', () => {
    expect(isLocalHostname('example.com')).toBe(false)
  })
})

describe('assertPublicHostnameSync (ADZ-73)', () => {
  describe('AC: a URL pointing to 127.0.0.1 is blocked by default', () => {
    it('blocks https://127.0.0.1/x.png', () => {
      const parsed = parseRemoteUrl('https://127.0.0.1/x.png')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })
  })

  describe('AC: private IP literals are blocked by default', () => {
    it('blocks 10.0.0.1', () => {
      const parsed = parseRemoteUrl('http://10.0.0.1')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })

    it('blocks 192.168.1.1', () => {
      const parsed = parseRemoteUrl('http://192.168.1.1')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })

    it('blocks 169.254.169.254 (cloud metadata)', () => {
      const parsed = parseRemoteUrl('http://169.254.169.254/latest/meta-data/')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })

    it('blocks ::1 (IPv6 loopback)', () => {
      const parsed = parseRemoteUrl('http://[::1]/')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })
  })

  describe('AC: review #1 — IPv4-mapped IPv6 and unspecified addresses are blocked', () => {
    it('blocks ::ffff:127.0.0.1', () => {
      const parsed = parseRemoteUrl('http://[::ffff:127.0.0.1]/')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })

    it('blocks ::ffff:169.254.169.254 (cloud metadata via IPv4-mapped)', () => {
      const parsed = parseRemoteUrl('http://[::ffff:169.254.169.254]/')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })

    it('blocks :: (unspecified)', () => {
      const parsed = parseRemoteUrl('http://[::]/')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })

    it('blocks 0.0.0.0', () => {
      const parsed = parseRemoteUrl('http://0.0.0.0/')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })
  })

  describe('AC: localhost hostname is blocked by default', () => {
    it('blocks "localhost"', () => {
      const parsed = parseRemoteUrl('http://localhost/x')
      expectUnsafeCode(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: false }))
    })
  })

  describe('AC: allowPrivateNetworks=true disables the check', () => {
    it('permits 127.0.0.1 when explicitly allowed', () => {
      const parsed = parseRemoteUrl('https://127.0.0.1')
      expect(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: true })).not.toThrow()
    })

    it('permits "localhost" when explicitly allowed', () => {
      const parsed = parseRemoteUrl('http://localhost/')
      expect(() => assertPublicHostnameSync(parsed, { allowPrivateNetworks: true })).not.toThrow()
    })
  })
})

describe('assertPublicHostname async (ADZ-73)', () => {
  describe('AC: a hostname that resolves to a private IP is blocked', () => {
    it('blocks when the resolver returns 127.0.0.1', async () => {
      const parsed = parseRemoteUrl('https://attacker.example.com/x.png')
      let threw = false
      try {
        await assertPublicHostname(
          parsed,
          { allowPrivateNetworks: false },
          fixedResolver([{ hostname: 'attacker.example.com', address: '127.0.0.1', family: 4 }]),
        )
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
        expect((e as Error).message).toMatch(/attacker.example.com/)
        expect((e as Error).message).toMatch(/127\.0\.0\.1/)
      }
      expect(threw).toBe(true)
    })

    it('blocks when the resolver returns a private IPv6', async () => {
      const parsed = parseRemoteUrl('https://attacker.example.com/x.png')
      let threw = false
      try {
        await assertPublicHostname(
          parsed,
          { allowPrivateNetworks: false },
          fixedResolver([{ hostname: 'attacker.example.com', address: 'fc00::1', family: 6 }]),
        )
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })

    it('passes when the resolver returns public IPs', async () => {
      const parsed = parseRemoteUrl('https://example.com/x.png')
      await assertPublicHostname(
        parsed,
        { allowPrivateNetworks: false },
        fixedResolver([{ hostname: 'example.com', address: '93.184.216.34', family: 4 }]),
      )
    })
  })

  describe('AC: resolver failures are converted to typed errors', () => {
    it('rejects when the resolver throws', async () => {
      const parsed = parseRemoteUrl('https://no-such-host.test/x.png')
      let threw = false
      try {
        await assertPublicHostname(parsed, { allowPrivateNetworks: false }, async () => {
          throw new Error('ENOTFOUND')
        })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
        expect((e as Error).message).toMatch(/Could not resolve/)
      }
      expect(threw).toBe(true)
    })
  })
})
