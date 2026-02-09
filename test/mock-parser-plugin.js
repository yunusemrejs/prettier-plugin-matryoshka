function createMockParser(
  name,
  { shouldRejectNestedMarkers = false, rejectPattern = null } = {},
) {
  return {
    parse(source, options) {
      if (shouldRejectNestedMarkers && source.includes(":::")) {
        throw new Error(
          `${name} parser cannot handle nested matryoshka markers.`,
        );
      }

      if (rejectPattern && rejectPattern.test(source)) {
        throw new Error(`${name} parser syntax error.`);
      }

      return {
        type: "MockAst",
        parser: options.parser,
        source,
      };
    },
    astFormat: "mock-ast",
    locStart: () => 0,
    locEnd: (node) => node.source.length,
  };
}

function normalizeSource(source) {
  return source
    .replace(/\r\n|\r/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export const mockParserPlugin = {
  parsers: {
    mockvue: createMockParser("mockvue", { shouldRejectNestedMarkers: true }),
    mocktwig: createMockParser("mocktwig"),
    python: createMockParser("python"),
    passthrough: createMockParser("passthrough"),
    retag: createMockParser("retag"),
    brokenclose: createMockParser("brokenclose"),
    strict: createMockParser("strict", {
      shouldRejectNestedMarkers: true,
      rejectPattern: /\bBAD\b/u,
    }),
    nonerror: {
      parse() {
        throw "nonerror parser failure";
      },
      astFormat: "mock-ast",
      locStart: () => 0,
      locEnd: () => 0,
    },
  },
  printers: {
    "mock-ast": {
      print(path, options) {
        const node = path.node;
        const normalized = normalizeSource(node.source);
        const tabWidth = options.tabWidth ?? 2;
        const indent = " ".repeat(tabWidth);

        if (node.parser === "retag") {
          return normalized
            .replace(/:::mocktwig/gu, ":::retagged")
            .replace(/:::endmocktwig/gu, ":::endretagged");
        }

        if (node.parser === "brokenclose") {
          return normalized.replace(/:::endmocktwig/gu, ":::endmocktwigBROKEN");
        }

        if (normalized.length === 0) {
          return `/*${node.parser}|tabWidth=${tabWidth}*/`;
        }

        const body = normalized
          .split("\n")
          .map((line) => `${indent}${line}`)
          .join("\n");

        return `/*${node.parser}|tabWidth=${tabWidth}*/\n${body}`;
      },
    },
  },
};
