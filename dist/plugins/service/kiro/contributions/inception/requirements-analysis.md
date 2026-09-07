---
target: requirements-analysis
plugin: service
adds:
  scopes:
    - service-backend
    - service-backend-design
fragments:
  - anchor: before-step:1
    order: 100
---

## fragment: before-step:1

### Backend scope guidance (service)

For `service-backend` or `service-backend-design` only, read
`{{HARNESS_DIR}}/scopes/<active-scope>.md` and apply its outcome, selection limits,
and verification posture during this stage. Include these decisions in the
requirements; reuse affirmed practices and ask about unresolved choices.
