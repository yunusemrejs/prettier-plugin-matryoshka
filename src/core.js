import prettier from "prettier";

const START_TAG_PATTERN = /^([\t ]*):::([A-Za-z][A-Za-z0-9_-]*)\s*$/u;
const END_TAG_PATTERN = /^([\t ]*):::end([A-Za-z][A-Za-z0-9_-]*)\s*$/u;
const NORMALIZED_LINE_ENDING = "\n";
const DEFAULT_LOG_LEVEL = "silent";
const DEFAULT_LOG_PREFIX = "[matryoshka]";
const LOG_LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};
const INTERNAL_OPTION_KEYS = new Set([
  "astFormat",
  "cursorNode",
  "locStart",
  "locEnd",
  "originalText",
  "parentParser",
  "parser",
  "printer",
  "rangeEnd",
  "rangeStart",
]);

const STATE_BY_OPTIONS = new WeakMap();

export function splitIntoLines(source) {
  if (source.length === 0) {
    return [];
  }

  const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu);
  lines.pop();

  return lines;
}

export function splitLineEnding(lineWithEnding) {
  const lineEndingMatch = /(\r\n|\r|\n)$/u.exec(lineWithEnding);
  if (!lineEndingMatch) {
    return [lineWithEnding, ""];
  }

  const [lineEnding] = lineEndingMatch;
  return [
    lineWithEnding.slice(0, lineWithEnding.length - lineEnding.length),
    lineEnding,
  ];
}

export function normalizeLogLevel(rawLevel) {
  if (rawLevel === undefined || rawLevel === null || rawLevel === "") {
    return DEFAULT_LOG_LEVEL;
  }

  if (typeof rawLevel !== "string") {
    throw new TypeError(
      "matryoshkaLogLevel must be a string: silent, error, warn, info, debug.",
    );
  }

  const normalizedLevel = rawLevel.toLowerCase();
  if (!(normalizedLevel in LOG_LEVELS)) {
    throw new TypeError(
      "matryoshkaLogLevel must be one of: silent, error, warn, info, debug.",
    );
  }

  return normalizedLevel;
}

function normalizeLogPrefix(rawPrefix) {
  if (rawPrefix === undefined || rawPrefix === null || rawPrefix === "") {
    return DEFAULT_LOG_PREFIX;
  }

  if (typeof rawPrefix !== "string") {
    throw new TypeError("matryoshkaLogPrefix must be a string.");
  }

  return rawPrefix;
}

function serializeLogDetails(details) {
  if (details === undefined) {
    return "";
  }

  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return " [unserializable details]";
  }
}

function createLogger(logLevel, logPrefix) {
  const threshold = LOG_LEVELS[logLevel];

  return (level, message, details) => {
    if (LOG_LEVELS[level] > threshold) {
      return;
    }

    console.error(
      `${logPrefix} [${level}] ${message}${serializeLogDetails(details)}`,
    );
  };
}

function createLoggerFromOptions(options = {}) {
  const logLevel = normalizeLogLevel(options.matryoshkaLogLevel);
  const logPrefix = normalizeLogPrefix(options.matryoshkaLogPrefix);
  return createLogger(logLevel, logPrefix);
}

function createSyntaxError(message, line, column) {
  const error = new SyntaxError(`${message} (line ${line}, column ${column})`);
  error.name = "MatryoshkaSyntaxError";
  error.loc = { line, column };
  return error;
}

function appendTextNode(container, value, start, end) {
  const previous = container.children[container.children.length - 1];
  if (previous && previous.type === "Text") {
    previous.value += value;
    previous.end = end;
    return;
  }

  container.children.push({
    type: "Text",
    value,
    start,
    end,
  });
}

function newDocument(sourceLength) {
  return {
    type: "Document",
    children: [],
    start: 0,
    end: sourceLength,
  };
}

function newBlock({ parser, openIndent, start, startLine, startColumn }) {
  return {
    type: "Block",
    parser,
    openIndent,
    closeLineEnding: "",
    start,
    end: start,
    startLine,
    startColumn,
    children: [],
  };
}

export function parseMatryoshka(source, options = {}) {
  const log = createLoggerFromOptions(options);
  log("debug", "Parsing matryoshka document", { length: source.length });

  const root = newDocument(source.length);
  const stack = [root];
  const lines = splitIntoLines(source);
  let blockCount = 0;

  let offset = 0;
  let lineNumber = 1;

  for (const lineWithEnding of lines) {
    const [line, lineEnding] = splitLineEnding(lineWithEnding);
    const endMatch = END_TAG_PATTERN.exec(line);

    if (endMatch) {
      if (stack.length === 1) {
        const [, closeIndent, parser] = endMatch;
        log("error", "Unexpected closing tag", {
          parser,
          line: lineNumber,
          column: closeIndent.length + 1,
        });
        throw createSyntaxError(
          `Unexpected closing tag :::end${parser}`,
          lineNumber,
          closeIndent.length + 1,
        );
      }

      const [, closeIndent, parser] = endMatch;
      const activeBlock = stack[stack.length - 1];
      if (activeBlock.parser !== parser) {
        log("error", "Mismatched closing tag", {
          expected: activeBlock.parser,
          actual: parser,
          line: lineNumber,
          column: closeIndent.length + 1,
        });
        throw createSyntaxError(
          `Mismatched closing tag :::end${parser}; expected :::end${activeBlock.parser}`,
          lineNumber,
          closeIndent.length + 1,
        );
      }

      activeBlock.end = offset + lineWithEnding.length;
      activeBlock.closeLineEnding =
        lineEnding.length === 0 ? "" : NORMALIZED_LINE_ENDING;
      stack.pop();
      offset += lineWithEnding.length;
      lineNumber += 1;
      continue;
    }

    const startMatch = START_TAG_PATTERN.exec(line);
    if (startMatch) {
      const [, openIndent, parser] = startMatch;
      const activeContainer = stack[stack.length - 1];
      const block = newBlock({
        parser,
        openIndent,
        start: offset,
        startLine: lineNumber,
        startColumn: openIndent.length + 1,
      });

      activeContainer.children.push(block);
      stack.push(block);
      blockCount += 1;
      offset += lineWithEnding.length;
      lineNumber += 1;
      continue;
    }

    const activeContainer = stack[stack.length - 1];
    appendTextNode(
      activeContainer,
      lineWithEnding,
      offset,
      offset + lineWithEnding.length,
    );
    offset += lineWithEnding.length;
    lineNumber += 1;
  }

  if (stack.length > 1) {
    const unclosedBlock = stack[stack.length - 1];
    log("error", "Unclosed block", {
      parser: unclosedBlock.parser,
      line: unclosedBlock.startLine,
      column: unclosedBlock.startColumn,
    });
    throw createSyntaxError(
      `Unclosed block :::${unclosedBlock.parser}; expected :::end${unclosedBlock.parser}`,
      unclosedBlock.startLine,
      unclosedBlock.startColumn,
    );
  }

  log("debug", "Parsing completed", { blocks: blockCount });
  return root;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeParserOverrides(rawOverrides) {
  if (
    rawOverrides === undefined ||
    rawOverrides === null ||
    rawOverrides === ""
  ) {
    return {};
  }

  if (typeof rawOverrides === "string") {
    let parsed;
    try {
      parsed = JSON.parse(rawOverrides);
    } catch {
      throw new TypeError(
        "matryoshkaParserOverrides must be valid JSON when provided as a string.",
      );
    }

    if (!isPlainObject(parsed)) {
      throw new TypeError(
        "matryoshkaParserOverrides must be an object keyed by parser name.",
      );
    }

    return parsed;
  }

  if (!isPlainObject(rawOverrides)) {
    throw new TypeError(
      "matryoshkaParserOverrides must be an object or a JSON string.",
    );
  }

  return rawOverrides;
}

function getParserOverride(overrides, parserName) {
  const parserOverride = overrides[parserName];
  if (parserOverride === undefined) {
    return {};
  }

  if (!isPlainObject(parserOverride)) {
    throw new TypeError(
      `matryoshkaParserOverrides.${parserName} must be an object.`,
    );
  }

  return parserOverride;
}

function sanitizeOptions(options) {
  const result = {};

  for (const [key, value] of Object.entries(options)) {
    if (INTERNAL_OPTION_KEYS.has(key)) {
      continue;
    }

    if (key === "matryoshkaParserOverrides") {
      continue;
    }

    if (typeof value === "function") {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function buildParserOptions(options, parserName, parserOverrides) {
  return {
    ...sanitizeOptions(options),
    ...getParserOverride(parserOverrides, parserName),
    parser: parserName,
    plugins: options.plugins,
    endOfLine: "lf",
  };
}

function normalizeLineEndings(text, lineEnding) {
  return text.replace(/\r\n|\r|\n/gu, lineEnding);
}

export function removeSingleTrailingLineEnding(text) {
  if (text.endsWith("\r\n")) {
    return text.slice(0, -2);
  }

  if (text.endsWith("\n") || text.endsWith("\r")) {
    return text.slice(0, -1);
  }

  return text;
}

function countLeadingLineEndings(text, lineEnding) {
  let count = 0;
  let index = 0;

  while (text.startsWith(lineEnding, index)) {
    count += 1;
    index += lineEnding.length;
  }

  return count;
}

function countTrailingLineEndings(text, lineEnding) {
  let count = 0;
  let index = text.length;

  while (index >= lineEnding.length) {
    if (text.slice(index - lineEnding.length, index) !== lineEnding) {
      break;
    }

    count += 1;
    index -= lineEnding.length;
  }

  return count;
}

function trimOuterLineEndings(text, lineEnding) {
  let result = text;

  while (result.startsWith(lineEnding)) {
    result = result.slice(lineEnding.length);
  }

  while (result.endsWith(lineEnding)) {
    result = result.slice(0, -lineEnding.length);
  }

  return result;
}

export function preserveSegmentLineEndings(original, formatted, lineEnding) {
  const leadingLineEndings = countLeadingLineEndings(original, lineEnding);
  const trailingLineEndings = countTrailingLineEndings(original, lineEnding);
  const coreContent = trimOuterLineEndings(formatted, lineEnding);

  return `${lineEnding.repeat(leadingLineEndings)}${coreContent}${lineEnding.repeat(
    trailingLineEndings,
  )}`;
}

export function computeCommonIndent(text) {
  const lines = text.split(/\r\n|\r|\n/gu);
  const indents = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const [indent] = line.match(/^[\t ]*/u);
    indents.push(indent);
  }

  if (indents.length === 0) {
    return "";
  }

  let commonIndent = indents[0];
  for (const indent of indents.slice(1)) {
    while (commonIndent.length > 0 && !indent.startsWith(commonIndent)) {
      commonIndent = commonIndent.slice(0, -1);
    }
  }

  return commonIndent;
}

export function removeIndent(text, indent) {
  if (!indent) {
    return text;
  }

  return splitIntoLines(text)
    .map((lineWithEnding) => {
      const [line, lineEnding] = splitLineEnding(lineWithEnding);
      if (line.trim().length === 0) {
        return lineWithEnding;
      }

      if (line.startsWith(indent)) {
        return `${line.slice(indent.length)}${lineEnding}`;
      }

      let strippedLine = line;
      let toStrip = indent.length;
      while (
        toStrip > 0 &&
        (strippedLine.startsWith(" ") || strippedLine.startsWith("\t"))
      ) {
        strippedLine = strippedLine.slice(1);
        toStrip -= 1;
      }

      return `${strippedLine}${lineEnding}`;
    })
    .join("");
}

export function addIndent(text, indent) {
  if (!indent || text.length === 0) {
    return text;
  }

  return splitIntoLines(text)
    .map((lineWithEnding) => {
      const [line, lineEnding] = splitLineEnding(lineWithEnding);
      if (line.length === 0) {
        return lineWithEnding;
      }

      return `${indent}${line}${lineEnding}`;
    })
    .join("");
}

function wrapWithParserTags(
  parserName,
  openIndent,
  body,
  closeLineEnding = "",
) {
  const openTag = `${openIndent}:::${parserName}`;
  const closeTag = `${openIndent}:::end${parserName}`;

  if (body.length === 0) {
    return `${openTag}${NORMALIZED_LINE_ENDING}${closeTag}${closeLineEnding}`;
  }

  return `${openTag}${NORMALIZED_LINE_ENDING}${body}${NORMALIZED_LINE_ENDING}${closeTag}${closeLineEnding}`;
}

function isParserResolutionError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Couldn['’]t resolve parser|No parser could be inferred/iu.test(
    error.message,
  );
}

async function tryFormatSource(
  source,
  parserName,
  options,
  parserOverrides,
  allowFallback = false,
) {
  if (source.trim().length === 0) {
    return {
      value: source,
      success: true,
    };
  }

  const parserOptions = buildParserOptions(
    options,
    parserName,
    parserOverrides,
  );

  try {
    const formatted = await prettier.format(source, parserOptions);

    return {
      value: removeSingleTrailingLineEnding(formatted),
      success: true,
      reason: "formatted",
    };
  } catch (error) {
    const parserResolutionError = isParserResolutionError(error);
    if (!allowFallback && !parserResolutionError) {
      throw error;
    }

    return {
      value: source,
      success: false,
      reason: parserResolutionError ? "parser-unavailable" : "parser-error",
    };
  }
}

function extractParserSequence(source) {
  const sequence = [];
  for (const lineWithEnding of splitIntoLines(source)) {
    const [line] = splitLineEnding(lineWithEnding);
    const startMatch = START_TAG_PATTERN.exec(line);
    if (!startMatch) {
      continue;
    }

    sequence.push(startMatch[2]);
  }

  return sequence;
}

export function hasValidNestedMarkers(source) {
  const parserStack = [];

  for (const lineWithEnding of splitIntoLines(source)) {
    const [line] = splitLineEnding(lineWithEnding);
    const endMatch = END_TAG_PATTERN.exec(line);
    if (endMatch) {
      if (parserStack.length === 0) {
        return false;
      }

      const activeParser = parserStack[parserStack.length - 1];
      if (activeParser !== endMatch[2]) {
        return false;
      }

      parserStack.pop();
      continue;
    }

    const startMatch = START_TAG_PATTERN.exec(line);
    if (startMatch) {
      parserStack.push(startMatch[2]);
    }
  }

  return parserStack.length === 0;
}

function hasStableNestedStructure(original, formatted) {
  const originalSequence = extractParserSequence(original);
  const formattedSequence = extractParserSequence(formatted);
  if (originalSequence.length !== formattedSequence.length) {
    return false;
  }

  const sameSequence = originalSequence.every((parser, index) => {
    return parser === formattedSequence[index];
  });
  if (!sameSequence) {
    return false;
  }

  return hasValidNestedMarkers(formatted);
}

async function renderNode(node, options, sharedState) {
  if (node.type === "Text") {
    return normalizeLineEndings(node.value, sharedState.lineEnding);
  }

  return renderBlock(node, options, sharedState);
}

export async function renderBlock(block, options, sharedState) {
  const cached = sharedState.blockCache.get(block);
  if (cached !== undefined) {
    sharedState.log("debug", "Using cached block rendering", {
      parser: block.parser,
    });
    return cached;
  }

  const renderedSegments = [];
  for (const child of block.children) {
    if (child.type === "Text") {
      renderedSegments.push({
        type: "text",
        value: normalizeLineEndings(child.value, sharedState.lineEnding),
      });
      continue;
    }

    renderedSegments.push({
      type: "block",
      value: await renderBlock(child, options, sharedState),
    });
  }

  const rawBody = renderedSegments.map((segment) => segment.value).join("");
  const commonIndent = computeCommonIndent(rawBody);
  const dedentedBody = removeIndent(rawBody, commonIndent);
  const hasNestedBlocks = renderedSegments.some(
    (segment) => segment.type === "block",
  );

  let fullFormatAttempt = await tryFormatSource(
    dedentedBody,
    block.parser,
    options,
    sharedState.parserOverrides,
    hasNestedBlocks,
  );

  if (
    hasNestedBlocks &&
    fullFormatAttempt.success &&
    !hasStableNestedStructure(dedentedBody, fullFormatAttempt.value)
  ) {
    sharedState.log(
      "warn",
      "Nested marker structure changed after formatting",
      {
        parser: block.parser,
      },
    );
    fullFormatAttempt = {
      value: dedentedBody,
      success: false,
      reason: "nested-structure-changed",
    };
  }

  if (!fullFormatAttempt.success) {
    sharedState.log("warn", "Block formatting failed", {
      parser: block.parser,
      reason: fullFormatAttempt.reason,
    });
  }

  let formattedDedentedBody = fullFormatAttempt.value;
  if (!fullFormatAttempt.success && hasNestedBlocks) {
    sharedState.log("info", "Applying segmented fallback formatting", {
      parser: block.parser,
    });
    const fallbackParts = [];

    for (const segment of renderedSegments) {
      const dedentedSegment = removeIndent(segment.value, commonIndent);
      if (segment.type === "block") {
        fallbackParts.push(dedentedSegment);
        continue;
      }

      const segmentAttempt = await tryFormatSource(
        dedentedSegment,
        block.parser,
        options,
        sharedState.parserOverrides,
        true,
      );

      if (!segmentAttempt.success) {
        sharedState.log("debug", "Segment formatting kept original content", {
          parser: block.parser,
          reason: segmentAttempt.reason,
        });
      }

      fallbackParts.push(
        preserveSegmentLineEndings(
          dedentedSegment,
          segmentAttempt.value,
          sharedState.lineEnding,
        ),
      );
    }

    formattedDedentedBody = fallbackParts.join("");
  }

  const reindentedBody = addIndent(formattedDedentedBody, commonIndent);
  const finalBody = removeSingleTrailingLineEnding(reindentedBody);
  const renderedBlock = wrapWithParserTags(
    block.parser,
    block.openIndent,
    finalBody,
    block.closeLineEnding,
  );

  sharedState.blockCache.set(block, renderedBlock);
  return renderedBlock;
}

export function getSharedState(options) {
  const cachedState = STATE_BY_OPTIONS.get(options);
  if (cachedState) {
    return cachedState;
  }

  const sharedState = {
    blockCache: new WeakMap(),
    parserOverrides: normalizeParserOverrides(
      options.matryoshkaParserOverrides,
    ),
    lineEnding: NORMALIZED_LINE_ENDING,
    log: createLoggerFromOptions(options),
  };

  STATE_BY_OPTIONS.set(options, sharedState);
  return sharedState;
}

export async function renderDocument(ast, options) {
  const sharedState = getSharedState(options);
  const rendered = [];

  for (const child of ast.children) {
    rendered.push(await renderNode(child, options, sharedState));
  }

  return rendered.join("");
}

export function createMatryoshkaPrinter() {
  return {
    print(path, options, print) {
      const node = path.node;

      if (node.type === "Document") {
        return path.map(print, "children");
      }

      if (node.type === "Text") {
        return normalizeLineEndings(node.value, NORMALIZED_LINE_ENDING);
      }

      const renderedChildren = path.map(print, "children").join("");
      const finalBody = removeSingleTrailingLineEnding(renderedChildren);
      return wrapWithParserTags(
        node.parser,
        node.openIndent,
        finalBody,
        node.closeLineEnding,
      );
    },

    /**
     * Delegate a Block node to recursive embedded formatting.
     *
     * The AST is created by `parseMatryoshka`, which uses a stack to match
     * `:::parser` / `:::endparser` pairs and preserve nested language islands.
     * This embed hook returns an async thunk so Prettier can resolve children
     * first, then call `renderBlock` depth-first for parent blocks. As a result,
     * inner languages are formatted before outer languages while indentation and
     * block boundaries remain stable across recursion levels.
     *
     * @param {import("prettier").AstPath<any>} path
     * @param {import("prettier").ParserOptions} options
     * @returns {undefined | (() => Promise<string>)}
     */
    embed(path, options) {
      const node = path.node;
      if (node.type !== "Block") {
        return undefined;
      }

      return async () => renderBlock(node, options, getSharedState(options));
    },
  };
}
