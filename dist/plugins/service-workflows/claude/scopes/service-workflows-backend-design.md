---
name: service-workflows-backend-design
plugin: service-workflows
depth: Standard
testStrategy: Standard
description: One backend service with functional and nonfunctional design
skeleton: on
review_cap: advisory
runner: true
---

# Backend service with design

Use for one independently delivered backend service with a clear outcome whose new
business rules, data model, or NFR decisions require dedicated design. This route
adds Functional Design, NFR Requirements, and NFR Design to the twelve-stage backend
route. Keep formal requirements, domain/unit boundaries, contracts, and delivery
planning so all required design inputs have producers.

Finish at verified implementation ready for review. Add infrastructure, CI creation,
deployment, and operational stages when the actual outcome requires them; validate
their required artifacts when composing that expanded plan. Market discovery, UI
mockups, team formation, and product-wide planning are outside this profile.

Change authoritative contracts first, regenerate transport, keep business behavior
handwritten, and run the component's declared verification and existing CI. Preserve
behavioral, contract, denial, boundary, and relevant integration proof. Apply the
AWS production floor of 80% line coverage and CI before merge unless the team's
affirmed posture specifies its applicable floor. Never lower existing thresholds.

Reuse recorded practices and answers. Keep the walking skeleton for a new runtime
path and independent ownership of shared prerequisites. Human gates, plan approval,
and merge/release authorization remain in force. Advisory review does not authorize
exceptions or replace verification evidence.
