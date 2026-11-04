import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanRepo } from "./text-scan.mjs";

const IMAGE = "mcr.microsoft.com/playwright:v1.64.1-noble";

function group(hits) {
  const byRule = new Map();
  for (const hit of hits) {
    const list = byRule.get(hit.rule) ?? [];
    list.push(hit);
    byRule.set(hit.rule, list);
  }
  return byRule;
}

function encodeAnnotation(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function annotate(hit) {
  if (!process.env.GITHUB_ACTIONS) return;
  const file = encodeAnnotation(hit.file);
  const title = encodeAnnotation(hit.rule);
  const message = `${hit.terms.join(", ")} — ${hit.excerpt}`.replace(/\r?\n/g, " ");
  console.log(`::warning file=${file},line=${hit.line},title=${title}::${message}`);
}

function section(lines, title, body, hits) {
  lines.push(`## ${title}`, "", body, "");
  if (!hits.length) {
    lines.push("No hits.", "");
    return;
  }
  lines.push(`${hits.length} hit${hits.length === 1 ? "" : "s"}.`, "");
  const byRule = group(hits);
  for (const [rule, list] of byRule) {
    lines.push(`### ${rule}`, "");
    for (const hit of list) {
      lines.push(`- \`${hit.file}:${hit.line}\` ${hit.terms.join(", ")} — ${hit.excerpt}`);
    }
    lines.push("");
  }
}

function readPlaywrightVersion(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const pinned = lock.packages?.["node_modules/@playwright/test"]?.version ?? null;
  const ct = lock.packages?.["node_modules/@playwright/experimental-ct-react"]?.version ?? null;
  return { pinned, ct };
}

function readImageTag(root) {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const match = workflow.match(/mcr\.microsoft\.com\/playwright:(v\d+\.\d+\.\d+-noble)/);
  return match?.[1] ?? null;
}

function playwrightPin(root) {
  const { pinned, ct } = readPlaywrightVersion(root);
  const tag = readImageTag(root);
  const expected = pinned ? `v${pinned}-noble` : null;
  const hits = [];
  if (!pinned || !tag || tag !== expected) {
    hits.push({
      file: ".github/workflows/ci.yml",
      line: 1,
      rule: "playwright-image",
      terms: [tag ?? "missing", expected ?? "missing"],
      excerpt: `image ${tag ?? "missing"}, lockfile @playwright/test ${pinned ?? "missing"}`,
    });
  }
  return {
    hits,
    note: `Image \`${tag ?? "missing"}\`. Lockfile \`@playwright/test\` ${pinned ?? "missing"}. \`@playwright/experimental-ct-react\` ${ct ?? "not installed"}.`,
  };
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

function npmAudit(root) {
  const result = runCommand("npm", ["audit", "--json"], { cwd: root });
  const raw = `${result.stdout || ""}\n${result.stderr || ""}`;
  const start = raw.indexOf("{");
  if (start < 0) {
    return {
      hits: [
        {
          file: "package.json",
          line: 1,
          rule: "npm-audit",
          terms: ["unavailable"],
          excerpt: raw.trim().slice(0, 180) || "npm audit produced no JSON",
        },
      ],
      note: "npm audit did not return JSON.",
    };
  }
  let report;
  try {
    report = JSON.parse(raw.slice(start));
  } catch {
    return {
      hits: [
        {
          file: "package.json",
          line: 1,
          rule: "npm-audit",
          terms: ["unparsed"],
          excerpt: "npm audit JSON could not be parsed",
        },
      ],
      note: "npm audit JSON could not be parsed.",
    };
  }
  const vulnerabilities = report.vulnerabilities ?? {};
  const hits = Object.entries(vulnerabilities).map(([name, info]) => ({
    file: "package-lock.json",
    line: 1,
    rule: "npm-audit",
    terms: [info.severity ?? "unknown", name],
    excerpt: `${info.severity ?? "unknown"} ${name} via ${viaTitle(info)}`,
  }));
  const counts = report.metadata?.vulnerabilities ?? {};
  return {
    hits,
    note: `npm audit totals: ${JSON.stringify(counts)}.`,
  };
}

function viaTitle(info) {
  const via = Array.isArray(info.via) ? info.via : [];
  const titles = via.map((item) => (typeof item === "string" ? item : item?.title)).filter(Boolean);
  return titles[0] ?? "no advisory title";
}

function pythonProject(root) {
  return [
    "backend/pyproject.toml",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "Pipfile",
  ].some((file) => fs.existsSync(path.join(root, file)));
}

function pipAudit(root) {
  if (!pythonProject(root)) {
    return { hits: [], note: "pip-audit skipped: no Python project.", skipped: true };
  }
  const probe = runCommand("pip-audit", ["--version"]);
  if (probe.error || probe.status == null) {
    return {
      hits: [
        {
          file: "backend/pyproject.toml",
          line: 1,
          rule: "pip-audit",
          terms: ["unavailable"],
          excerpt: "pip-audit is not installed",
        },
      ],
      note: "pip-audit is not installed.",
    };
  }
  const install = runCommand("python", ["-m", "pip", "install", "-e", "./backend[dev]"], {
    cwd: root,
  });
  if (install.status !== 0) {
    return {
      hits: [
        {
          file: "backend/pyproject.toml",
          line: 1,
          rule: "pip-audit",
          terms: ["install"],
          excerpt: (install.stderr || install.stdout || "pip install failed").trim().slice(0, 180),
        },
      ],
      note: "Could not install the backend to audit it.",
    };
  }
  const reportPath = path.join(os.tmpdir(), `pip-audit-${process.pid}.json`);
  const result = runCommand(
    "pip-audit",
    ["--format", "json", "--progress-spinner", "off", "--output", reportPath],
    { cwd: root },
  );
  if (!fs.existsSync(reportPath)) {
    return {
      hits: [
        {
          file: "backend/pyproject.toml",
          line: 1,
          rule: "pip-audit",
          terms: ["unparsed"],
          excerpt: (result.stderr || result.stdout || "pip-audit produced no JSON")
            .trim()
            .slice(0, 180),
        },
      ],
      note: "pip-audit produced no JSON.",
    };
  }
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    return {
      hits: [
        {
          file: "backend/pyproject.toml",
          line: 1,
          rule: "pip-audit",
          terms: ["unparsed"],
          excerpt: "pip-audit JSON could not be parsed",
        },
      ],
      note: "pip-audit JSON could not be parsed.",
    };
  } finally {
    fs.rmSync(reportPath, { force: true });
  }
  const dependencies = report.dependencies ?? report;
  const hits = [];
  const seen = new Set();
  if (Array.isArray(dependencies)) {
    for (const dep of dependencies) {
      for (const vuln of dep.vulns ?? []) {
        const key = `${dep.name} ${vuln.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          file: "backend/pyproject.toml",
          line: 1,
          rule: "pip-audit",
          terms: [dep.name, vuln.id],
          excerpt: `${dep.name} ${dep.version} ${vuln.id}`.trim().slice(0, 180),
        });
      }
    }
  }
  return {
    hits,
    note: hits.length ? `${hits.length} Python advisories.` : "pip-audit reported no advisories.",
  };
}

function gitleaks(root) {
  const probe = runCommand("gitleaks", ["version"]);
  if (probe.error || probe.status == null) {
    return {
      hits: [
        {
          file: ".git",
          line: 1,
          rule: "gitleaks",
          terms: ["unavailable"],
          excerpt: "gitleaks is not installed",
        },
      ],
      note: "gitleaks is not installed.",
    };
  }
  const reportPath = path.join(os.tmpdir(), `gitleaks-${process.pid}.json`);
  runCommand(
    "gitleaks",
    [
      "detect",
      "--source",
      root,
      "--report-format",
      "json",
      "--report-path",
      reportPath,
      "--redact",
      "--no-banner",
    ],
    { cwd: root },
  );
  if (!fs.existsSync(reportPath)) {
    return { hits: [], note: "gitleaks wrote no report. Treat that as no findings." };
  }
  let findings;
  try {
    findings = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    return {
      hits: [
        {
          file: ".git",
          line: 1,
          rule: "gitleaks",
          terms: ["unparsed"],
          excerpt: "gitleaks report could not be parsed",
        },
      ],
      note: "gitleaks report could not be parsed.",
    };
  }
  fs.rmSync(reportPath, { force: true });
  const hits = (Array.isArray(findings) ? findings : []).map((finding) => ({
    file: finding.File || ".git",
    line: finding.StartLine || 1,
    rule: "gitleaks",
    terms: [finding.RuleID || "secret"],
    excerpt: `${finding.RuleID || "secret"} ${finding.Description || ""}`.trim().slice(0, 180),
  }));
  return {
    hits,
    note: hits.length ? `${hits.length} redacted findings.` : "gitleaks reported no secrets.",
  };
}

function registryPlaceholder(root) {
  const script = path.join(root, "tools/ci-guards/registry_snapshot_guard.py");
  const result = runCommand("python", [script], { cwd: root });
  const text = (result.stdout || result.stderr || "").trim();
  return text || "registry snapshot guard: disabled placeholder, not executed";
}

function main() {
  const root = process.cwd();
  const scanned = scanRepo(root);
  const pin = playwrightPin(root);
  const audit = npmAudit(root);
  const python = pipAudit(root);
  const secrets = gitleaks(root);
  const placeholder = registryPlaceholder(root);

  const checks = [
    {
      title: "Banned terms",
      body: "Tier words Clear, Steady, Mixed, Thin, and Sparse; the word composite; score and rank phrases. Finder copy is also checked for best, top, safest, and worst. Matches are phrases in strings and text, so the component names ScoreBlock and RankTable are left alone.",
      hits: scanned.banned,
    },
    {
      title: "Finder sort and rank fields",
      body: "On the search, match, and explore surfaces: sort, order, rank, score, tier, and position fields.",
      hits: scanned.finder,
    },
    {
      title: "Hazard wording",
      body: "Own copy must not say risk, safe, low risk, no risk, and the rest of that family. An official source name is ignored only when the whole string is in tools/ci-guards/hazard-source-allowlist.txt. The only exempt copy key is hazard.saEvidenceRequiredNote.",
      hits: scanned.hazard,
    },
    {
      title: "Hard-blocked domains",
      body: "microburbs.com.au, realestate.com.au, and domain.com.au anywhere in the tree.",
      hits: scanned.domains,
    },
    {
      title: "Network calls in tests",
      body: "Test files that call fetch, httpx, requests, axios, or a browser request with a non-local URL.",
      hits: scanned.network,
    },
    {
      title: "gitleaks",
      body: "Secret scan, redacted. A finding here does not fail the job.",
      hits: secrets.hits,
      extra: secrets.note,
    },
    {
      title: "npm audit",
      body: "Advisory report for the npm lockfile.",
      hits: audit.hits,
      extra: audit.note,
    },
    {
      title: "pip-audit",
      body: python.skipped
        ? "Skipped when the repo has no Python project."
        : "Advisory report for the installed backend environment.",
      hits: python.hits,
      extra: python.note,
    },
    {
      title: "Playwright image pin",
      body: `The workflow image must be ${IMAGE} when package-lock.json resolves @playwright/test to 1.64.1, tag v<version>-noble.`,
      hits: pin.hits,
      extra: pin.note,
    },
  ];

  const lines = [
    "# CI guards (report only)",
    "",
    "These checks write annotations and this summary. The job exits 0 either way and is not a required check.",
    "",
  ];
  let annotations = 0;
  for (const check of checks) {
    section(lines, check.title, check.body, check.hits);
    if (check.extra) lines.push(check.extra, "");
    for (const hit of check.hits) {
      if (annotations >= 40) break;
      annotate(hit);
      annotations += 1;
    }
  }
  if (checks.reduce((sum, check) => sum + check.hits.length, 0) > 40) {
    lines.push("GitHub annotations are capped at 40. Every hit is listed above.", "");
  }
  lines.push(
    "## Deferred",
    "",
    `- ${placeholder}`,
    "- Not built in this step: migration, drift, contract, and registry checks; the required-wording test against src/config/area-copy.ts; Vercel preview smoke.",
    "- Not built in this step: the step 6 coverage API (`no_cleared_source`, `GET /api/coverage`).",
    "- Not built in this step: the step 5 unknown `flood_obs_` loader fixture, and the step 7 About-this-data panel check.",
    "",
  );

  const summary = `${lines.join("\n")}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.log("## Guard runner error\n");
  console.log("The runner caught an error and is still exiting 0.\n");
  console.log("```");
  console.log(message);
  console.log("```");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Guard runner error\n\n\`\`\`\n${message}\n\`\`\`\n`,
    );
  }
}
process.exit(0);
