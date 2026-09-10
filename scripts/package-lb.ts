#!/usr/bin/env bun
// Assemble a release candidate without modifying the stock dist or a consumer.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPluginDropEntries } from "../core/tools/aidlc-plugin-test.ts";
import { createTarGz } from "../core/tools/aidlc-archive.ts";
import type { ProjectionDescriptor } from "../core/tools/aidlc-distribution.ts";
import { applyModelPolicyToProjection, modelAgentStem, readAgentTiers, resolveModelPolicy, writeMarkdownAgentSurface } from "../core/tools/aidlc-model-policy.ts";
import type { ModelHarness } from "../core/tools/aidlc-model-policy.ts";

export function nativeExecutable(): string {
  const executable = process.env.LB_AIDLC_NATIVE_EXECUTABLE;
  if (!executable) throw new Error("Set LB_AIDLC_NATIVE_EXECUTABLE to the verified AWS release binary (build/test prerequisite only).");
  return resolve(executable);
}

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
      const proof = JSON.parse(run(nativeExecutable(), [
        "engine", "graph", "validate-grid", "--proposal", proposal,
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
  run(nativeExecutable(), ["engine", "gen", "runners"], project, env);
  run(nativeExecutable(), ["engine", "gen", "runner-scopes"], project, env);
  for (const scope of RELEASE.scopes) {
    const guardDir = join(project, ".agents/skills", scope, "agents");
    mkdirSync(guardDir, { recursive: true });
    // Match the explicit-invocation policy supplied by AWS's Codex emitter.
    writeFileSync(join(guardDir, "openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
  }
}

function inheritClaudeProvider(project: string): void {
  const path = join(project, ".claude/settings.json");
  const settings = JSON.parse(readFileSync(path, "utf8"));
  for (const key of Object.keys(settings.env ?? {})) {
    if (key === "CLAUDE_CODE_USE_BEDROCK" || key === "AWS_REGION" || /^ANTHROPIC_DEFAULT_.*_MODEL$/.test(key)) {
      delete settings.env[key];
    }
  }
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  const onboardingPath = join(project, ".claude/CLAUDE.md");
  const onboarding = readFileSync(onboardingPath, "utf8");
  const bedrockRequirement = /^- \*\*AWS Bedrock access\*\*:.*$/gm;
  if (onboarding.match(bedrockRequirement)?.length !== 1) {
    throw new Error("Claude onboarding provider prerequisite changed upstream; review the LB adapter.");
  }
  writeFileSync(onboardingPath, onboarding.replace(bedrockRequirement,
    "- **Model provider**: Use the provider and models configured in your Claude user or local settings. The Logicbroker distribution does not enable Bedrock or pin AWS model IDs. Direct Claude users need their Claude login; intentional Bedrock users need their chosen AWS credentials, region and model access. See Claude's provider documentation for that setup. Repository refreshes must retain existing provider choices.",
  ));
}

function inheritSessionModels(project: string, harness: ModelHarness): void {
  // Use AWS's persistent inheritance projection, including on native refresh.
  // Explicit per-agent model/effort policies still take precedence over the cap.
  const memory = join(project, "aidlc/spaces/default/memory/org.md");
  const rules = readFileSync(memory, "utf8");
  if (rules.startsWith("---")) throw new Error("AWS org model policy changed; review the LB inheritance default.");
  writeFileSync(memory, "---\n# LB default: AWS's templated projection inherits the session model and effort.\n# This does not change agent responsibilities, workflow stages or scopes.\ntier_cap: templated\n---\n\n" + rules);
  const leaf = harnessLeaf(harness);
  applyModelPolicyToProjection(project, leaf, harness);
  // AWS's native writer updates executable agent surfaces. Keep the copied
  // reference Markdown consistent with those surfaces as well.
  if (harness === "codex" || harness === "opencode") {
    for (const [name, tier] of Object.entries(readAgentTiers(join(project, leaf)))) {
      const path = join(project, leaf, "agents", `${modelAgentStem(name)}.md`);
      writeFileSync(path, writeMarkdownAgentSurface(readFileSync(path, "utf8"),
        resolveModelPolicy(null, name, tier, harness, "templated"),
        { effortKey: harness === "opencode" ? "variant" : "effort" },
      ));
    }
  }
  if (harness === "codex") {
    const path = join(project, ".codex/config.toml");
    const content = readFileSync(path, "utf8");
    const start = content.indexOf("# Model: these session defaults");
    const end = content.indexOf("[model_providers.amazon-bedrock.aws]");
    if (start < 0 || end < start) throw new Error("AWS Codex provider layout changed; review the LB adapter.");
    writeFileSync(path, content.slice(0, start) +
      "# Use the session/user model and provider. LB does not select Bedrock or pin a model.\n" +
      "# The inactive Bedrock definition below supports native `config providers`.\n" +
      "# Bedrock users must review its profile/region against their chosen settings.\n\n" + content.slice(end));
  }
  if (harness === "kiro") {
    const path = join(project, ".kiro/settings/cli.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    config["chat.modelDefaults"] = {};
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  }
  if (harness !== "claude") {
    const path = join(project, "AGENTS.md");
    let content = readFileSync(path, "utf8");
    if (harness === "codex" || harness === "opencode") {
      content = content.replace(/^- \*\*Model(?:\/provider| provider)\*\*:.*$/m,
        "- **Model/provider**: Use your chosen host provider and session model. LB agent roles inherit that model and effort through AWS's persistent `tier_cap: templated` policy in `aidlc/spaces/default/memory/org.md`. Explicit `aidlc config models` agent choices still win. Review existing provider, AWS profile/region and model settings during upgrades; do not switch an intentional provider to work around missing credentials.");
    }
    if (harness === "codex") {
      content = content.replace(/^- \*\*Personal overrides\*\*:.*$/m,
        "- **Personal settings**: User settings live in `~/.codex/config.toml`; trusted project settings can override them. LB omits session model/provider selection. If you use Bedrock, reconcile the project's retained AWS profile/region template with your chosen settings before starting a session.");
    }
    if (harness === "kiro-ide") content = content.replace("Sign in and select Claude Opus 4.8 as the chat model before starting a workflow.", "Sign in and select a chat model available to your account before starting a workflow.");
    writeFileSync(path, content);
  }
}

export function assemble(output: string): string {
  const version = JSON.parse(run(nativeExecutable(), ["version", "--json"]));
  if (version.binaryVersion !== RELEASE.upstream.engineVersion) throw new Error("Native binary version differs from distribution provenance.");
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
      const project = join(staging, "runtime", harness);
      const plugin = join(staging, "dist/plugins", RELEASE.plugin, harness);
      cpSync(join(ROOT, "dist-release", harness), project, { recursive: true });
      if (harness === "claude") inheritClaudeProvider(project);
      inheritSessionModels(project, harness as ModelHarness);
      cpSync(join(ROOT, "dist/plugins", RELEASE.plugin, harness), plugin, { recursive: true });
      const leaf = harnessLeaf(harness);
      // Retain the native compose source in the installed harness so a refresh
      // can run plugin sync after the temporary release download is removed.
      cpSync(plugin, join(project, leaf, "plugins", RELEASE.plugin), { recursive: true });
      const configPath = join(project, leaf, "tools/data/harness.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.plugins = ["aidlc", RELEASE.plugin];
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      const compose = (): void => {
        run(nativeExecutable(), ["engine", "plugin", "sync"], project, {
          ...graphEnvironment(project, leaf, harness),
          AIDLC_PLUGIN_ROOT: plugin,
        });
        const drops = readPluginDropEntries(project, RELEASE.plugin);
        const unexpected = drops.filter((entry) => {
          if (entry.severity !== "advisory") return true;
          if (harness === "codex" && entry.message === "runner regeneration skipped: .codex/skills not present in this install") return false;
          if (harness === "opencode" && entry.message === "stage-table refresh skipped: SKILL.md missing BEGIN marker") {
            // opencode intentionally has no stage summary region. This plugin
            // may change scope membership, but must leave the stage table equal.
            const stock = join(ROOT, "dist-release", harness);
            return run(nativeExecutable(), ["engine", "gen", "stage-table"], project, graphEnvironment(project, leaf, harness)) !==
              run(nativeExecutable(), ["engine", "gen", "stage-table"], stock, graphEnvironment(stock, leaf, harness));
          }
          return true;
        });
        if (unexpected.length) throw new Error(`${harness}: compose failed\n${JSON.stringify(unexpected)}`);
        if (harness === "codex") completeCodexRunners(project);
        // Every advisory must fail, be repaired, or prove irrelevant above.
        // Do not hash timestamped build health logs into the install tree.
        rmSync(join(project, "aidlc/spaces/default/intents"), { recursive: true, force: true });
      };
      compose();
      const first = inventory(project);
      compose();
      if (JSON.stringify(first) !== JSON.stringify(inventory(project))) throw new Error(`${harness}: second composition changed the package.`);
      // Native config may adopt only bytes proven to come from a prior release.
      // Local modifications remain conflicts; workspace files are never included.
      const signatures = JSON.parse(readFileSync(join(ROOT, "distribution/legacy-signatures.json"), "utf8")) as {
        harnesses: Record<string, { files: Record<string, string[]>; blocks: Record<string, string[]> }>;
      };
      const legacy = signatures.harnesses[harness];
      const descriptorPath = join(project, leaf, "tools/data/aidlc-projection.json");
      const descriptor = JSON.parse(readFileSync(descriptorPath, "utf8")) as ProjectionDescriptor;
      descriptor.legacyManagedFileHashes ??= {};
      for (const [path, hashes] of Object.entries(legacy.files)) {
        descriptor.legacyManagedFileHashes[path] = [...new Set([
          ...(descriptor.legacyManagedFileHashes[path] ?? []), ...hashes,
        ])];
      }
      for (const integration of descriptor.rootIntegrations) {
        if (!legacy.blocks[integration.path]) continue;
        integration.legacySignatures ??= {};
        integration.legacySignatures.wholeFileHashes = [...new Set([
          ...(integration.legacySignatures.wholeFileHashes ?? []), ...legacy.blocks[integration.path],
        ])];
      }
      writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
      checks[harness] = verifyScopes(project, leaf, harness);
      console.log(`[${harness}] composed and verified ${JSON.stringify(checks[harness])}`);
    }
    cpSync(join(ROOT, "docs/guide/lb-distribution.md"), join(staging, "README.md"));
    cpSync(join(ROOT, "LB_CHANGELOG.md"), join(staging, "LB_CHANGELOG.md"));
    cpSync(join(ROOT, "LICENSE"), join(staging, "LICENSE"));
    const pluginMetadata = JSON.parse(readFileSync(join(ROOT, "plugins", RELEASE.plugin, ".aidlc-plugin/plugin.json"), "utf8"));
    const metadata = {
      ...RELEASE,
      channel: "native",
      sourceCommit: run("git", ["rev-parse", "HEAD"]).trim(),
      workingTreeDirty: run("git", ["status", "--porcelain"]).trim().length > 0,
      pluginVersion: pluginMetadata.version,
      packagingAdapters: ["codex-native-runner-completion", "claude-inherit-provider", "session-model-inheritance"],
      acceptedAdvisories: ["opencode has no stage summary region; generated stage table verified unchanged"],
      verification: { kind: "deterministic-composition-and-artifact-dependencies", scopes: checks },
      files: inventory(staging),
    };
    writeFileSync(join(staging, "distribution-manifest.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    // Each archive is a complete projection root accepted by native `config
    // --from`. Consumers never extract arbitrary tar members themselves.
    for (const harness of RELEASE.harnesses) {
      const project = join(staging, "runtime", harness);
      const files = inventory(project);
      const entries = Object.keys(files).map((path) => ({
        path,
        type: "file" as const,
        mode: lstatSync(join(project, path)).mode & 0o777,
        data: readFileSync(join(project, path)),
      }));
      writeFileSync(join(staging, `lb-aidlc-${harness}.tar.gz`), createTarGz(entries));
    }
    // The manifest covers the archives as well as their expanded source trees.
    metadata.files = inventory(staging);
    delete metadata.files["distribution-manifest.json"];
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
