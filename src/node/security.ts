import { ColorExtractorError } from '../core/errors.js';
import type { RemoteOptions } from '../core/options.js';

const DEFAULT_ALLOWED_PROTOCOLS: readonly string[] = ['http:', 'https:'];

export interface ParsedRemoteUrl {
    readonly href: string;
    readonly protocol: string;
    readonly hostname: string;
    readonly port: string;
    readonly pathname: string;
}

export function parseRemoteUrl(href: string): ParsedRemoteUrl {
    let url: URL;
    try {
        url = new URL(href);
    } catch (err) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSAFE_URL',
            `Could not parse the remote URL: ${href}`,
            { cause: err },
        );
    }
    return {
        href: url.href,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
    };
}

export function assertAllowedProtocol(
    href: string,
    allowed: readonly string[] = DEFAULT_ALLOWED_PROTOCOLS,
): ParsedRemoteUrl {
    const parsed = parseRemoteUrl(href);
    if (!allowed.includes(parsed.protocol)) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSAFE_URL',
            `URL protocol "${parsed.protocol}" is not allowed. Allowed protocols: ${allowed.join(', ')}.`,
            { cause: { href, protocol: parsed.protocol, allowed } },
        );
    }
    return parsed;
}

export function validateRemoteProtocol(
    href: string,
    options?: Pick<RemoteOptions, 'allowedProtocols'>,
): ParsedRemoteUrl {
    const allowed = options?.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS;
    if (allowed.length === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSAFE_URL',
            'No allowed protocols are configured. Configure remote.allowedProtocols to permit at least one protocol.',
            { cause: { href, allowed } },
        );
    }
    return assertAllowedProtocol(href, allowed);
}
