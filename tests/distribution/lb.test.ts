import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assemble, graphEnvironment, harnessLeaf, inventory, RELEASE, verifyScopes, nativeExecutable } from "../../scripts/package-lb.ts";

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
  const project = join(artifact, "runtime", harness);
  const leaf = harnessLeaf(harness);
  const route = tool === "aidlc-graph.ts" ? ["graph", ...args] : ["gen", "runner-scopes", ...args.slice(1)];
  const result = spawnSync(nativeExecutable(), ["engine", ...route], {
    cwd: project,
    env: { ...graphEnvironment(project, leaf, harness), PATH: "/usr/bin:/bin" },
    encoding: "utf8",
    timeout: 30_000,
  });
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
}

beforeAll(() => {
  stockBefore = inventory(join(root, "dist-release"));
  const built = assemble(join(temporary, "original"));
  // The original build path no longer exists. Every subsequent check runs from
  // an unrelated path containing a space, using only files in the artifact.
  renameSync(built, artifact);
}, 180_000);

afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function configure(project: string, harness: string, flags: string[] = []) {
  const result = spawnSync(nativeExecutable(), [
    "config", "--project-dir", project, "--harness", harness,
    "--from", join(artifact, `lb-aidlc-${harness}.tar.gz`),
    "--mcp", "none", "--json", ...flags,
  ], {
    cwd: project, encoding: "utf8", timeout: 60_000,
    env: { ...graphEnvironment(project, harnessLeaf(harness), harness), PATH: "/usr/bin:/bin" },
  });
  const output = JSON.parse(result.stdout) as {
    ok: boolean; message: string;
    data?: { planToken: string; counts: Record<string, number>; actions: { path: string; action: string }[] };
  };
  return { status: result.status, ...output };
}

function syncService(project: string, harness: string): void {
  const leaf = harnessLeaf(harness);
  const result = spawnSync(nativeExecutable(), ["engine", "plugin", "sync"], {
    cwd: project, encoding: "utf8", timeout: 30_000,
    env: { ...graphEnvironment(project, leaf, harness), PATH: "/usr/bin:/bin",
      AIDLC_PLUGIN_ROOT: join(project, leaf, "plugins/service") },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("plugin sync complete: 1 plugin(s)");
  // A precomposed archive can make sync a no-op while config has rebuilt its
  // graph from an older grid. Refresh the generated surfaces explicitly.
  for (const args of [["graph", "compile"], ["gen", "runners"], ["gen", "runner-scopes"]]) {
    const generated = spawnSync(nativeExecutable(), ["engine", ...args], {
      cwd: project, encoding: "utf8", timeout: 30_000,
      env: { ...graphEnvironment(project, leaf, harness), PATH: "/usr/bin:/bin" },
    });
    expect(generated.status, generated.stderr).toBe(0);
  }
  // Let config reconcile the orchestrator's generated tables and record the
  // composed ownership baseline after the legacy grid has been rebuilt.
  const finalPlan = configure(project, harness, ["--dry-run"]);
  expect(finalPlan.ok, finalPlan.message).toBe(true);
  const finalized = configure(project, harness, ["--plan-token", finalPlan.data!.planToken]);
  expect(finalized.ok, finalized.message).toBe(true);
}

function runtimeContent(project: string): Record<string, string> {
  const files = inventory(project);
  // Native config updates its ownership receipt; plugin sync records health.
  // Compare all executable/configuration/knowledge bytes outside those records.
  for (const path of Object.keys(files)) {
    if (path.endsWith("/tools/data/aidlc-manifest.json") || path.startsWith("aidlc/spaces/default/intents/")) delete files[path];
  }
  return files;
}

describe("native consumer migration", () => {
  for (const legacy of ["aws270", "lb011"]) {
    test(`${legacy}: adopts verified files and preserves project history without Bun or Node`, () => {
      const baselineRoot = process.env.LB_AIDLC_LEGACY_ROOT;
      if (!baselineRoot) throw new Error("Set LB_AIDLC_LEGACY_ROOT to the verified AWS 2.7.0 and LB 0.1.1 fixtures; see the distribution guide.");
      const project = join(temporary, legacy);
      cpSync(join(baselineRoot, legacy, "dist/claude"), project, { recursive: true });
      const memory = join(project, "aidlc/spaces/default/memory/project.md");
      writeFileSync(memory, "Repository-specific rules and architecture.\n");
      writeFileSync(join(project, ".aidlc-workflows.json"), '{"harnesses":{"codex":{"ref":"old-pin"}}}\n');
      const before = inventory(project);
      const plan = configure(project, "claude", ["--dry-run"]);
      expect(plan.ok, plan.message).toBe(true);
      expect(plan.data?.counts.conflict).toBe(0);
      expect(inventory(project)).toEqual(before);
      const applied = configure(project, "claude", ["--plan-token", plan.data!.planToken]);
      expect(applied.ok, applied.message).toBe(true);
      syncService(project, "claude");
      expect(readFileSync(memory, "utf8")).toBe("Repository-specific rules and architecture.\n");
      expect(readFileSync(join(project, ".aidlc-workflows.json"), "utf8")).toContain('"old-pin"');
      expect(readFileSync(join(project, ".claude/settings.json"), "utf8")).not.toContain("bun ");
      expect(verifyScopes(project, ".claude", "claude")).toEqual({ "service-backend": 12, "service-backend-design": 15 });
      const refreshed = runtimeContent(project);
      const again = configure(project, "claude", ["--dry-run"]);
      expect(again.ok, again.message).toBe(true);
      expect(configure(project, "claude", ["--plan-token", again.data!.planToken]).ok).toBe(true);
      syncService(project, "claude");
      expect(runtimeContent(project)).toEqual(refreshed);
    }, 90_000);
  }

  test("modified legacy configuration is a conflict with zero target writes", () => {
    const project = join(temporary, "custom legacy");
    cpSync(join(process.env.LB_AIDLC_LEGACY_ROOT!, "lb011/dist/claude"), project, { recursive: true });
    const settings = join(project, ".claude/settings.json");
    const value = json<Record<string, unknown>>(settings);
    value.model = "my-project-model";
    writeFileSync(settings, JSON.stringify(value));
    const before = inventory(project);
    const plan = configure(project, "claude", ["--dry-run"]);
    expect(plan.data?.actions.some((item) => item.path === ".claude/settings.json" && item.action === "conflict")).toBe(true);
    expect(inventory(project)).toEqual(before);
    expect(configure(project, "claude", ["--yes"]).ok).toBe(false);
    expect(inventory(project)).toEqual(before);
  }, 60_000);

  test("native archives initialize an empty target without optional MCP servers", () => {
    const project = join(temporary, "fresh native");
    mkdirSync(project);
    const plan = configure(project, "claude", ["--dry-run"]);
    expect(plan.ok, plan.message).toBe(true);
    expect(inventory(project)).toEqual({});
    expect(configure(project, "claude", ["--plan-token", plan.data!.planToken]).ok).toBe(true);
    expect(existsSync(join(project, ".mcp.json"))).toBe(false);
    const claude = inventory(join(project, ".claude"));
    const codex = configure(project, "codex", ["--dry-run"]);
    // AWS 2.8.0 intentionally refuses a new second harness. Do not bypass it
    // with raw copies or silently discard the existing harness and its receipt.
    expect(codex.ok).toBe(false);
    expect(codex.message).toContain("refusing codex");
    expect(inventory(join(project, ".claude"))).toEqual(claude);
  }, 90_000);

  test("an unfinished workflow is refused without rewriting its records", () => {
    const project = join(temporary, "active workflow");
    cpSync(join(process.env.LB_AIDLC_LEGACY_ROOT!, "lb011/dist/claude"), project, { recursive: true });
    const intents = join(project, "aidlc/spaces/default/intents");
    mkdirSync(join(intents, "poc"), { recursive: true });
    writeFileSync(join(intents, "intents.json"), JSON.stringify([{
      uuid: "deadbeef-0000-4000-8000-000000000147", slug: "poc", dirName: "poc", scope: "service-backend", status: "in-flight",
    }]));
    writeFileSync(join(intents, "poc/aidlc-state.md"), "# AI-DLC State Tracking\n\n## Current Status\n- **Status**: Running\n");
    const before = inventory(project);
    const result = configure(project, "claude", ["--dry-run"]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("workflow(s) are active");
    expect(inventory(project)).toEqual(before);
  }, 30_000);
});

describe("combined Logicbroker distribution", () => {
  test("Claude inherits provider choices without changing stock AWS settings or native hooks", () => {
    const settings = json<{ env: Record<string, string>; hooks: unknown; permissions: unknown }>(join(artifact, "runtime/claude/.claude/settings.json"));
    const stock = json<{ env: Record<string, string>; hooks: unknown; permissions: unknown }>(join(root, "dist-release/claude/.claude/settings.json"));
    expect(stock.env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
    expect(settings.env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
    expect(settings.env.AWS_REGION).toBeUndefined();
    expect(Object.keys(settings.env).some((key) => /^ANTHROPIC_DEFAULT_.*_MODEL$/.test(key))).toBe(false);
    expect(settings.env.AWS_AIDLC_DEFAULT_SCOPE).toBe(stock.env.AWS_AIDLC_DEFAULT_SCOPE);
    expect(settings.hooks).toEqual(stock.hooks);
    expect(settings.permissions).toEqual(stock.permissions);
    const onboarding = readFileSync(join(artifact, "runtime/claude/.claude/CLAUDE.md"), "utf8");
    expect(onboarding).toContain("**Model provider**");
    expect(onboarding).toContain("Direct Claude users need their Claude login");
    expect(onboarding).not.toContain("**AWS Bedrock access**");
  });

  test("includes exactly the seven requested AWS harnesses", () => {
    expect([...RELEASE.harnesses].sort()).toEqual(Object.keys(nativeSkills).sort());
  });

  for (const harness of Object.keys(nativeSkills)) {
    test(`${harness}: relocated graph, native scope shortcuts, and stock routes remain valid`, () => {
      const leaf = harnessLeaf(harness);
      const project = join(artifact, "runtime", harness);
      const grid = json<Grid>(join(project, leaf, "tools/data/scope-grid.json"));
      const stock = json<Grid>(join(root, "dist-release", harness, leaf, "tools/data/scope-grid.json"));
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
      const consumer = join(temporary, `consumer-${harness}`);
      mkdirSync(consumer);
      const configured = configure(consumer, harness, ["--yes"]);
      expect(configured.ok, configured.message).toBe(true);
      syncService(consumer, harness);
      expect(verifyScopes(consumer, leaf, harness)).toEqual({ "service-backend": 12, "service-backend-design": 15 });
      expect(readFileSync(join(consumer, nativeSkills[harness], "service-backend/SKILL.md"), "utf8")).toContain("next --scope service-backend");
      if (harness === "codex") {
        for (const scope of RELEASE.scopes) {
          expect(readFileSync(join(consumer, nativeSkills[harness], scope, "agents/openai.yaml"), "utf8"))
            .toBe("policy:\n  allow_implicit_invocation: false\n");
        }
      }
    }, 60_000);
  }

  test("Codex shortcuts use native discovery and require explicit invocation", () => {
    const project = join(artifact, "runtime/codex");
    expect(existsSync(join(project, ".codex/skills"))).toBe(false);
    for (const scope of RELEASE.scopes) {
      expect(readFileSync(join(project, ".agents/skills", scope, "agents/openai.yaml"), "utf8"))
        .toBe("policy:\n  allow_implicit_invocation: false\n");
    }
  });

  test("rejects a route that omits Contract Design's required unit producer", () => {
    const project = join(artifact, "runtime/claude");
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
    expect(inventory(join(root, "dist-release"))).toEqual(stockBefore);
  }, 30_000);

  test("refuses to overwrite an existing output", () => {
    const before = inventory(artifact);
    expect(() => assemble(artifact)).toThrow("Output already exists");
    expect(inventory(artifact)).toEqual(before);
  });
});
