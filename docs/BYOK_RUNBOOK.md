# BYOK Ops Runbook

## Purpose
Operational playbook for BYOK payment activation, routing, and entitlement incidents.

## Core Endpoints
- `POST /api/byok/wix/webhook`
- `GET /api/byok/activation-status?checkoutSessionId=...`
- `GET /api/superadmin/byok/webhook-events`
- `GET /api/superadmin/byok/ops-health`
- `POST /api/superadmin/byok/reset-trial`
- `POST /api/superadmin/byok/reconcile`

## Fast Triage Flow
1. Open BYOK Ops Health in SuperAdmin (`byok` tab).
2. Check:
   - webhook errors (1h rate/count),
   - stale pending activations,
   - routing drift,
   - entitlement drift.
3. Open webhook events table and filter:
   - `status=ERROR` first
   - then by `packageCode` and `checkoutSessionId`.
4. Confirm if incident is:
   - relay/auth/security issue,
   - webhook processing issue,
   - domain routing drift,
   - entitlement drift.

## Scenario A: Missed Webhook / Delayed Activation
Symptoms:
- Callback remains pending/delayed.
- No `PROCESSED` event yet.

Actions:
1. Filter webhook events by `customerEmail`/`orderId`.
2. Confirm whether Wix event arrived.
3. If event missing:
   - verify Wix automation status,
   - verify Worker logs and secret match.
4. If event arrived but errored:
   - fix payload/auth issue and replay.
5. Run reconcile if entitlement/routing drift exists.

## Scenario B: Wrong-Domain Activation
Symptoms:
- Entitlement updated but user lands on wrong domain.

Actions:
1. Check org `routingDomain` vs expected package domain.
2. If drift is detected:
   - run org-level reconcile from SuperAdmin.
3. Re-test login and callback routing.

## Scenario C: Duplicate/Replay Events
Symptoms:
- Same `eventKey` sent multiple times.

Expected:
- System is idempotent; no duplicate entitlement mutation.

Actions:
1. Verify webhook event status remains stable.
2. Confirm no additional side effects on org/user limits.

## Scenario D: Security Rejections
Common codes:
- `WEBHOOK_RATE_LIMITED`
- `UNAUTHORIZED_WEBHOOK`
- `INVALID_WEBHOOK_PAYLOAD`
- `WEBHOOK_SIGNATURE_MISCONFIGURED`
- `INVALID_WEBHOOK_SIGNATURE`

Actions:
1. For auth errors: verify Worker -> backend secret alignment.
2. For signature errors: verify HMAC secret and timestamp generation.
3. For misconfiguration: verify strict env keys are present.
4. For rate limits: confirm spike source and tune threshold carefully.

## Daily Ops Jobs
- Reconciliation report:
  - `npm run jobs:byok-reconcile-report`
- Reconciliation with repair:
  - `npm run jobs:byok-reconcile-report -- --repair`
- Alert threshold checker:
  - `npm run jobs:byok-ops-alert-check`

## Recommended Cron (example)
- Every day 03:10 UTC:
  - `jobs:byok-reconcile-report`
- Every 5 minutes:
  - `jobs:byok-ops-alert-check`

## Escalation
- P1 (Critical): checkout broken globally, webhook auth broken, or widespread failed activations.
- P2 (High): per-package incident, stale pending backlog, repeated routing drift.
- P3 (Medium): isolated user/org mismatch resolved via reconcile/reset-trial.
