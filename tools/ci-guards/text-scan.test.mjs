import assert from "node:assert/strict";
import test from "node:test";
import { bannedInSegment, hazardInSegment, networkCall, scanText } from "./text-scan.mjs";

const sourceName = "Hazards (Bushfire – High Risk) Overlay";

test("component names and class tokens are not banned phrases", () => {
  assert.deepEqual(bannedInSegment("ScoreBlock"), []);
  assert.deepEqual(bannedInSegment("RankTable"), []);
  assert.deepEqual(bannedInSegment("score-head"), []);
  assert.deepEqual(bannedInSegment("score_detail"), []);
});

test("tier words, composite, and score language are phrases", () => {
  const tier = bannedInSegment('expect(tierFor(80)).toBe("Clear")');
  assert.equal(
    tier.some((hit) => hit.rule === "tier-word" && hit.terms.includes("Clear")),
    true,
  );
  const prose = bannedInSegment("The composite is not calculated. Not scored.");
  assert.equal(
    prose.some((hit) => hit.rule === "composite"),
    true,
  );
  assert.equal(
    prose.some((hit) => hit.rule === "score-rank"),
    true,
  );
  const whole = bannedInSegment("Composite");
  assert.equal(
    whole.some((hit) => hit.rule === "composite"),
    true,
  );
});

test("finder superlatives are only reported for finder copy", () => {
  assert.equal(bannedInSegment("the safest short list", { finderCopy: false }).length, 0);
  const hits = bannedInSegment("the safest short list", { finderCopy: true });
  assert.equal(
    hits.some((hit) => hit.rule === "finder-superlative"),
    true,
  );
});

test("hazard wording skips exact source names and technical tokens", () => {
  assert.deepEqual(hazardInSegment("safe-area-inset-bottom", new Set()), []);
  assert.deepEqual(hazardInSegment(sourceName, new Set([sourceName])), []);
  assert.deepEqual(
    hazardInSegment(`Mapped as ${sourceName}, and it is safe.`, new Set([sourceName])),
    ["High Risk", "safe"],
  );
  assert.deepEqual(hazardInSegment("Safer places", new Set()), ["Safer"]);
});

test("the PlanSA copy key is the only hazard exemption", () => {
  const allow = new Set([sourceName]);
  const keys = new Set(["hazard.saEvidenceRequiredNote"]);
  const quoted = scanText(
    "src/config/area-copy.ts",
    `export const copy = {\n  "hazard.saEvidenceRequiredNote": "${sourceName} remains the quoted overlay name.",\n  "hazard.other": "This place is low risk.",\n};\n`,
    { allowSources: allow, allowKeys: keys },
  );
  assert.equal(
    quoted.hazard.some((hit) => hit.excerpt.includes("quoted overlay")),
    false,
  );
  assert.equal(
    quoted.hazard.some((hit) => hit.terms.includes("low risk")),
    true,
  );
});

test("blocked domains and external test calls are reported", () => {
  const found = scanText(
    "src/pages/HomePage.test.tsx",
    'const live = await fetch("https://www.domain.com.au/suburb");\nconst local = await fetch("http://127.0.0.1:8000/health");\n',
  );
  assert.equal(
    found.domains.some((hit) => hit.terms.includes("domain.com.au")),
    true,
  );
  assert.equal(found.network.length, 1);
  assert.equal(found.network[0].terms[0], "www.domain.com.au");
  assert.equal(networkCall('fetch("http://example.test/health")'), null);
});

test("finder fields are score, tier, and sort keys, not component names", () => {
  const source = `export type SuburbSummary = {\n  name: string;\n  score: number | null;\n  tier: string | null;\n};\n`;
  const found = scanText("src/api/types.ts", source);
  assert.equal(
    found.finder.some((hit) => hit.terms.includes("score")),
    true,
  );
  assert.equal(
    found.finder.some((hit) => hit.terms.includes("tier")),
    true,
  );
  const page = scanText(
    "src/pages/ExplorePage.tsx",
    'const metric = params.get("metric") ?? "score";\n',
  );
  assert.equal(
    page.finder.some((hit) => hit.terms.includes("score")),
    true,
  );
});
