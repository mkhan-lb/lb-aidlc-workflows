# Logicbroker distribution changelog

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
