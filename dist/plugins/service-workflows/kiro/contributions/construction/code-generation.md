---
target: code-generation
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
`{{HARNESS_DIR}}/scopes/<active-scope>.md` and apply its contract generation,
ownership, walking skeleton, and verification posture in the code plan and
implementation. Preserve the stage's existing plan-approval gate.
