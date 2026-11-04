import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-server",
  ".git",
  ".venv",
  ".vercel",
  "coverage",
  "playwright-report",
  "test-results",
  "blob-report",
  "__screenshots__",
  ".cache",
]);

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
]);

const PHRASE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".py",
  ".json",
  ".md",
  ".css",
  ".html",
  ".yml",
  ".yaml",
]);

const SKIP_GENERATED = new Set([
  "package-lock.json",
  "src/api/schema.d.ts",
  "contracts/openapi.json",
]);

const TIER_WORDS = ["Clear", "Steady", "Mixed", "Thin", "Sparse"];

const SCORE_PHRASES = [
  "not scored",
  "unscored",
  "re-ranked",
  "re-ranks",
  "re-rank",
  "rankings",
  "ranking",
  "ranked",
  "ranks",
  "rank",
  "scores",
  "scored",
  "score",
  "composite",
];

const HAZARD_PHRASES = [
  "low risk",
  "no risk",
  "high risk",
  "medium risk",
  "low-risk",
  "no-risk",
  "high-risk",
  "medium-risk",
  "at risk",
  "at-risk",
  "risks",
  "risky",
  "risk",
  "unsafe",
  "safest",
  "safer",
  "safety",
  "safe",
];

const SUPERLATIVES = ["safest", "worst", "best", "top"];

const BLOCKED_DOMAINS = ["microburbs.com.au", "realestate.com.au", "domain.com.au"];

const FINDER_COPY = new Set([
  "src/pages/SearchPage.tsx",
  "src/pages/ExplorePage.tsx",
  "src/pages/MatchPage.tsx",
  "src/pages/HomePage.tsx",
  "src/seo/copy.ts",
  "src/components/SearchField.tsx",
  "contracts/rankings.json",
]);

const FINDER_TYPES = [
  "SuburbSummary",
  "CouncilSummary",
  "SearchResponse",
  "MatchResponse",
  "ExploreResponse",
];
const FINDER_FUNCTIONS = {
  "backend/app/api/v1.py": ["search", "match", "explore"],
  "backend/app/schemas.py": FINDER_TYPES,
  "src/api/types.ts": FINDER_TYPES,
  "src/api/client.ts": ["fetchSearch", "fetchMatch", "fetchExplore"],
  "src/pages/SearchPage.tsx": null,
  "src/pages/ExplorePage.tsx": null,
  "src/pages/MatchPage.tsx": null,
};

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "example.test",
  "api.test",
  "ssr.local",
]);

const NETWORK_CALL = [
  /fetch\(\s*['"`](https?:\/\/[^'"`]+)['"`]/,
  /httpx\.(?:get|post|put|patch|delete|request|stream|Client|AsyncClient)\(\s*['"`](https?:\/\/[^'"`]+)['"`]/,
  /requests\.(?:get|post|put|patch|delete|head)\(\s*['"`](https?:\/\/[^'"`]+)['"`]/,
  /urllib\.request\.urlopen\(\s*['"`](https?:\/\/[^'"`]+)['"`]/,
  /axios\.(?:get|post|put|patch|delete|request)\(\s*['"`](https?:\/\/[^'"`]+)['"`]/,
  /page\.goto\(\s*['"`](https?:\/\/[^'"`]+)['"`]/,
  /(?:page|context|request)\.(?:get|post|put|patch|delete|fetch)\(\s*['"`](https?:\/\/[^'"`]+)['"`]/,
  /new WebSocket\(\s*['"`](wss?:\/\/[^'"`]+)['"`]/,
];

export function loadList(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isIdentifierLike(text) {
  return /^[A-Za-z0-9_./:#?&=%@+-]+$/.test(text);
}

function maskSpans(text, spans) {
  const chars = [...text];
  for (const [start, end] of spans) {
    for (let i = start; i < end && i < chars.length; i += 1) chars[i] = " ";
  }
  return chars.join("");
}

function matchPhrases(text, phrases, caseSensitive) {
  const found = [];
  const spans = [];
  const ordered = [...phrases].sort((left, right) => right.length - left.length);
  for (const phrase of ordered) {
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(phrase)}(?![A-Za-z0-9])`, flags);
    const rest = maskSpans(text, spans);
    for (const match of rest.matchAll(re)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const overlaps = spans.some(([left, right]) => start < right && end > left);
      if (overlaps) continue;
      spans.push([start, end]);
      found.push(match[0]);
    }
  }
  return found;
}

function exactTerm(text, terms, caseSensitive) {
  const compare = caseSensitive ? text : text.toLowerCase();
  return (
    terms.find((term) => (caseSensitive ? term === compare : term.toLowerCase() === compare)) ??
    null
  );
}

/**
 * Phrases inside one string or JSX text segment.
 * Identifier-like strings (class names, paths, ScoreBlock) are ignored unless
 * the whole string is itself a banned term.
 */
export function bannedInSegment(text, { finderCopy = false } = {}) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const hits = [];
  if (isIdentifierLike(trimmed)) {
    const tier = exactTerm(trimmed, TIER_WORDS, true);
    if (tier) hits.push({ rule: "tier-word", terms: [tier] });
    const composite = exactTerm(trimmed, ["composite", "Composite"], false);
    if (composite) hits.push({ rule: "composite", terms: [trimmed] });
    const score = exactTerm(
      trimmed,
      ["score", "scores", "scored", "rank", "ranks", "ranking", "rankings"],
      false,
    );
    if (score) hits.push({ rule: "score-rank", terms: [trimmed] });
    if (finderCopy) {
      const superlative = exactTerm(trimmed, SUPERLATIVES, false);
      if (superlative) hits.push({ rule: "finder-superlative", terms: [trimmed] });
    }
    return hits;
  }
  const tiers = matchPhrases(trimmed, TIER_WORDS, true);
  if (tiers.length) hits.push({ rule: "tier-word", terms: tiers });
  const composite = matchPhrases(trimmed, ["composite"], false);
  if (composite.length) hits.push({ rule: "composite", terms: composite });
  const score = matchPhrases(
    trimmed,
    SCORE_PHRASES.filter((phrase) => phrase !== "composite"),
    false,
  );
  if (score.length) hits.push({ rule: "score-rank", terms: score });
  if (finderCopy) {
    const superlatives = matchPhrases(trimmed, SUPERLATIVES, false);
    if (superlatives.length) hits.push({ rule: "finder-superlative", terms: superlatives });
  }
  return hits;
}

export function hazardInSegment(text, allowSources) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (allowSources.has(trimmed)) return [];
  if (isIdentifierLike(trimmed)) {
    const exact = exactTerm(trimmed, HAZARD_PHRASES, false);
    return exact ? [trimmed] : [];
  }
  return matchPhrases(trimmed, HAZARD_PHRASES, false);
}

export function blockedDomains(text) {
  const lower = text.toLowerCase();
  return BLOCKED_DOMAINS.filter((domain) => lower.includes(domain));
}

export function networkCall(line) {
  for (const pattern of NETWORK_CALL) {
    const match = line.match(pattern);
    if (!match?.[1]) continue;
    let host;
    try {
      host = new URL(match[1]).hostname;
    } catch {
      host = match[1];
    }
    if (LOCAL_HOSTS.has(host)) continue;
    return { url: match[1], host };
  }
  return null;
}

function propertyName(node) {
  if (!node || !node.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

function copyKeyExempt(node, allowKeys) {
  const parent = node.parent;
  if (!parent || !ts.isPropertyAssignment(parent) || parent.initializer !== node) return false;
  const name = propertyName(parent);
  if (!name) return false;
  if (allowKeys.has(name)) return true;
  if (name !== "saEvidenceRequiredNote") return false;
  const objectParent = parent.parent?.parent;
  return Boolean(
    objectParent &&
    ts.isPropertyAssignment(objectParent) &&
    propertyName(objectParent) === "hazard" &&
    allowKeys.has("hazard.saEvidenceRequiredNote"),
  );
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function segmentsFromSource(rel, source, allowKeys) {
  if (rel.endsWith(".md")) return markdownSegments(source);
  if (rel.endsWith(".json")) return jsonSegments(source, allowKeys);
  if (rel.endsWith(".py")) return quotedSegments(source, { triple: true, allowKeys });
  if (
    rel.endsWith(".ts") ||
    rel.endsWith(".tsx") ||
    rel.endsWith(".js") ||
    rel.endsWith(".mjs") ||
    rel.endsWith(".cjs")
  ) {
    return tsSegments(rel, source, allowKeys);
  }
  if (
    rel.endsWith(".css") ||
    rel.endsWith(".yml") ||
    rel.endsWith(".yaml") ||
    rel.endsWith(".html")
  ) {
    return quotedSegments(source, { triple: false, allowKeys });
  }
  return [];
}

function markdownSegments(source) {
  const segments = [];
  let fence = false;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (line.trim()) segments.push({ text: line, line: index + 1, exempt: false });
  }
  return segments;
}

function jsonSegments(source, allowKeys) {
  const segments = [];
  const re = /"(?:\\.|[^"\\])*"/g;
  let pendingExempt = false;
  for (const match of source.matchAll(re)) {
    const raw = match[0];
    const after = source.slice((match.index ?? 0) + raw.length);
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    if (/^\s*:/.test(after)) {
      pendingExempt = allowKeys.has(value);
      continue;
    }
    if (typeof value === "string") {
      segments.push({ text: value, line: lineAt(source, match.index ?? 0), exempt: pendingExempt });
    }
    pendingExempt = false;
  }
  return segments;
}

function quotedSegments(source, { triple, allowKeys }) {
  const segments = [];
  const pattern = triple
    ? /("""|''')([\s\S]*?)\1|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g
    : /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  for (const match of source.matchAll(pattern)) {
    const raw = match[0];
    let value;
    try {
      if (raw.startsWith('"""') || raw.startsWith("'''")) value = raw.slice(3, -3);
      else
        value = JSON.parse(
          raw.startsWith("'") ? `"${raw.slice(1, -1).replace(/"/g, '\\"')}"` : raw,
        );
    } catch {
      value = raw.slice(1, -1);
    }
    const line = lineAt(source, match.index ?? 0);
    const previous = source.slice(Math.max(0, (match.index ?? 0) - 80), match.index ?? 0);
    const key = previous.match(/([A-Za-z0-9_.]+)\s*[:=]\s*$/)?.[1] ?? "";
    segments.push({ text: value, line, exempt: allowKeys.has(key) });
  }
  return segments;
}

function tsSegments(rel, source, allowKeys) {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, scriptKind(rel));
  const segments = [];
  const push = (node, text) => {
    if (!text || !text.trim()) return;
    segments.push({
      text,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      exempt: copyKeyExempt(node, allowKeys),
    });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteralLike(node)) {
      push(node, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      push(node, node.head.text);
      for (const span of node.templateSpans) push(span.literal, span.literal.text);
      return;
    }
    if (ts.isJsxText(node)) {
      push(node, node.getText(sf));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return segments;
}

function excerpt(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function isTestFile(rel) {
  return (
    /\.(test|spec)\.(ts|tsx|js|mjs|cjs|py)$/.test(rel) ||
    rel.startsWith("e2e/") ||
    rel.startsWith("backend/tests/")
  );
}

function extractIndentedBlock(source, startLine) {
  const lines = source.split(/\r?\n/);
  const start = startLine - 1;
  const body = [lines[start] ?? ""];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      body.push(line);
      continue;
    }
    if (!/^\s/.test(line)) break;
    body.push(line);
  }
  return { text: body.join("\n"), line: startLine };
}

function finderRegions(rel, source) {
  const names = FINDER_FUNCTIONS[rel];
  if (names === undefined) return [];
  if (names === null) return [{ text: source, line: 1 }];
  const regions = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const name of names) {
      const python = new RegExp(`^(?:async\\s+)?def ${name}\\b`);
      const typed = new RegExp(`^export (?:type|interface|function) ${name}\\b`);
      const klass = new RegExp(`^class ${name}\\b`);
      if (python.test(line) || typed.test(line) || klass.test(line)) {
        regions.push(extractIndentedBlock(source, index + 1));
      }
    }
  }
  return regions;
}

function finderFieldsIn(rel, source) {
  const hits = [];
  for (const region of finderRegions(rel, source)) {
    const lines = region.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const terms = fieldTokens(line);
      if (!terms.length) continue;
      hits.push({
        file: rel,
        line: region.line + index,
        rule: "finder-field",
        terms,
        excerpt: excerpt(line),
      });
    }
  }
  return hits;
}

function fieldTokens(line) {
  const found = new Set();
  const body = String.raw`sort_by|order_by|sort|order|rankings|ranking|ranks|rank|score|tier|position`;
  const patterns = [
    new RegExp(String.raw`(?<![A-Za-z0-9_])(${body})\s*:`, "gi"),
    new RegExp(String.raw`\.(${body})\b`, "gi"),
    new RegExp(String.raw`['"](${body})['"]`, "gi"),
  ];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) found.add(match[1].toLowerCase());
  }
  return [...found];
}

function pushPhraseHits(bucket, rel, segment, finderCopy) {
  for (const hit of bannedInSegment(segment.text, { finderCopy })) {
    bucket.push({
      file: rel,
      line: segment.line,
      rule: hit.rule,
      terms: hit.terms,
      excerpt: excerpt(segment.text),
    });
  }
}

export function scanText(rel, text, { allowSources = new Set(), allowKeys = new Set() } = {}) {
  const banned = [];
  const hazard = [];
  const domains = [];
  const network = [];
  const finder = [];
  const domainHits = blockedDomains(text);
  if (domainHits.length) {
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const present = blockedDomains(lines[index]);
      if (!present.length) continue;
      domains.push({
        file: rel,
        line: index + 1,
        rule: "blocked-domain",
        terms: present,
        excerpt: excerpt(lines[index]),
      });
    }
  }
  if (isTestFile(rel)) {
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const call = networkCall(lines[index]);
      if (!call) continue;
      network.push({
        file: rel,
        line: index + 1,
        rule: "network-call",
        terms: [call.host],
        excerpt: excerpt(lines[index]),
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(FINDER_FUNCTIONS, rel))
    finder.push(...finderFieldsIn(rel, text));
  const ext = path.extname(rel).toLowerCase();
  if (PHRASE_EXT.has(ext)) {
    const finderCopy = FINDER_COPY.has(rel);
    for (const segment of segmentsFromSource(rel, text, allowKeys)) {
      pushPhraseHits(banned, rel, segment, finderCopy);
      if (segment.exempt) continue;
      const words = hazardInSegment(segment.text, allowSources);
      if (!words.length) continue;
      hazard.push({
        file: rel,
        line: segment.line,
        rule: "hazard-wording",
        terms: words,
        excerpt: excerpt(segment.text),
      });
    }
  }
  return { banned, hazard, domains, network, finder };
}

export function scanRepo(root = process.cwd()) {
  const allowSources = new Set(
    loadList(path.join(root, "tools/ci-guards/hazard-source-allowlist.txt")),
  );
  const allowKeys = new Set(
    loadList(path.join(root, "tools/ci-guards/hazard-copy-key-allowlist.txt")),
  );
  const banned = [];
  const hazard = [];
  const domains = [];
  const network = [];
  const finder = [];
  for (const full of walk(root)) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (rel.startsWith("tools/ci-guards/")) continue;
    if (SKIP_GENERATED.has(rel)) continue;
    const ext = path.extname(rel).toLowerCase();
    if (BINARY_EXT.has(ext)) continue;
    let source;
    try {
      source = fs.readFileSync(full);
    } catch {
      continue;
    }
    if (source.includes(0)) continue;
    const found = scanText(rel, source.toString("utf8"), { allowSources, allowKeys });
    banned.push(...found.banned);
    hazard.push(...found.hazard);
    domains.push(...found.domains);
    network.push(...found.network);
    finder.push(...found.finder);
  }
  return { banned, hazard, domains, network, finder };
}
