---
target: build-and-test
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
`{{HARNESS_DIR}}/scopes/<active-scope>.md` and apply its coverage and CI floor,
including any affirmed applicable team posture and existing stronger thresholds.
Record behavioral, contract, authorization/tenancy, boundary, and relevant
integration evidence. A skipped CI Pipeline creation stage does not waive CI.
