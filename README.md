# prettier-plugin-matryoshka

[![CI](https://github.com/yunusemrejs/prettier-plugin-matryoshka/actions/workflows/ci.yml/badge.svg)](https://github.com/yunusemrejs/prettier-plugin-matryoshka/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

When Vue, Twig, HTML, CSS, and template tags collide in one file, formatting turns into spaghetti fast. `prettier-plugin-matryoshka` fixes embedded code formatting with recursive `:::parserName` blocks and dynamic parser dispatch, so nested multi-language files stay consistent, readable, and production-ready.

## Syntax

A block starts with `:::parserName` and ends with `:::endparserName`.

```txt
:::vue
<template>
  <button @click="count++"> {{ count }} </button>
</template>

:::twig
  {# Twig parser #}
  <div> {{ "hello"|capitalize }} </div>
:::endtwig

<script setup>
  const count = ref(0)
</script>
:::endvue
```

## Features

- Stack-based recursive parsing for nested blocks.
- Dynamic parser dispatch from the tag name.
- Global Prettier option inheritance for inner blocks.
- Parser-specific overrides via `matryoshkaParserOverrides`.
- Optional diagnostic logging with configurable verbosity.
- Graceful fallback: if an embedded parser is unavailable, the block body is preserved.
- Syntax safety: mismatched or unclosed tags throw readable parser errors.

> `:::parserName` works with any parser that is available to Prettier (core parser or installed plugin parser).

## Install

```bash
npm install --save-dev prettier prettier-plugin-matryoshka
```

## Usage

Add the plugin and parser:

```json
{
  "plugins": ["prettier-plugin-matryoshka"],
  "parser": "matryoshka"
}
```

### Parser-specific overrides

`matryoshkaParserOverrides` is merged on top of global options for each embedded parser.

JSON config (object form):

```json
{
  "tabWidth": 2,
  "matryoshkaParserOverrides": {
    "python": {
      "tabWidth": 4
    }
  }
}
```

JS config:

```js
/** @type {import("prettier").Config} */
export default {
  tabWidth: 2,
  matryoshkaParserOverrides: {
    python: {
      tabWidth: 4,
    },
  },
};
```

In this setup, `:::python` blocks format with `tabWidth: 4`, while other blocks keep global `tabWidth: 2`.

### Diagnostic logging

Use logging options to troubleshoot parser dispatch and fallback behavior.

```json
{
  "matryoshkaLogLevel": "debug",
  "matryoshkaLogPrefix": "[matryoshka]"
}
```

- `matryoshkaLogLevel`: `silent` (default), `error`, `warn`, `info`, `debug`
- `matryoshkaLogPrefix`: custom log prefix text

Logs are written to `stderr` so formatted output on `stdout` remains clean.

## Development

```bash
npm install
npm test
npm run test:watch
npm run format:check
```

## Release

For maintainers:

1. Ensure `package.json` version and `CHANGELOG.md` are updated.
2. Run release checks locally: `npm run release:check`.
3. Create and push a version tag:
   - `git tag -a v0.1.0 -m "Release v0.1.0"`
   - `git push origin v0.1.0`

On tag push, GitHub Actions runs `.github/workflows/release.yml` to validate,
publish to npm, and create a GitHub Release. Set `NPM_TOKEN` in repository
secrets before tagging.

## Open Source Standards

- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
- Changelog: `CHANGELOG.md`
- License: `LICENSE`

## FAQ / Troubleshooting

### How do I format nested code blocks in Prettier?

Use `parser: "matryoshka"` and wrap each embedded segment with `:::parserName` and `:::endparserName`. The plugin parses blocks with a stack and formats inner blocks first, then outer blocks.

### How do I fix indentation for Twig inside Vue?

Wrap Twig as its own block inside Vue:

```txt
:::vue
<template>...</template>
:::twig
<div>{{ value }}</div>
:::endtwig
:::endvue
```

The formatter computes shared indentation, formats the child parser, and reapplies indentation to match surrounding code.

### Can I format HTML + CSS + JavaScript in one nested file?

Yes. Use nested blocks for each parser. Parser names are dynamic, so any parser available in your Prettier environment can be used.

### What if an embedded parser is not installed?

The plugin keeps the original block content and continues, instead of destroying the surrounding file format. Install the missing parser plugin to enable full formatting.

### How do I override options for one embedded language only?

Set `matryoshkaParserOverrides` in `.prettierrc`:

```json
{
  "tabWidth": 2,
  "matryoshkaParserOverrides": {
    "python": { "tabWidth": 4 }
  }
}
```

### Why is my block not detected?

Tag lines must be exact block markers:

- Start: `:::parserName`
- End: `:::endparserName`

Extra text on the same line can prevent block detection.

### How do I debug parser dispatch and fallback behavior?

Enable logs:

```json
{
  "matryoshkaLogLevel": "debug",
  "matryoshkaLogPrefix": "[matryoshka]"
}
```

Logs are sent to `stderr`, so formatted output in `stdout` remains clean.
