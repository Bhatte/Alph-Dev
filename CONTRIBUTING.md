# Contributing to Alph CLI
Thanks for helping make MCP configuration safer and easier!

## Quick start
- **Node:** 18+  
- **Install deps:** `npm ci`  
- **Build:** `npm run build`  
- **Test:** `npm test` (add `:watch` for watch mode)  
- **Lint/format:** `npm run lint && npm run format`

## Project structure
- `src/` TypeScript sources (detectors, planners, writers, validators)
- `tests/` Jest test suite
- `assets/` images and demo GIF

## Running locally
```bash
npm ci
npm run dev        # watch mode
npm run typecheck  # TS checks
npm test           # run unit tests
```

## Making changes
- Create a topic branch from `main`.
- Add/modify tests for your change.
- Ensure `npm run lint` and `npm test` pass.
- Update docs (`README.md`, `USER_GUIDE.md`, etc.) as needed.

## Commit style & releases
- We use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`).
- Releases are automated (semantic-release) when CI passes on `main`.

## Pull request checklist
- Tests added/updated
- Docs updated (README or guides)
- `npm run lint` passes
- No cleartext secrets in tests or logs (tokens must be redacted)

## Adding a new agent
- Document config file locations per OS
- Implement detector + planner + writer + validator
- Add E2E test for `--dry-run` diff and rollback

## Security
Alph is local-first; please report security concerns via `SECURITY.md`.
