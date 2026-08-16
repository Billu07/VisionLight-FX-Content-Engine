# BYOK Execution Board

## Now
- Enforce corrected BYOK trial limits in all project-limit paths:
  - 5 users max
  - 3 total shared projects per BYOK trial org
- Verify downgrade path to app plans:
  - owner remains active
  - owner can keep/use 3 projects
  - non-owner members are seat-locked
- Validate render policy behavior from UI and API:
  - missing Fal key flow
  - upgrade-required flow
  - daily quota flow
- Smoke-test Wix webhook activation in staging/live-like flow:
  - webhook accepted
  - entitlement switched
  - dashboard reflects package change

## Next
- Add automated integration tests for:
  - webhook idempotency and duplicate events
  - invalid signature rejection
  - plan mapping correctness
- Add endpoint-level quota tests for counted routes.
- Add trial-to-paid-to-domain-routing E2E regression tests.
- Add monitoring surface for webhook failures and pending provisioning.

## Later
- Replace poll/focus activation UX with real-time channel (SSE/WebSocket).
- Add richer package provisioning timeline UI for long-running enterprise/agency flows.
- Add superadmin recovery actions for stuck BYOK entitlements.
- Add analytics funnel for:
  - card click -> checkout open
  - checkout return
  - webhook success
  - activation completion

## Risks
- Trial project-limit mismatch risk if any old path still assumes 20 projects.
- False activation UX risk if status transitions are not strictly validated.
- Webhook dependency risk (delays/missed events) without alerting and replay runbook.
- Seat-lock regressions possible when upgrading/downgrading mixed-member orgs.
- Domain routing confusion if canonical domain and entitlement routing drift.

## Acceptance Criteria
- BYOK trial org consistently enforces **5 users + 3 shared projects**.
- App-plan downgrade consistently enforces **1 active owner + 3 projects**.
- No false-positive “payment completed” notifications.
- Valid Wix payment event activates correct package in-place.
- Upgrade modal + package cards remain fully responsive across mobile/desktop.
