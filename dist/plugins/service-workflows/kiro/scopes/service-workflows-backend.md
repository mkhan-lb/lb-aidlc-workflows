---
name: service-workflows-backend
plugin: service-workflows
depth: Standard
testStrategy: Standard
description: One backend service through verified implementation
skeleton: on
review_cap: advisory
runner: true
---

# Backend service

Use for one independently delivered service with a clear outcome and established
domain and platform patterns. The boundary is verified implementation ready for
review; deployment requires the applicable Operation stages in a composed plan.

Requirements must cover success and failure behavior, authorization and tenancy,
data minimization, compatibility, upstream failures, and applicable NFRs. Use the
design variant when new business rules, data models, or security/reliability patterns
need dedicated design. Do not infer platform capability from a template alone.

Keep the Domain Design, Units Generation, Contract Design, and Delivery Planning
artifacts needed to pin the formal API. Prefer one service unit when independently
deliverable; shared prerequisites remain separately owned changes.

Change authoritative contracts first, regenerate transport, implement handwritten
behavior, and run the component's declared verification and existing CI. Preserve
behavioral, contract, denial, boundary, and relevant integration proof. Apply the
AWS production floor of 80% line coverage and CI before merge unless the team's
affirmed posture specifies its applicable floor. Never lower existing thresholds.

Reuse recorded practices and answers; ask about unresolved decisions. Keep the
walking skeleton for a new runtime path. Human stage gates, plan approval, and
merge/release authorization remain in force. Advisory review does not authorize
exceptions. Skipping CI Pipeline means pipeline creation is unnecessary, not that
existing CI verification may be skipped.
