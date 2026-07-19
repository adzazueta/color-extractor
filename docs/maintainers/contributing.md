# Contributing

## Local checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
```

Run all checks before opening a pull request. The pre-commit hook formats staged JavaScript and TypeScript with Biome, runs related tests, and type-checks the project.

## Documentation

Update the user-facing README when installation, common usage, or supported inputs change. Keep detailed reference material in `docs/` and release instructions in `docs/maintainers/`.

## Changesets

Add a changeset for publishable changes:

```sh
pnpm changeset
```
