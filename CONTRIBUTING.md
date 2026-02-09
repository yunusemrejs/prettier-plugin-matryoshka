# Contributing Guide

Thanks for contributing to `prettier-plugin-matryoshka`.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies:
   - `npm install`
3. Run checks:
   - `npm run format:check`
   - `npm test`

## Branch and PR Workflow

1. Create a feature branch from `main`.
2. Keep commits focused and small.
3. Ensure tests and formatting pass before opening a PR.
4. Open a pull request with:
   - problem statement
   - proposed solution
   - test coverage notes
   - breaking change notes (if any)

## Commit Guidance

Conventional Commit style is preferred:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `test: ...`
- `refactor: ...`
- `chore: ...`

## Code Expectations

- Preserve recursive behavior and parser-dynamic dispatch.
- Add tests for behavior changes.
- Keep error messages actionable for users.
- Keep `README.md` and `llms.txt` in sync with new capabilities.

## Reporting Issues

Use GitHub Issues and choose the relevant template:

- Bug report
- Feature request
- Security issue (see `SECURITY.md`)
