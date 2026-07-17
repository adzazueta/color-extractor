# Security

## Browser URLs

Browser requests are governed by CORS. The package does not provide a proxy and cannot bypass browser cross-origin restrictions.

For untrusted uploads, enforce a file-size limit before calling the package. `decode.maxPixels` rejects oversized decoded images, but browser decoders may allocate memory before dimensions are available.

## Node URLs

Node URL inputs use safe defaults:

| Protection | Default |
| --- | --- |
| Request timeout | 10 seconds |
| Response size | 10 MB |
| Redirect limit | 3 |
| Private/reserved network access | Blocked |
| Protocols | `http:` and `https:` |
| Image content type | Validated when available |
| SVG | Disabled |

Do not enable `remote.allowPrivateNetworks` for user-provided URLs. It permits requests to local and private addresses and can introduce SSRF risk.

## SVG

SVG decoding is disabled in Node by default. Enable `decode.svg: 'enabled-in-node'` only for trusted sources.

## Resource limits

`remote.maxBytes` limits encoded URL response bytes. `decode.maxPixels` limits decoded dimensions. These defend different resources; compressed image files can be small while decoding to large pixel buffers.
