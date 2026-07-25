# Changesets

Changelogs and version bumps are managed with [Changesets](https://github.com/changesets/changesets).

## How to add a changeset

When working on a feature branch, run:

```bash
pnpm changeset
```

Select the semver bump type and write a summary. Commit the generated `.md` file and include it in your pull request to `main`.

## How releases work

1. A PR with a changeset file merges into `main`.
2. A `release/v0.3` branch is cut from `main`.
3. From the GitHub Actions UI, run the **Release** workflow manually on that release branch:
    - Select `release/v0.3` as the branch.
    - Choose `prerelease` or `stable`; selecting `prerelease` initializes the `next` Changesets channel when needed.
4. The workflow:
   - Validates branch name and ancestry.
   - Consumes pending changesets with `pnpm changeset version`.
   - For the stable release, forces the generated version to `0.3.0`.
   - Synchronizes the generated version with `pnpm sync-version`.
   - Validates the version matches the release branch target and suffix rules.
   - Runs full validation (lint, typecheck, test, build, smoke, fixtures).
   - Commits the validated state to the release branch.
   - Publishes to npm with `pnpm changeset publish`.
   - Tags the release and creates a GitHub Release.
   - Opens a PR to merge the release branch into `main`.
5. Merge the release PR into `main` using **Create a merge commit** (not squash).
6. Delete the release branch after merging.
