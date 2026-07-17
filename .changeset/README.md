# Changesets

Changelogs and version bumps are managed with [Changesets](https://github.com/changesets/changesets).

## How to add a changeset

When working on a feature branch, run:

```bash
pnpm changeset
```

Select the semver bump type and write a summary. Commit the generated `.md` file and include it in your pull request.

## How releases work

1. A PR with a changeset file merges to `main`.
2. The `Release` workflow creates or updates a "Version Packages" PR.
3. When that PR merges, the workflow bumps the version, updates `CHANGELOG.md`, creates a git tag, and publishes to npm.
