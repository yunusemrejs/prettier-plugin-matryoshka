# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic
Versioning.

## [Unreleased]

## [0.1.1] - 2026-02-09

### Fixed

- Preserved nested marker integrity when outer parser formatting mutates
  embedded block markers.
- Added syntax-safe fallback when nested marker structure changes after format.
- Preserved closing-tag line endings in rendered blocks to avoid marker/content
  concatenation in fallback flows.
- Expanded tests for nested marker mutation and invalid-close edge cases.

## [0.1.0] - 2026-02-09

### Added

- Recursive stack-based parser for `:::parser` / `:::endparser` block syntax.
- Dynamic embedded parser dispatch with graceful fallback when parsers are unavailable.
- Parser-specific option overrides via `matryoshkaParserOverrides`.
- Diagnostic logging controls (`matryoshkaLogLevel`, `matryoshkaLogPrefix`).
- Vitest test suite with 100% coverage thresholds and nested formatting snapshots.
- GitHub Actions CI workflow with coverage artifact upload.
- Open source governance docs (`LICENSE`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`).
- GitHub issue and pull request templates.
