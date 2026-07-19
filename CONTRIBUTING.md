# Contributing to @adzazueta/color-extractor

Thank you for your interest in this project. The source code is public for transparency, inspection, learning, and to make it possible for you to report issues accurately.

## Project scope

`@adzazueta/color-extractor` extracts perceptually meaningful primary, secondary, accent, and palette colors from images. It focuses on the extractor responsibility — color space conversion, K-means clustering, chroma-weighted scoring, and role assignment. Broader color science utilities and higher-level composable pipelines belong in `@adzazueta/color-engine`.

## Current contribution model

Only the project maintainer currently opens and merges pull requests. Please do not invest time in an implementation expecting it to be merged unless the maintainer has explicitly requested the work. This policy may evolve as project governance and maintenance capacity mature.

## Before opening an issue

- Check the package version is recent: `npm list @adzazueta/color-extractor`
- Review the README and the error codes table for known failure modes.
- Search existing issues for the same concern.
- Determine which runtime (browser, Node, or core) the issue affects.

## Reporting bugs

Please include:

- Installed package version.
- Runtime and version (Node.js, browser name and version).
- Bundler name and version when applicable.
- Public entrypoint used (root, `./browser`, `./node`, `./core`).
- Input category (File, Blob, URL, Buffer, path, pixel data).
- Minimal reproduction — prefer a code snippet that demonstrates the issue without attaching sensitive images.
- Expected and actual behavior.
- `ColorExtractorError.code` when available.
- Stack trace or logs with secrets, credentials, and personal data removed.

## Requesting features

Please include:

- The consumer problem you are trying to solve.
- Proposed behavior or API surface.
- Why the existing options, entrypoints, or output flags are insufficient.
- Affected runtime or entrypoint.
- Whether the concern belongs to extraction (this package) or broader color-science tooling (`@adzazueta/color-engine`).
- Compatibility implications for existing users.

Feature requests are evaluated against the extractor-only responsibility boundary and the project roadmap.

## Documentation feedback

Documentation feedback is welcome, including:

- Stale or incorrect examples.
- Broken links or missing references.
- Ambiguous API or option contracts.
- Migration gaps between versions.
- Runtime-specific confusion.

## Security vulnerabilities

Do not report exploitable security vulnerabilities in a public issue. Use the repository's private vulnerability reporting channel or contact the maintainer through the private channel documented in the repository's security policy.

## Development conventions

This section documents the conventions the maintainer follows. It is informational for external contributors.

- **ESM-only package**: The package uses `"type": "module"` throughout. All imports use the `.js` extension convention.
- **Supported Node range**: Defined in `package.json` under `engines.node` and enforced in CI.
- **Dependency installation**: Use `pnpm install --frozen-lockfile` for reproducible installs.
- **Formatting and linting**: `pnpm lint` runs Biome. Run `pnpm lint:fix` before committing.
- **TypeScript**: `pnpm typecheck` runs `tsc --noEmit`. No untyped public API surfaces.
- **Testing**: `pnpm test` runs Vitest. Tests for each runtime are in `tests/browser/`, `tests/node/`, `tests/core/`, and `tests/package/`.
- **Building**: `pnpm build` runs `pnpm sync-version`, `tsdown`, and the build-warning policy check.
- **Runtime boundaries**: Browser, Node, and core are separate entrypoints. No Node builtin or `sharp` dependency may reach browser or core output.
- **Deterministic tests**: Tests use local fixtures, generated pixel data, and mocked browser APIs. No network-dependent or non-deterministic tests.
- **Generated files**: `src/generated/version.ts` is produced by `scripts/sync-version.mjs`. Run `pnpm sync-version` after changing `package.json.version`.
- **No secrets or proprietary fixtures**: Do not commit secrets, credentials, proprietary images, unlicensed test fixtures, or private URLs.

## Pull request policy

This repository does not currently accept unsolicited external pull requests. Pull requests are opened and merged by the maintainer under the protected-branch workflow. Please open an issue before preparing code. A public issue, discussion, or suggested patch does not guarantee implementation or inclusion.

## Branch and release governance

- Direct pushes to the `main` branch are prohibited by branch protection.
- Changes reach `main` through reviewed pull requests with required status checks passing.
- Only authorized maintainer workflows may merge.
- Release artifacts are produced from verified commits according to the project's release contract.
- No contributor may bypass repository security, CI, or release gates.

## Code of conduct

Be respectful, constructive, and inclusive. Harassment, personal attacks, and other unprofessional behavior will not be tolerated.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file.

By submitting content to this repository (issues, comments, suggestions, code snippets), you agree that your contributions are provided under the same license.

## Policy evolution

This contribution policy may be updated as project governance and maintenance capacity mature. Significant changes will be reflected in this file.
