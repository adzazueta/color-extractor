import { describe, expect, it } from 'vitest';
import type { ColorExtractorError } from '../../src/core/errors.js';
import {
    assertAllowedProtocol,
    parseRemoteUrl,
    validateRemoteProtocol,
} from '../../src/node/security.js';

function expectUnsafeUrl(fn: () => unknown): void {
    try {
        fn();
        expect.fail('expected throw');
    } catch (e) {
        expect((e as ColorExtractorError).code).toBe(
            'COLOR_EXTRACTOR_UNSAFE_URL',
        );
    }
}

describe('validateRemoteProtocol (ADZ-62)', () => {
    describe('AC: http and https are allowed by default', () => {
        it('accepts https://', () => {
            const r = validateRemoteProtocol('https://example.com/image.png');
            expect(r.protocol).toBe('https:');
        });

        it('accepts http://', () => {
            const r = validateRemoteProtocol('http://example.com/image.png');
            expect(r.protocol).toBe('http:');
        });
    });

    describe('AC: unsupported protocols are rejected with COLOR_EXTRACTOR_UNSAFE_URL', () => {
        it('rejects file://', () => {
            expectUnsafeUrl(() => validateRemoteProtocol('file:///etc/passwd'));
        });

        it('rejects ftp://', () => {
            expectUnsafeUrl(() =>
                validateRemoteProtocol('ftp://example.com/image.png'),
            );
        });

        it('rejects data: URLs', () => {
            expectUnsafeUrl(() =>
                validateRemoteProtocol('data:image/png;base64,AAAA'),
            );
        });

        it('rejects javascript: URLs', () => {
            expectUnsafeUrl(() =>
                validateRemoteProtocol('javascript:alert(1)'),
            );
        });
    });

    describe('AC: custom allowedProtocols is honored', () => {
        it('accepts only https when configured', () => {
            expectUnsafeUrl(() =>
                validateRemoteProtocol('http://x.com', {
                    allowedProtocols: ['https:'],
                }),
            );
            expect(
                validateRemoteProtocol('https://x.com', {
                    allowedProtocols: ['https:'],
                }),
            ).toBeDefined();
        });

        it('accepts multiple custom protocols', () => {
            const r = validateRemoteProtocol('ws://x.com', {
                allowedProtocols: ['http:', 'https:', 'ws:'],
            });
            expect(r.protocol).toBe('ws:');
        });
    });

    describe('AC: empty allowedProtocols list is rejected', () => {
        it('throws when no protocols are allowed', () => {
            expectUnsafeUrl(() =>
                validateRemoteProtocol('https://x.com', {
                    allowedProtocols: [],
                }),
            );
        });
    });

    describe('AC: invalid URLs are rejected', () => {
        it('throws COLOR_EXTRACTOR_UNSAFE_URL for an unparseable URL', () => {
            expectUnsafeUrl(() => validateRemoteProtocol('not a url at all'));
        });

        it('throws for a URL missing the host', () => {
            expectUnsafeUrl(() => validateRemoteProtocol('https://'));
        });
    });

    describe('AC: error message names the offending protocol and the allowed list', () => {
        it('mentions both the rejected protocol and the allowed list', () => {
            try {
                validateRemoteProtocol('file:///etc/passwd', {
                    allowedProtocols: ['http:', 'https:'],
                });
                expect.fail('expected throw');
            } catch (e) {
                expect((e as Error).message).toMatch(/file:/);
                expect((e as Error).message).toMatch(/http:/);
                expect((e as Error).message).toMatch(/https:/);
            }
        });
    });
});

describe('assertAllowedProtocol (ADZ-62)', () => {
    it('returns the parsed URL for allowed protocols', () => {
        const r = assertAllowedProtocol('https://example.com:8080/a/b.png', [
            'https:',
        ]);
        expect(r.protocol).toBe('https:');
        expect(r.hostname).toBe('example.com');
        expect(r.port).toBe('8080');
        expect(r.pathname).toBe('/a/b.png');
    });

    it('throws for disallowed protocols without defaults', () => {
        expectUnsafeUrl(() => assertAllowedProtocol('file:///x', ['https:']));
    });
});

describe('parseRemoteUrl (ADZ-62)', () => {
    it('returns protocol, hostname, port, pathname, and href', () => {
        const r = parseRemoteUrl('https://example.com:443/p.png?q=1');
        expect(r.protocol).toBe('https:');
        expect(r.hostname).toBe('example.com');
        expect(r.pathname).toBe('/p.png');
    });
});
