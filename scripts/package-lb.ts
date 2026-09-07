#!/usr/bin/env bun
// Assemble a release candidate without modifying the stock dist or a consumer.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPluginDropEntries, runPluginCompose } from "../core/tools/aidlc-plugin-test.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RELEASE = JSON.parse(readFileSync(join(ROOT, "distribution/lb.json"), "utf8")) as {
  name: string;
  version: string;
  upstream: { repository: string; commit: string; engineVersion: string; release: string | null };
  plugin: string;
  scopes: string[];
  harnesses: string[];
};

function environment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(AIDLC_|AWS_AIDLC_|CLAUDE_|CURSOR_PROJECT_DIR$|PLUGIN_ROOT$|PWD$)/.test(key),
  ));
}

function run(command: string, args: string[], cwd = ROOT, env = environment()): string {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 60_000 });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  }
  return result.stdout;
}

export function inventory(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(directory: string): void {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Release cannot contain a symlink: ${path}`);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) {
        files[relative(root, path).replaceAll("\\", "/")] = createHash("sha256").update(readFileSync(path)).digest("hex");
      } else throw new Error(`Release cannot contain a special file: ${path}`);
    }
  }
  walk(root);
  return files;
}

export function graphEnvironment(project: string, leaf: string, harness: string): NodeJS.ProcessEnv {
  const base = join(project, leaf);
  return {
    ...environment(),
    AIDLC_PROJECT_DIR: project,
    AIDLC_HARNESS_DIR: leaf,
    AIDLC_HARNESS_NAME: harness,
    AIDLC_STAGE_GRAPH: join(base, "tools/data/stage-graph.json"),
    AIDLC_SCOPE_GRID: join(base, "tools/data/scope-grid.json"),
    AIDLC_STAGES_DIR: join(base, "aidlc-common/stages"),
    AIDLC_SCOPES_DIR: join(base, "scopes"),
    AIDLC_AGENTS_DIR: join(base, "agents"),
    AIDLC_SENSORS_DIR: join(base, "sensors"),
    AIDLC_RULES_DIR: join(project, "aidlc/spaces/default/memory"),
  };
}

export function verifyScopes(project: string, leaf: string, harness: string): Record<string, number> {
  const grid = JSON.parse(readFileSync(join(project, leaf, "tools/data/scope-grid.json"), "utf8")) as
    Record<string, { stages: Record<string, string> }>;
  const result: Record<string, number> = {};
  const proposal = join(project, ".lb-grid-check.json");
  try {
    for (const scope of RELEASE.scopes) {
      if (!grid[scope]) throw new Error(`${harness}: missing scope ${scope}`);
      writeFileSync(proposal, JSON.stringify(grid[scope]));
      const proof = JSON.parse(run(process.execPath, [
        join(project, leaf, "tools/aidlc-graph.ts"), "validate-grid", "--proposal", proposal,
        "--strict", "--project-type", "brownfield",
      ], project, graphEnvironment(project, leaf, harness))) as {
        valid: boolean; errors: string[]; advisories: string[]; summary: { execute: number };
      };
      if (!proof.valid || proof.errors.length || proof.advisories.length) {
        throw new Error(`${harness}/${scope}: ${JSON.stringify(proof)}`);
      }
      result[scope] = proof.summary.execute;
    }
  } finally {
    rmSync(proposal, { force: true });
  }
  return result;
}

function completeCodexRunners(project: string): void {
  // The pinned compose hook checks .codex/skills before calling runner-gen.
  // The installed generator already resolves Codex's real .agents/skills path.
  const env = graphEnvironment(project, ".codex", "codex");
  const generator = join(project, ".codex/tools/aidlc-runner-gen.ts");
  run(process.execPath, [generator, "write"], project, env);
  run(process.execPath, [generator, "scopes"], project, env);
  for (const scope of RELEASE.scopes) {
    const guardDir = join(project, ".agents/skills", scope, "agents");
    mkdirSync(guardDir, { recursive: true });
    // Match the explicit-invocation policy supplied by AWS's Codex emitter.
    writeFileSync(join(guardDir, "openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
  }
}

export function assemble(output: string): string {
  const destination = resolve(output);
  if (existsSync(destination)) throw new Error(`Output already exists: ${destination}. Choose a new output directory.`);
  run("git", ["merge-base", "--is-ancestor", RELEASE.upstream.commit, "HEAD"]);
  const enginePaths = ["core", "harness", "scripts", ":(exclude)scripts/package-lb.ts"];
  run("git", ["diff", "--exit-code", RELEASE.upstream.commit, "--", ...enginePaths]);
  if (run("git", ["ls-files", "--others", "--exclude-standard", "--", ...enginePaths]).trim()) {
    throw new Error("Untracked engine or packaging files would invalidate upstream provenance.");
  }
  const engine = readFileSync(join(ROOT, "core/tools/aidlc-version.ts"), "utf8");
  if (!engine.includes(`AIDLC_VERSION = "${RELEASE.upstream.engineVersion}"`)) throw new Error("Engine version differs from distribution provenance.");
  run(process.execPath, [join(ROOT, "scripts/package.ts"), "--check"]);

  mkdirSync(dirname(destination), { recursive: true });
  const staging = mkdtempSync(join(dirname(destination), ".lb-package-"));
  try {
    const checks: Record<string, Record<string, number>> = {};
    for (const harness of RELEASE.harnesses) {
      const project = join(staging, "dist", harness);
      const plugin = join(staging, "dist/plugins", RELEASE.plugin, harness);
      cpSync(join(ROOT, "dist", harness), project, { recursive: true });
      cpSync(join(ROOT, "dist/plugins", RELEASE.plugin, harness), plugin, { recursive: true });
      const leaf = harnessLeaf(harness);
      const configPath = join(project, leaf, "tools/data/harness.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.plugins = ["aidlc", RELEASE.plugin];
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      const compose = (): void => {
        const result = runPluginCompose({ harness, harnessLeaf: leaf, projectDir: project, pluginBuilt: plugin });
        const drops = readPluginDropEntries(project, RELEASE.plugin);
        const unexpected = drops.filter((entry) => {
          if (entry.severity !== "advisory") return true;
          if (harness === "codex" && entry.message === "runner regeneration skipped: .codex/skills not present in this install") return false;
          if (harness === "opencode" && entry.message === "stage-table refresh skipped: SKILL.md missing BEGIN marker") {
            // opencode intentionally has no stage summary region. This plugin
            // may change scope membership, but must leave the stage table equal.
            const utility = "tools/aidlc-utility.ts";
            const stock = join(ROOT, "dist", harness);
            return run(process.execPath, [join(project, leaf, utility), "stage-table"], project, graphEnvironment(project, leaf, harness)) !==
              run(process.execPath, [join(stock, leaf, utility), "stage-table"], stock, graphEnvironment(stock, leaf, harness));
          }
          return true;
        });
        if (result.status !== 0 || unexpected.length) throw new Error(`${harness}: compose failed\n${result.stderr}\n${result.stdout}\n${JSON.stringify(unexpected)}`);
        if (harness === "codex") completeCodexRunners(project);
        // Every advisory must fail, be repaired, or prove irrelevant above.
        // Do not hash timestamped build health logs into the install tree.
        rmSync(join(project, "aidlc/spaces/default/intents"), { recursive: true, force: true });
      };
      compose();
      const first = inventory(project);
      compose();
      if (JSON.stringify(first) !== JSON.stringify(inventory(project))) throw new Error(`${harness}: second composition changed the package.`);
      checks[harness] = verifyScopes(project, leaf, harness);
      console.log(`[${harness}] composed and verified ${JSON.stringify(checks[harness])}`);
    }
    cpSync(join(ROOT, "docs/guide/lb-distribution.md"), join(staging, "README.md"));
    cpSync(join(ROOT, "LB_CHANGELOG.md"), join(staging, "LB_CHANGELOG.md"));
    cpSync(join(ROOT, "LICENSE"), join(staging, "LICENSE"));
    const pluginMetadata = JSON.parse(readFileSync(join(ROOT, "plugins", RELEASE.plugin, ".aidlc-plugin/plugin.json"), "utf8"));
    const metadata = {
      ...RELEASE,
      sourceCommit: run("git", ["rev-parse", "HEAD"]).trim(),
      workingTreeDirty: run("git", ["status", "--porcelain"]).trim().length > 0,
      pluginVersion: pluginMetadata.version,
      packagingAdapters: ["codex-native-runner-completion"],
      acceptedAdvisories: ["opencode has no stage summary region; generated stage table verified unchanged"],
      verification: { kind: "deterministic-composition-and-artifact-dependencies", scopes: checks },
      files: inventory(staging),
    };
    writeFileSync(join(staging, "distribution-manifest.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    renameSync(staging, destination);
    return destination;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

export function harnessLeaf(harness: string): string {
  // Read the installed manifest data; no parallel table of harness paths.
  const targets = JSON.parse(readFileSync(join(ROOT, "dist/claude/.claude/tools/data/plugin-targets.json"), "utf8")) as
    Record<string, { harnessLeaf: string }>;
  const target = targets[harness];
  if (!target) throw new Error(`Unknown harness ${harness}`);
  return target.harnessLeaf;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args[0]?.startsWith("-")) {
    console.error("Usage: bun scripts/package-lb.ts [new-output-directory]");
    process.exitCode = 2;
  } else {
    try { console.log(`Built ${assemble(args[0] ?? join(ROOT, "build/lb-aidlc-workflows"))}`); }
    catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
  }
}
