import { createMatryoshkaPrinter, parseMatryoshka } from "./core.js";

const MATRYOSHKA_PARSER = "matryoshka";
const MATRYOSHKA_AST_FORMAT = "matryoshka-ast";

export const languages = [
  {
    name: "Matryoshka",
    parsers: [MATRYOSHKA_PARSER],
    extensions: [".matryoshka", ".mtry"],
    tmScope: "source.matryoshka",
    linguistLanguageId: 0,
  },
];

export const parsers = {
  [MATRYOSHKA_PARSER]: {
    parse: (source, options) => parseMatryoshka(source, options),
    astFormat: MATRYOSHKA_AST_FORMAT,
    locStart: (node) => node.start ?? 0,
    locEnd: (node) => node.end ?? 0,
  },
};

export const printers = {
  [MATRYOSHKA_AST_FORMAT]: createMatryoshkaPrinter(),
};

export const options = {
  matryoshkaParserOverrides: {
    category: "Matryoshka",
    type: "string",
    default: "{}",
    description:
      "Object or JSON string keyed by parser name to override embedded parser options.",
    exception: (value) =>
      typeof value === "object" && value !== null && !Array.isArray(value),
  },
  matryoshkaLogLevel: {
    category: "Matryoshka",
    type: "choice",
    default: "silent",
    description:
      "Controls diagnostic log verbosity for parser and formatter internals.",
    choices: [
      { value: "silent", description: "No logs." },
      { value: "error", description: "Only errors." },
      { value: "warn", description: "Warnings and errors." },
      {
        value: "info",
        description: "Informational logs plus warnings/errors.",
      },
      { value: "debug", description: "Verbose debugging logs." },
    ],
  },
  matryoshkaLogPrefix: {
    category: "Matryoshka",
    type: "string",
    default: "[matryoshka]",
    description: "Prefix used for plugin diagnostic logs.",
  },
};

const plugin = {
  languages,
  parsers,
  printers,
  options,
};

export default plugin;
