import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assemble, graphEnvironment, harnessLeaf, inventory, RELEASE, verifyScopes } from "../../scripts/package-lb.ts";

const root = resolve(import.meta.dir, "../..");
const temporary = mkdtempSync(join(tmpdir(), "lb-distribution-test-"));
const artifact = join(temporary, "relocated package");
let stockBefore: Record<string, string>;

type Grid = Record<string, { stages: Record<string, string> }>;
const backend = [
  "workspace-scaffold", "workspace-detection", "state-init", "reverse-engineering",
  "practices-discovery", "requirements-analysis", "domain-design", "units-generation",
  "contract-design", "delivery-planning", "code-generation", "build-and-test",
];
const expectedRoutes: Record<string, string[]> = {
  "service-backend": backend,
  "service-backend-design": [
    ...backend.slice(0, -2), "functional-design", "nfr-requirements", "nfr-design", ...backend.slice(-2),
  ],
};
const nativeSkills: Record<string, string> = {
  claude: ".claude/skills", codex: ".agents/skills", copilot: ".github/skills",
  cursor: ".cursor/skills", kiro: ".kiro/skills", "kiro-ide": ".kiro/skills", opencode: ".aidlc/skills",
};

function json<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function installedCheck(harness: string, tool: string, args: string[]): void {
  const project = join(artifact, "dist", harness);
  const leaf = harnessLeaf(harness);
  const result = spawnSync(process.execPath, [join(project, leaf, "tools", tool), ...args], {
    cwd: project,
    env: graphEnvironment(project, leaf, harness),
    encoding: "utf8",
    timeout: 30_000,
  });
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
}

beforeAll(() => {
  stockBefore = inventory(join(root, "dist"));
  const built = assemble(join(temporary, "original"));
  // The original build path no longer exists. Every subsequent check runs from
  // an unrelated path containing a space, using only files in the artifact.
  renameSync(built, artifact);
}, 180_000);

afterAll(() => rmSync(temporary, { recursive: true, force: true }));

describe("combined Logicbroker distribution", () => {
  test("includes exactly the seven requested AWS harnesses", () => {
    expect([...RELEASE.harnesses].sort()).toEqual(Object.keys(nativeSkills).sort());
  });

  for (const harness of Object.keys(nativeSkills)) {
    test(`${harness}: relocated graph, native scope shortcuts, and stock routes remain valid`, () => {
      const leaf = harnessLeaf(harness);
      const project = join(artifact, "dist", harness);
      const grid = json<Grid>(join(project, leaf, "tools/data/scope-grid.json"));
      const stock = json<Grid>(join(root, "dist", harness, leaf, "tools/data/scope-grid.json"));
      expect(Object.keys(stock)).toHaveLength(11);
      expect(Object.keys(grid).sort()).toEqual([...Object.keys(stock), ...Object.keys(expectedRoutes)].sort());
      for (const [name, route] of Object.entries(stock)) expect(grid[name]).toEqual(route);
      for (const [name, route] of Object.entries(expectedRoutes)) {
        expect(Object.entries(grid[name].stages).filter(([, mode]) => mode === "EXECUTE").map(([stage]) => stage)).toEqual(route);
        const runner = readFileSync(join(project, nativeSkills[harness], name, "SKILL.md"), "utf8");
        expect(runner).toContain(`name: ${name}\n`);
        expect(runner).toContain(`next --scope ${name}`);
        const orchestrator = readFileSync(join(project, nativeSkills[harness], "aidlc/SKILL.md"), "utf8");
        expect(orchestrator).toContain(name);
      }
      expect(verifyScopes(project, leaf, harness)).toEqual({
        "service-backend": 12, "service-backend-design": 15,
      });
      for (const stage of ["inception/requirements-analysis", "construction/code-generation", "construction/build-and-test"]) {
        const body = readFileSync(join(project, leaf, "aidlc-common/stages", `${stage}.md`), "utf8");
        expect(body).toContain(`${leaf}/scopes/<active-scope>.md`);
        expect(body).toContain("### Backend scope guidance (service)");
        expect(body).not.toContain("{{HARNESS_DIR}}");
      }
      installedCheck(harness, "aidlc-graph.ts", ["compile", "--check"]);
      installedCheck(harness, "aidlc-runner-gen.ts", ["scopes", "--check"]);
      expect(json<{ plugins: string[] }>(join(project, leaf, "tools/data/harness.json")).plugins).toEqual(["aidlc", "service"]);
      expect(existsSync(join(project, "aidlc/spaces/default/intents"))).toBe(false);
    }, 30_000);
  }

  test("Codex shortcuts use native discovery and require explicit invocation", () => {
    const project = join(artifact, "dist/codex");
    expect(existsSync(join(project, ".codex/skills"))).toBe(false);
    for (const scope of RELEASE.scopes) {
      expect(readFileSync(join(project, ".agents/skills", scope, "agents/openai.yaml"), "utf8"))
        .toBe("policy:\n  allow_implicit_invocation: false\n");
    }
  });

  test("rejects a route that omits Contract Design's required unit producer", () => {
    const project = join(artifact, "dist/claude");
    const path = join(project, ".claude/tools/data/scope-grid.json");
    const before = readFileSync(path);
    try {
      const grid = json<Grid>(path);
      grid["service-backend"].stages["units-generation"] = "SKIP";
      writeFileSync(path, JSON.stringify(grid));
      expect(() => verifyScopes(project, ".claude", "claude")).toThrow(/units-generation/);
    } finally {
      writeFileSync(path, before);
    }
  });

  test("hash inventory covers the relocated artifact and upstream dist is unchanged", () => {
    const manifest = json<{ files: Record<string, string>; upstream: unknown }>(join(artifact, "distribution-manifest.json"));
    const actual = inventory(artifact);
    delete actual["distribution-manifest.json"];
    expect(actual).toEqual(manifest.files);
    expect(manifest.upstream).toEqual(RELEASE.upstream);
    expect(inventory(join(root, "dist"))).toEqual(stockBefore);
  }, 30_000);

  test("refuses to overwrite an existing output", () => {
    const before = inventory(artifact);
    expect(() => assemble(artifact)).toThrow("Output already exists");
    expect(inventory(artifact)).toEqual(before);
  });
});
