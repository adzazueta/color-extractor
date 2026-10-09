# @adzazueta/color-extractor

Repository of the npm package `@adzazueta/color-extractor`. Version 0.4.0 is a complete rewrite and reuses no code from 0.3.

## Commands (Vite+)

- `vp install`: install dependencies.
- `vp check`: format, lint, and type check.
- `vp test`: run tests.
- `vp pack`: build the package.
- `vp dev`: run the lab in `lab/`.

## Branches, pull requests, and releases

- One short branch per task, named with its task key (for example, `ADZE-12-tsconfig`), and a pull request into `next`. Never push to `next` directly.
- Pull request titles start with the task key, for example `ADZE-12 Configure tsconfig.json with TypeScript 7`. With squash merging, the title becomes the commit message.
- A pull request that touches `src/` or `package.json` includes a changeset. Changes that users do not notice use `changeset --empty`. During 0.x, breaking changes are `minor`, never `major`.
- Never merge the "Version Packages" pull request and never publish to npm. Only the maintainer does that.
- Change repository settings (rulesets, environments, Actions, and security features) only after the maintainer confirms exactly what will change.
- Workflows: read-only permissions by default, actions pinned by commit SHA, and no untrusted input, such as a pull request title, inline in a script.

## Rules

- The package specification is the contract. Do not add features that are not in it, and do not change its behavior without a decision from the maintainer. If something is missing, ask.
- ESM only, TypeScript 7 in strict mode with `isolatedDeclarations`, Node 22.12 or later.
- No runtime dependencies. sharp is only an optional dependency of the Node adapter.
- Import from `src/` with the `@/` alias (`@/core/color/oklab.js`), keeping the `.js` extension. Relative imports are fine inside the same folder.
- `/core` uses no DOM, file system, or network.
- Returned colors are always real pixels from the image.
- **Determinism:**
  - No `Math.random`.
  - No `Math.pow`, `Math.cbrt`, `Math.exp`, or `Math.atan2` in calculations that influence a decision: use precomputed tables and custom functions.
  - Comparators with a total order, and iteration in a fixed order.
- Any change that can alter colors, order, coverage, or score changes `algorithmVersion`.
- Never update snapshots to make a test pass. Regenerate them with `vp test -u` only for an intentional algorithm change, which also changes `algorithmVersion`.
- Do not commit third-party images; evaluation images live outside the repository.
- Code, identifiers, comments, commit messages, the README, the changelog, and all documentation are in English.
