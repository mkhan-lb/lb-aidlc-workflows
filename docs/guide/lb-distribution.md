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

## Build the combined package

From a full checkout of `mkhan-lb/lb-aidlc-workflows`, with Git and Bun available:

```sh
bun install --frozen-lockfile
bun scripts/package.ts
bun run check
bun test tests/distribution/lb.test.ts
bun scripts/package-lb.ts build/lb-aidlc-workflows
```

The output directory must not already exist. The first packaging command generates
the stock engine and separate plugin projections. The second stages copies,
enables and composes the plugin, and checks every harness: Claude Code, Codex CLI,
GitHub Copilot, Cursor, Kiro CLI, Kiro IDE, and opencode. The source checkout's
`dist/<harness>` remains stock; use the combined build output to install this
distribution. GitHub's automatically generated source ZIP/tarball is not the
combined distribution.

The artifact contains:

```text
dist/<harness>/                         combined install tree
dist/plugins/service/<harness>/         native plugin projection
distribution-manifest.json              versions, provenance, checks, file hashes
README.md
LB_CHANGELOG.md
LICENSE
```

The plugin is already composed and enabled in each install tree; a separate host
plugin registration is unnecessary for these scopes. Use the corresponding AWS
harness installation procedure against the artifact's `dist/<harness>` tree. For
Cursor, its emitted `install.ts` remains the installation entry point. For an
existing project, merge configuration and instruction files and preserve project
memory, knowledge, and intent history. This builder does not perform an upgrade.

## Versioning and verification

`distribution/lb.json` identifies the downstream version and exact upstream commit.
The current candidate is Logicbroker distribution `0.1.1`, based on upstream commit
`e7689885fb98d380421ec574a7fa9f3301a22205`. That source identifies its engine as
`2.7.1` and includes the solo Code Generation Plan Approval fix; it is not an AWS
`v2.7.1` release. The latest published AWS release checked when preparing this
candidate was `v2.7.0`. The manifest uses `release: null` to make this distinction
explicit. Use a distinct downstream tag such as `lb-v0.1.1` when releasing it.

The builder verifies upstream ancestry, rejects changes to the engine and upstream
packaging sources, and requires generated files to match source. For each harness
it rejects unhandled composition drops, proves composition is idempotent, and validates both
scope grids against the required artifact dependencies in brownfield mode. Tests
also check relocation, unchanged stock routes, and artifact hashes. No test here
claims that a live model completed a service in every host application.

The pinned AWS compose hook checks `.codex/skills`, although Codex discovers
`.agents/skills`. The builder handles only that exact advisory by running AWS's
installed runner generator against the native path and adding the same explicit
invocation policy as AWS's Codex emitter. Tests verify the native shortcuts and
their policy files. The manifest records this packaging adapter; no engine or
compose-hook source is patched. Prefer the combined tree over installing the
standalone Codex plugin projection until upstream fixes this check.

The opencode shell has no generated stage-summary region. Its exact missing-marker
advisory is accepted only after verifying that the generated stage table is
unchanged from stock. Its scope table and runners are still regenerated and tested.

The manifest records the checkout commit, dirty-worktree status, engine/plugin
versions, and SHA-256 hashes for every other artifact file. A local dirty build is
a review candidate, not an immutable release. Publish from a clean, reviewed
commit. Hashes detect content changes; they are not a signed release attestation.

The `Logicbroker distribution` workflow runs the dedicated tests and uploads a
combined tarball for review. It does not create tags or publish GitHub Releases.

The inherited `Deploy Documentation` workflow still builds and validates docs on
matching pull requests and pushes. Forks skip the Pages upload and deployment by
default because GitHub Pages must be configured separately. To publish a fork's
site, configure Pages to use GitHub Actions, update the site and repository URLs
in `zensical.toml`, and set the repository Actions variable `DEPLOY_DOCS` to `true`.
Upstream documentation deployment remains enabled without that variable.

## Integrate with ai-skills

The current ai-skills installer still selects AWS `v2.7.0`. This change does not
switch it or alter a shared-services project. The next integration should:

1. Download a version-pinned combined release asset from this fork, rather than a
   GitHub source archive, and verify its recorded provenance and file inventory.
2. Select the requested harness and merge its project configuration while
   preserving memory, intent records, knowledge, and project-owned settings.
3. Verify that both scopes are available after installation; select one explicitly
   for the next service intent.

For upstream updates, advance the pinned commit, review AWS changes, regenerate
the projections, and rerun the same seven-harness checks before publishing a new
downstream version. Keep the plugin isolated unless an actual engine limitation
requires an upstream fix.
