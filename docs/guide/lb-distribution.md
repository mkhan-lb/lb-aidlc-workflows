# Logicbroker AI-DLC distribution

This fork packages AWS AI-DLC with a small `service` plugin for backend
work. The AWS engine and harness sources remain unchanged. Scope membership and
guidance live in the plugin, so upstream engine updates do not require maintaining
seven copies of the methodology.

## Choose the outcome

| Scope | Configured stages | Intended outcome |
| --- | --- | --- |
| `service-backend` | 12 | One service using established domain and platform patterns, implemented and verified |
| `service-backend-design` | 15 | The same outcome with dedicated functional and NFR design |
| Stock `feature` | 33 | A full lifecycle including operational work |

The 12-stage route retains Workspace Scaffold, Workspace Detection, State Init,
Reverse Engineering, Practices Discovery, Requirements Analysis, Domain Design,
Units Generation, Contract Design, Delivery Planning, Code Generation, and Build
and Test. The 15-stage route adds Functional Design, NFR Requirements, and NFR
Design. Required artifact producers are retained, including the domain and unit
artifacts consumed by Contract Design.

These are configured stage counts, not a promise of 12 or 15 conversations.
Initialization, conditional skips, per-unit execution, walking skeletons, reviews,
and human approvals affect actual interactions. Both scopes finish at verified
implementation ready for review. Use composition to include deployment and
operational stages when the requested outcome requires them.

Both use Standard depth, Standard tests, advisory reviews, and a walking skeleton.
They retain explicit verification expectations, including authorization, tenancy,
failure behavior, compatibility, applicable NFRs, and existing CI. The scope text
states the AWS production coverage/CI posture explicitly because custom scope
names do not inherit policies keyed to AWS's stock names. This is agent guidance;
repository CI remains responsible for enforcing its thresholds. Additive fragments
in Requirements Analysis, Code Generation, and Build and Test instruct the agent
to read the active backend scope file. This delivery matters: the engine loads
scope frontmatter for routing, but does not automatically deliver its prose.

## Select a scope

After installing the combined package, invoke:

```text
/aidlc --scope service-backend
/aidlc --scope service-backend-design
```

On Codex use `$aidlc` with the same arguments. The upstream default scope is
unchanged. Use stock `bugfix` or `refactor` for those tasks. Do not silently change
an active intent's scope as part of an installation or upgrade.

Keep service contracts, generators, repository verification commands, and team
knowledge in the consuming repository. Reuse affirmed practices; do not copy a
particular service's assumptions into this reusable plugin.

## Native installation and upgrades

Distribution 0.2.0 uses the official AWS AI-DLC **2.8.0 native binary** with
Logicbroker's separately versioned, harness archives carrying the service plugin. Consumers need
neither Bun, Node.js, nor Python. Bun and TypeScript remain maintainer build tools.
The AWS commit is `0d399dd828b59e84d90f7cc198c69fab9ad8f1a7` (`v2.8.0`).
The service plugin remains 0.1.1; the AWS engine sources are unchanged.

Use `/aidlc-workflows:install` from ai-skills for the pinned, verified installation.
AWS's lifecycle is `aidlc update`, then `aidlc doctor` and `aidlc config` in each
project **between workflows**, followed by `/aidlc plugin sync` for projects with
plugins. The machine update does not rewrite existing projects. For Logicbroker,
the installer pins the native update and supplies the verified LB archive to
project config:

1. Verify the official AWS binary, runtime, and installer against the committed
   AWS release checksums before running its native installer.
2. Verify the selected `lb-aidlc-<harness>.tar.gz` against the downstream release
   checksum. Never substitute GitHub's source archive or the stock AWS projection.
3. Update an existing native machine installation from the verified AWS release
   directory, or use the verified AWS installer for the first native installation:

```sh
aidlc update --version 2.8.0 --from "$VERIFIED_AWS_RELEASE_DIR" --offline
```

4. Run `aidlc doctor --project-dir "$TARGET"` before refreshing that project.
   An older project projection is expected until config runs. Address any settings
   conflicts, version pin transition, or unfinished workflow before applying.
5. Preview with the native command, then apply its exact plan token:

```sh
aidlc config --project-dir "$TARGET" --harness claude \
  --from "$VERIFIED_LB_ARCHIVE" --mcp none --dry-run --json
# Read data.planToken from the JSON response, then use that exact value:
aidlc config --project-dir "$TARGET" --harness claude \
  --from "$VERIFIED_LB_ARCHIVE" --mcp none --plan-token "$PLAN_TOKEN" --json
```

After refreshing, run `/aidlc plugin sync` for every installed plugin. The LB
compose source is retained at `<harness-dir>/plugins/service`; use that path as
`AIDLC_PLUGIN_ROOT` with `aidlc engine plugin sync`. Then run native
`aidlc engine graph compile`, `aidlc engine gen runners`, and
`aidlc engine gen runner-scopes` against the target harness. The explicit rebuild
is needed when the precomposed plugin makes sync a no-op after config regenerated
a grid from an older installation. Run one final native config preview/apply
against the same LB archive to refresh the orchestrator tables and record the
composed baseline. Verify the 12/15-stage routes afterward.

AWS 2.8.0 refuses adding a new second harness to a configured repo. Use a separate
checkout; preserve receipts for any compatible harnesses already installed.

`--dry-run` writes nothing to the target. AWS's configuration transaction owns
its managed-file baseline, checks for concurrent edits, and stages/rolls back its
writes. Do not replace it with a recursive copy or blanket `--force`.

Exact unchanged files from AWS 2.7.0 and LB 0.1.1 are recognized by the historical
SHA-256 signatures in `distribution/legacy-signatures.json`. These signatures
come only from the identified releases, never from a consuming checkout. Existing
workspace memory, project knowledge, and history are preserved. Existing 2.7.2
workflow records need no migration; earlier releases must follow intervening
AWS upgrade notes. Retired unowned
copy-channel tool files can remain on disk; the installed entry points invoke the
native executable and do not require those TypeScript files or Bun.

Locally modified framework files, including customized host settings, remain
conflicts. Compare old/current/new files, preserve provider/model, permission,
custom hooks and instructions, and review the reconciliation separately before
retrying. A conflict is not a successful upgrade. Settings embedded in legacy
`harness.json` need migration to AWS's layered `aidlc.settings.json`; report the
specific keys instead of dropping them. Unknown versions have no automatic
ownership grant. Back up reconciled files and keep changes reviewable in Git.

AWS 2.8.0 refuses refresh while any unfinished workflow exists, including parked
intents. Finish or explicitly resolve that workflow before retrying; do not mark
it complete just to install an update. Updating the machine binary alone does not
migrate a repository. A project with an older `.aidlc-version` pin also needs an
explicit pin transition; report it before changing the project's intended version.

Always pass the **verified LB archive** on future repository refreshes. Plain
`aidlc config` selects the stock installed AWS runtime and can remove the LB
contributions it previously owned. `aidlc update` updates the machine runtime,
not the LB distribution pin or repository. Native engine and LB project updates
must be tested and repinned together in ai-skills.

Keep the internal Logicbroker readiness scorer in its managed version directory
or expose it as `aidlc-readiness`. AWS owns the `aidlc` workflow command. The AWS
installer refuses to overwrite an unrelated executable at its destination.

## Build and release

Maintainers need Git, Bun, and a verified official AWS 2.8.0 native executable.
Fetch the native binary from the official release and verify its checksum before
setting `LB_AIDLC_NATIVE_EXECUTABLE`. The distribution CI demonstrates the exact
Linux checksum and how to prepare both immutable historical fixture directories.

```sh
bun install --frozen-lockfile
bun run check
export LB_AIDLC_NATIVE_EXECUTABLE=/absolute/path/to/verified/aidlc
export LB_AIDLC_LEGACY_ROOT=/absolute/path/to/legacy-fixtures
bun test tests/distribution/lb.test.ts
bun scripts/package-lb.ts build/lb-aidlc-workflows
```

The fixture root contains `aws270/dist/<harness>` from commit
`96b11d39028955d4f92375e783525db5275cdfd8`, and `lb011/dist/<harness>` from
the verified LB 0.1.1 combined asset. Its SHA-256 is
`b76f728eae02b7d2aa9d4bdd2f407b50d3e0508b0ccdea8d048fe54b6c4f44b9`.
The historical-signature map records all shared framework-file paths (excluding
project-owned `aidlc/`) and exact legacy managed-block root files. To regenerate,
hash those files from the verified release directories, union the hashes by
harness/path, and retain the source commit and archive checksum in the map.

The output directory must be new. The builder copies `dist-release/<harness>`,
composes the service plugin through the native engine, and validates all seven
harnesses. Installation archives carry the composed engine and retained plugin. Both `dist/` and `dist-release/` are ignored build outputs, never committed.

```text
runtime/<harness>/                     verified composed reference projection
lb-aidlc-<harness>.tar.gz               native config --from input (flat root)
dist/plugins/service/<harness>/        plugin projection used during composition
distribution-manifest.json             source versions, verification, all hashes
README.md / LB_CHANGELOG.md / LICENSE
```

AWS's Codex compose hook still checks `.codex/skills`; the builder completes its
runners in `.agents/skills` and retains explicit invocation. opencode's missing
stage-table marker is accepted only when the table is proven unchanged. No
engine or compose-hook source is patched.

The tests exercise native commands with Bun and Node absent from PATH, verify
12/15-stage scope routes across seven harnesses, and cover archive installation,
legacy adoption, conflicts, dry-run preservation, and repeat configuration. They
do not claim a live model completed a service in every harness.

Publish from a clean reviewed commit using a distinct downstream tag
`lb-v0.2.0`. Publish the seven harness archives, manifest, and combined tarball;
record their actual SHA-256 values in ai-skills only after verifying the published
assets. AWS's binary and runtime retain their official AWS provenance. Do not
relabel a fork binary as an official AWS release.

The `Logicbroker distribution` workflow produces a candidate artifact; it does
not publish releases or switch consumer repositories. The fork's documentation
workflow requires the `DEPLOY_DOCS=true` repository variable to deploy Pages.
