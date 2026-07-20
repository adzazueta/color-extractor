# Contributing to @adzazueta/color-extractor

Thank you for your interest in this project. The source code is public for transparency, inspection, learning, and to make it possible for users to report issues accurately.

## Project scope

`@adzazueta/color-extractor` extracts perceptually meaningful colors from images in browser, Node.js, and runtime-independent core environments.

The package is responsible for image and pixel input handling, sampling, filtering, color-space conversion, color extraction algorithms, deterministic scoring, result formatting, runtime-specific adapters, and package-level error handling.

Feature requests should remain directly related to extracting, describing, ranking, or returning colors observed in image or pixel data.

## Current contribution model

Only the project maintainer currently opens and merges pull requests.

Please do not invest time in an implementation expecting it to be merged unless the maintainer has explicitly requested the work. You are welcome to open an issue to report a problem, propose an improvement, provide technical context, or discuss a possible change before preparing code.

This policy may evolve as project governance and maintenance capacity mature.

## Before opening an issue

* Check the installed package version:

  ```sh
  npm list @adzazueta/color-extractor
  ```

* Review the README and the documented error codes for known behavior and failure modes.

* Search existing issues for the same concern.

* Determine which runtime the issue affects: browser, Node.js, core, or multiple runtimes.

* Reduce the problem to the smallest reproducible example whenever possible.

## Reporting bugs

Please include:

* Installed package version.
* Runtime and version, such as Node.js version or browser name and version.
* Bundler name and version when applicable.
* Public entrypoint used: root, `./browser`, `./node`, or `./core`.
* Input category, such as File, Blob, URL, Buffer, local path, ImageData, or pixel data.
* A minimal reproduction. Prefer a code snippet that demonstrates the issue without attaching sensitive images.
* Expected behavior.
* Actual behavior.
* `ColorExtractorError.code` when available.
* Stack trace or logs with secrets, credentials, private URLs, and personal data removed.

When the issue depends on a particular image, describe its relevant characteristics first. Only share the file when it contains no sensitive, proprietary, or personal information and you have the right to distribute it.

## Requesting features

Please include:

* The problem you are trying to solve.
* The proposed behavior or API surface.
* Why the existing options, entrypoints, result fields, or output flags are insufficient.
* The affected runtime or entrypoint.
* Expected input and output behavior.
* Compatibility implications for existing users.
* Any relevant performance, determinism, security, or package-size considerations.

Feature requests are evaluated against the package scope, public API stability, runtime boundaries, maintenance cost, and project roadmap.

Requests unrelated to extracting or describing colors from image or pixel data may be considered outside the scope of this package.

## Documentation feedback

Documentation feedback is welcome, including:

* Stale or incorrect examples.
* Broken links or missing references.
* Ambiguous API, input, output, option, or error documentation.
* Migration gaps between published versions.
* Runtime-specific confusion.
* Differences between declarations, README examples, and actual package behavior.

The public repository documentation must be self-contained. It must not depend on private planning systems or internal documentation.

## Security vulnerabilities

Do not report exploitable security vulnerabilities in a public issue.

Use the repository's private vulnerability-reporting channel or the private contact method documented in the repository's security policy.

Reports should include:

* A description of the vulnerability.
* The affected package version and runtime.
* Reproduction steps or a proof of concept.
* Expected impact.
* Any known mitigations.
* Whether the issue has been disclosed elsewhere.

Do not include real credentials, tokens, private user data, or unnecessary sensitive files.

## Development conventions

This section documents the conventions followed by the maintainer. It is informational for external users and contributors.

* **ESM-only package**: The package uses `"type": "module"`. Internal relative imports follow the repository's established `.js` extension convention.
* **Supported Node.js range**: Defined in `package.json` under `engines.node` and enforced in CI.
* **Dependency installation**: Use `pnpm install --frozen-lockfile` for reproducible installs.
* **Formatting and linting**: `pnpm lint` runs the configured Biome checks. Run `pnpm lint:fix` before committing maintainer changes.
* **TypeScript**: `pnpm typecheck` runs `tsc --noEmit`. Public API surfaces must remain fully typed.
* **Testing**: `pnpm test` runs the configured Vitest suites. Runtime-specific tests are organized under the repository's browser, Node.js, core, and package test areas.
* **Building**: `pnpm build` runs the repository's version synchronization, package build, and build-warning checks.
* **Runtime boundaries**: Browser, Node.js, and core are separate entrypoints. Node.js built-ins and `sharp` must not reach browser or core output.
* **Deterministic behavior**: Tests should use local fixtures, generated pixel data, and controlled runtime mocks. Avoid network-dependent and nondeterministic tests.
* **Generated files**: Generated source files must be updated through their owning scripts rather than edited manually.
* **Public contract changes**: Do not change public APIs, defaults, result shapes, error codes, package exports, or observable algorithm behavior without an approved project task.
* **No secrets or proprietary fixtures**: Do not commit credentials, tokens, private URLs, proprietary images, unlicensed fixtures, personal data, or internal documentation.
* **Package verification**: Changes affecting exports, declarations, runtime boundaries, or packaging must be verified against the packed tarball rather than repository source alone.

Exact commands should always be confirmed against the current `package.json` scripts.

## Pull request policy

This repository does not currently accept unsolicited external pull requests.

If you want to experiment with the code or prepare a suggested change, you must do so from your own fork. Do not create branches directly in this repository unless you have been explicitly authorized by the maintainer.

Before preparing code, open an issue describing the problem or proposed change.

A fork, suggested patch, code snippet, issue, discussion, or proposed implementation does not guarantee review, implementation, or inclusion.

Do not open a pull request unless the maintainer has explicitly requested the contribution.

Pull requests are opened and merged only through authorized maintainer workflows under the protected-branch policy.

## Branch and release governance

* Direct pushes to the `main` branch are prohibited by branch protection.
* Feature work merges through `feature/*` into `develop`; release candidates are cut as `release/*` from `develop`.
* Published release metadata is synchronized back through a reviewed `main` -> `develop` pull request.
* Changes reach `main` through reviewed pull requests.
* Required status checks must pass before merge.
* Only authorized maintainer workflows may merge changes.
* Release artifacts are produced from verified commits.
* Published packages must pass the repository's tests, build checks, runtime-boundary checks, and packed-consumer verification.
* No contributor may bypass repository security, CI, branch protection, or release gates.
* Repository visibility does not change merge permissions or contribution policy.

## Code of conduct

Be respectful, constructive, and inclusive.

Harassment, personal attacks, discriminatory behavior, intimidation, deliberate disruption, and other unprofessional conduct will not be tolerated.

Technical disagreement is welcome when it remains focused on the work and is communicated respectfully.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file.

By submitting content to this repository, including issues, comments, suggestions, reproduction code, or code snippets, you confirm that you have the right to share it and that it may be used under the project's license.

Do not submit third-party code, images, datasets, or other materials unless their license permits their use in this project.

## Policy evolution

This contribution policy may be updated as project governance and maintenance capacity mature.

Significant changes to contribution permissions, pull request acceptance, security reporting, or repository governance will be reflected in this file.
