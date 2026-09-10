# Logicbroker distribution changelog

## [0.2.1] - 2026-09-10

Refresh the LB distribution onto official AWS AI-DLC 2.8.1. Update the native
machine runtime and refresh each project between workflows using the verified LB
archive, followed by plugin sync. No manual workflow-record migration is required.

- Include AWS's same-version update, native hook dispatch, and Plan Approval fixes.
- Stop forcing Bedrock and AWS model pins in fresh LB Claude projections; retain
  existing developer provider choices when reviewing an upgrade.
- Keep both service scopes and all seven harness projections, with unchanged AWS
  engine source and service plugin 0.1.1.
- Document the native manifest's deletion risk for repo-authored harness knowledge.

## [0.2.0] - 2026-09-08

Upgrade to official AWS AI-DLC 2.8.0 and its native consumer channel. Refresh
repositories through a verified LB archive and AWS's transactional `aidlc config`.

- Remove Bun/Node/Python from consumer installation and runtime prerequisites.
- Preserve service-backend and service-backend-design across all seven harnesses.
- Recognize exact AWS 2.7.0 and LB 0.1.1 legacy files; retain modified-file conflicts
  and workspace preservation instead of silently overwriting existing projects.
- Emit per-harness native archives and stop tracking generated plugin projections.
- Document the separate machine/repository update lifecycle and readiness CLI name.

## [0.1.1] - 2026-09-07

Rename the backend scopes to `service-backend` and `service-backend-design`.
The plugin namespace is now `service`, matching AWS's required scope-name prefix.
Stage selection and verification behavior are unchanged. Rebuild the combined
package; the previous candidate's scope names are no longer included.

## [0.1.0] - 2026-09-07

First distribution candidate, based on the exact AWS main commit recorded in
`distribution/lb.json`. The engine identifies as 2.7.1; this is not an AWS 2.7.1
release. It includes the upstream solo Plan Approval fix.

- Add a 12-stage backend scope and a 15-stage variant with functional and NFR design.
- Build and verify a combined distribution for all seven AWS harnesses.
- Record engine provenance, extension version, and per-file SHA-256 hashes.
- Add deterministic composition, route, relocation, and package verification.
- Complete Codex scope runners in its native skills directory around the pinned
  upstream compose hook's legacy-directory check.

Upgrade consumers only from a reviewed distribution artifact. Preserve existing
project settings, memory, intent records, and knowledge; this release builder is
not an installer. The ai-skills installer has not yet been switched to this fork.
