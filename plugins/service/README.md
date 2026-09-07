# Service workflows

Reusable backend profiles built from AWS's existing stages and agents.

| Scope | Configured stages | Use when |
| --- | --- | --- |
| `service-backend` | 12 | One service uses established domain and platform patterns |
| `service-backend-design` | 15 | New business rules, data models, or NFR decisions need dedicated design |

Both finish at verified implementation ready for repository review. Include
deployment and operational stages through composition when the outcome requires
a running service. Counts include three initialization stages; conditional skips,
per-unit execution, skeleton approval, and review passes change interaction counts.

Invoke `/aidlc --scope service-backend` (`$aidlc --scope
service-backend` on Codex). The default is unchanged; select this profile
explicitly. Use ordinary `bugfix` and `refactor` for those tasks.

The twelve-stage route includes initialization, Reverse Engineering, Practices
Discovery, Requirements Analysis, Domain Design, Units Generation, Contract Design,
Delivery Planning, Code Generation, and Build and Test. Domain and unit artifacts
are retained because Contract Design consumes them. The design variant adds
Functional Design, NFR Requirements, and NFR Design.

## Authoring and validation

Scope identity and defaults live in `scopes/`. Membership lives in the fifteen
`contributions/` files as `adds.scopes`. No core stage bodies or engine code are
replaced. No new personas are needed. Keep service contracts and project-specific
knowledge in the consuming repository.

Three additive stage fragments instruct Requirements Analysis, Code Generation,
and Build and Test to read the backend scope guidance. They apply only when one of
these two scopes is active; scope-file prose is not delivered by the engine itself.

```sh
bun scripts/package.ts
bun test tests/distribution/lb.test.ts
bun scripts/package-lb.ts
```

AWS's packager generates all seven plugin projections. The downstream builder
composes and enables the extension in staged copies of the engine distributions.
See [distribution instructions](../../docs/guide/lb-distribution.md).

## Selection limits

Use the lightweight scope when the outcome, consumers, authorization and tenancy
patterns, and platform capabilities are understood. Add discovery/design work for
unresolved integration, data migration, security, or reliability risks. Shared
platform prerequisites remain separately owned deliverables.

Both profiles keep Standard artifacts and tests, advisory reviews, and a walking
skeleton. Scope text carries the AWS production verification floor explicitly:
a custom name does not inherit floors keyed to stock names. Existing CI must run
even though the CI Pipeline creation stage is omitted.
