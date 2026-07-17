# Release Process

## Prepare a release

1. Add changesets for publishable changes.
2. Update the version with the Changesets workflow.
3. Review the generated changelog and package metadata.

## Validate

```sh
pnpm lint
pnpm build
pnpm test
pnpm typecheck
pnpm test:smoke
npm pack --dry-run
```

Confirm that the tarball contains `dist/`, `README.md`, `LICENSE`, and `package.json`, but not source, tests, or development tooling.

## Publish

```sh
pnpm release
```

Publishing requires npm credentials with permission for `@adzazueta/color-extractor`.
