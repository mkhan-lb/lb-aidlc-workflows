---
target: code-generation
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
`{{HARNESS_DIR}}/scopes/<active-scope>.md` and apply its contract generation,
ownership, walking skeleton, and verification posture in the code plan and
implementation. Preserve the stage's existing plan-approval gate.
