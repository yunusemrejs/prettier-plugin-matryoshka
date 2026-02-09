import prettier from "prettier";
import { describe, expect, it, vi } from "vitest";
import plugin from "../src/index.js";
import {
  addIndent,
  computeCommonIndent,
  createMatryoshkaPrinter,
  getSharedState,
  normalizeLogLevel,
  normalizeParserOverrides,
  parseMatryoshka,
  preserveSegmentLineEndings,
  removeIndent,
  removeSingleTrailingLineEnding,
  renderDocument,
  splitIntoLines,
  splitLineEnding,
} from "../src/core.js";
import { mockParserPlugin } from "./mock-parser-plugin.js";

async function formatMatryoshka(source, extraOptions = {}) {
  return prettier.format(source, {
    parser: "matryoshka",
    plugins: [plugin, mockParserPlugin],
    tabWidth: 2,
    ...extraOptions,
  });
}

describe("matryoshka parser", () => {
  it("formats recursive nested blocks with dynamic parser resolution", async () => {
    const source = `:::mockvue
<div> {{  count }} </div>

:::mocktwig
  {{ "hello"|capitalize }}
:::endmocktwig

<script> const count = 1 </script>
:::endmockvue`;

    const result = await formatMatryoshka(source);

    expect(result).toMatchInlineSnapshot(`
      ":::mockvue
      /*mockvue|tabWidth=2*/
        <div> {{  count }} </div>

      :::mocktwig
        /*mocktwig|tabWidth=2*/
          {{ \"hello\"|capitalize }}
      :::endmocktwig
      /*mockvue|tabWidth=2*/
        <script> const count = 1 </script>
      :::endmockvue"
    `);
  });

  it("inherits global options and applies parser-specific overrides", async () => {
    const source = `:::python
print(1)
:::endpython`;

    const result = await formatMatryoshka(source, {
      tabWidth: 2,
      matryoshkaParserOverrides: {
        python: {
          tabWidth: 4,
        },
      },
    });

    expect(result).toMatchInlineSnapshot(`
      ":::python
      /*python|tabWidth=4*/
          print(1)
      :::endpython"
    `);
  });

  it("accepts parser-specific overrides as JSON", async () => {
    const source = `:::python
print(1)
:::endpython`;

    const result = await formatMatryoshka(source, {
      matryoshkaParserOverrides: JSON.stringify({
        python: {
          tabWidth: 6,
        },
      }),
    });

    expect(result).toMatchInlineSnapshot(`
      ":::python
      /*python|tabWidth=6*/
            print(1)
      :::endpython"
    `);
  });

  it("keeps block content when target parser is missing", async () => {
    const source = `:::unknown
keep   this
:::endunknown`;
    const result = await formatMatryoshka(source);

    expect(result).toMatchInlineSnapshot(`
      ":::unknown
      keep   this
      :::endunknown"
    `);
  });

  it("rethrows syntax errors from known embedded parsers in renderer path", async () => {
    const ast = parseMatryoshka(":::strict\nBAD\n:::endstrict");

    await expect(
      renderDocument(ast, {
        parser: "matryoshka",
        plugins: [plugin, mockParserPlugin],
      }),
    ).rejects.toThrow(/strict parser syntax error\./u);
  });

  it("propagates non-Error parser failures in renderer path", async () => {
    const ast = parseMatryoshka(":::nonerror\nvalue\n:::endnonerror");

    await expect(
      renderDocument(ast, {
        parser: "matryoshka",
        plugins: [plugin, mockParserPlugin],
      }),
    ).rejects.toBe("nonerror parser failure");
  });

  it("does not emit diagnostic logs by default", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      await formatMatryoshka(":::unknown\nkeep\n:::endunknown");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("emits diagnostic logs when debug level is enabled", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      await formatMatryoshka(":::unknown\nkeep\n:::endunknown", {
        matryoshkaLogLevel: "debug",
      });

      const logMessages = consoleErrorSpy.mock.calls.flatMap(([message]) =>
        String(message),
      );
      expect(
        logMessages.some((message) => message.includes("[matryoshka] [warn]")),
      ).toBe(true);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("logs segmented fallback details when inner parser formatting fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await formatMatryoshka(
        `:::strict
BAD
:::mocktwig
ok
:::endmocktwig
BAD
:::endstrict`,
        { matryoshkaLogLevel: "debug" },
      );

      const logMessages = consoleErrorSpy.mock.calls.flatMap(([message]) =>
        String(message),
      );
      expect(
        logMessages.some((message) =>
          message.includes("Segment formatting kept original content"),
        ),
      ).toBe(true);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("formats empty block bodies without crashing", async () => {
    const source = `:::passthrough

:::endpassthrough`;
    const result = await formatMatryoshka(source);

    expect(result).toMatchInlineSnapshot(`
      ":::passthrough
      :::endpassthrough"
    `);
  });

  it("supports CRLF output without duplicating carriage returns", async () => {
    const source = `:::python
print(1)
:::endpython`;
    const result = await formatMatryoshka(source, { endOfLine: "crlf" });

    expect(result).toContain("\r\n");
    expect(result).not.toContain("\r\r\n");
  });

  it("throws for unexpected closing tags", () => {
    expect(() => parseMatryoshka(":::endmockvue\n")).toThrow(
      /Unexpected closing tag :::endmockvue \(line 1, column 1\)/u,
    );
  });

  it("throws for mismatched closing tags", () => {
    expect(() => parseMatryoshka(":::mockvue\n:::endmocktwig\n")).toThrow(
      /Mismatched closing tag :::endmocktwig; expected :::endmockvue \(line 2, column 1\)/u,
    );
  });

  it("throws for unclosed tags", () => {
    expect(() => parseMatryoshka(":::mockvue\n<div/>\n")).toThrow(
      /Unclosed block :::mockvue; expected :::endmockvue \(line 1, column 1\)/u,
    );
  });
});

describe("core helpers", () => {
  it("splits source by lines and line endings", () => {
    expect(splitIntoLines("a\r\nb\n")).toEqual(["a\r\n", "b\n"]);
    expect(splitIntoLines("")).toEqual([]);
    expect(splitLineEnding("line\n")).toEqual(["line", "\n"]);
    expect(splitLineEnding("line")).toEqual(["line", ""]);
  });

  it("renders parsed AST recursively via renderDocument", async () => {
    const ast = parseMatryoshka(":::passthrough\n hello  \n:::endpassthrough");
    const rendered = await renderDocument(ast, {
      parser: "matryoshka",
      tabWidth: 2,
      endOfLine: "lf",
      plugins: [plugin, mockParserPlugin],
      matryoshkaParserOverrides: "",
    });

    expect(rendered).toMatchInlineSnapshot(`
      ":::passthrough
       /*passthrough|tabWidth=2*/
         hello
      :::endpassthrough"
    `);
  });

  it("renders plain text documents and normalizes line endings", async () => {
    const ast = parseMatryoshka("alpha\r\nbeta\r\n");
    const rendered = await renderDocument(ast, {
      parser: "matryoshka",
      tabWidth: 2,
      endOfLine: "lf",
      plugins: [plugin, mockParserPlugin],
      matryoshkaParserOverrides: {},
    });

    expect(rendered).toBe("alpha\nbeta\n");
  });

  it("reuses shared state for the same options object", () => {
    const options = {
      parser: "matryoshka",
      plugins: [plugin, mockParserPlugin],
      matryoshkaParserOverrides: { python: { tabWidth: 8 } },
    };

    const first = getSharedState(options);
    const second = getSharedState(options);

    expect(first).toBe(second);
  });

  it("throws when parser override JSON is invalid", async () => {
    expect(() =>
      getSharedState({
        parser: "matryoshka",
        plugins: [plugin, mockParserPlugin],
        matryoshkaParserOverrides: "{",
      }),
    ).toThrow(
      /matryoshkaParserOverrides must be valid JSON when provided as a string\./u,
    );
  });

  it("normalizes parser override input variants", () => {
    expect(normalizeParserOverrides(undefined)).toEqual({});
    expect(normalizeParserOverrides(null)).toEqual({});
    expect(normalizeParserOverrides("")).toEqual({});
    expect(normalizeParserOverrides("{}")).toEqual({});
    expect(() => normalizeParserOverrides("[]")).toThrow(
      /matryoshkaParserOverrides must be an object keyed by parser name\./u,
    );
    expect(() => normalizeParserOverrides(42)).toThrow(
      /matryoshkaParserOverrides must be an object or a JSON string\./u,
    );
  });

  it("normalizes and validates log levels", () => {
    expect(normalizeLogLevel(undefined)).toBe("silent");
    expect(normalizeLogLevel("DEBUG")).toBe("debug");
    expect(() => normalizeLogLevel(3)).toThrow(
      /matryoshkaLogLevel must be a string: silent, error, warn, info, debug\./u,
    );
    expect(() => normalizeLogLevel("trace")).toThrow(
      /matryoshkaLogLevel must be one of: silent, error, warn, info, debug\./u,
    );
  });

  it("serializes diagnostic logs safely", () => {
    const options = {
      parser: "matryoshka",
      plugins: [plugin, mockParserPlugin],
      matryoshkaLogLevel: "debug",
    };
    const circularDetails = {};
    circularDetails.self = circularDetails;

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const sharedState = getSharedState(options);
      sharedState.log("debug", "test-without-details");
      sharedState.log("debug", "test-with-circular", circularDetails);

      expect(String(consoleErrorSpy.mock.calls[0][0])).toContain(
        "test-without-details",
      );
      expect(String(consoleErrorSpy.mock.calls[1][0])).toContain(
        "[unserializable details]",
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("handles low-level indentation and line-ending utilities", () => {
    expect(removeSingleTrailingLineEnding("x\r\n")).toBe("x");
    expect(removeSingleTrailingLineEnding("x\n")).toBe("x");
    expect(removeSingleTrailingLineEnding("x")).toBe("x");

    expect(computeCommonIndent("\n\n")).toBe("");
    expect(computeCommonIndent("   a\n b")).toBe(" ");

    expect(removeIndent(" \tline\n\n", "\t\t")).toBe("line\n\n");
    expect(addIndent("line\n\nnext", "  ")).toBe("  line\n\n  next");

    expect(preserveSegmentLineEndings("\n\nalpha\n\n", "\nbody\n", "\n")).toBe(
      "\n\nbody\n\n",
    );
  });

  it("throws when parser override shape is invalid", async () => {
    const ast = parseMatryoshka(":::python\nprint(1)\n:::endpython");

    await expect(
      renderDocument(ast, {
        parser: "matryoshka",
        plugins: [plugin, mockParserPlugin],
        matryoshkaParserOverrides: {
          python: 4,
        },
      }),
    ).rejects.toThrow(/matryoshkaParserOverrides\.python must be an object\./u);
  });

  it("throws when log prefix type is invalid", () => {
    expect(() =>
      getSharedState({
        parser: "matryoshka",
        plugins: [plugin, mockParserPlugin],
        matryoshkaLogPrefix: 123,
      }),
    ).toThrow(/matryoshkaLogPrefix must be a string\./u);
  });

  it("exposes parser loc helpers", () => {
    expect(plugin.parsers.matryoshka.locStart({ start: 5 })).toBe(5);
    expect(plugin.parsers.matryoshka.locStart({})).toBe(0);
    expect(plugin.parsers.matryoshka.locEnd({ end: 6 })).toBe(6);
    expect(plugin.parsers.matryoshka.locEnd({})).toBe(0);
  });

  it("printer handles document/text/block print branches and embed behavior", async () => {
    const printer = createMatryoshkaPrinter();
    const printCallback = vi.fn(() => "printed");

    const documentPath = {
      node: { type: "Document", children: [1] },
      map: vi.fn(() => ["doc-child"]),
    };

    expect(
      printer.print(documentPath, { endOfLine: "lf" }, printCallback),
    ).toEqual(["doc-child"]);

    const textPath = {
      node: { type: "Text", value: "a\r\nb" },
      map: vi.fn(),
    };

    expect(printer.print(textPath, { endOfLine: "lf" }, printCallback)).toBe(
      "a\nb",
    );

    const blockPath = {
      node: { type: "Block", parser: "python", openIndent: "  ", children: [] },
      map: vi.fn(() => []),
    };

    expect(printer.print(blockPath, { endOfLine: "lf" }, printCallback)).toBe(
      "  :::python\n  :::endpython",
    );

    const blockWithBodyPath = {
      node: { type: "Block", parser: "python", openIndent: "", children: [{}] },
      map: vi.fn(() => ["print(1)\n"]),
    };

    expect(
      printer.print(blockWithBodyPath, { endOfLine: "lf" }, printCallback),
    ).toBe(":::python\nprint(1)\n:::endpython");

    expect(printer.embed({ node: { type: "Text" } }, {})).toBeUndefined();

    const blockAst = parseMatryoshka(":::python\nprint(1)\n:::endpython");
    const [pythonBlock] = blockAst.children;

    const embedResult = printer.embed(
      { node: pythonBlock },
      {
        parser: "matryoshka",
        plugins: [plugin, mockParserPlugin],
        tabWidth: 2,
        endOfLine: "lf",
      },
    );

    expect(typeof embedResult).toBe("function");
    expect(await embedResult()).toMatchInlineSnapshot(`
      ":::python
      /*python|tabWidth=2*/
        print(1)
      :::endpython"
    `);
  });
});
