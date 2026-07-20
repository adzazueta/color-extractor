# Changesets

Changelogs and version bumps are managed with [Changesets](https://github.com/changesets/changesets).

## How to add a changeset

When working on a feature branch, run:

```bash
pnpm changeset
```

Select the semver bump type and write a summary. Commit the generated `.md` file and include it in your pull request.

## How releases work

1. A PR with a changeset file merges into `develop`.
2. A `release/*` branch is cut from `develop` and pushed.
3. Merge `develop` into the release branch via PR. The `Release` workflow:
   - Consumes pending changesets with `pnpm changeset version`.
   - Synchronizes the generated version with `pnpm sync-version`.
   - Runs full validation (lint, typecheck, test, build, smoke, fixtures).
   - Commits the validated state.
   - Publishes to npm with `pnpm changeset publish`.
   - Tags the release and creates a GitHub Release.
   - Opens a PR to merge the release branch into `main`.
4. After the release PR merges to `main`, the `Backmerge` workflow opens a `main` → `develop` PR to synchronize version, changelog, generated files, and consumed changesets.
