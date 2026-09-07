---
target: requirements-analysis
plugin: service-workflows
adds:
  scopes:
    - service-workflows-backend
    - service-workflows-backend-design
fragments:
  - anchor: before-step:1
    order: 100
---

## fragment: before-step:1

### Backend scope guidance (service-workflows)

For `service-workflows-backend` or `service-workflows-backend-design` only, read
`{{HARNESS_DIR}}/scopes/<active-scope>.md` and apply its outcome, selection limits,
and verification posture during this stage. Include these decisions in the
requirements; reuse affirmed practices and ask about unresolved choices.
