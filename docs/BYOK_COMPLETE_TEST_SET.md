# BYOK Complete Test Set (P0-P4)

## Scope
This test set validates the full BYOK rollout across:
- `byok.link`
- `picdrift.app`
- `visualfx.app`
- `picdrift.studio`
- `visualfx.studio`

It is intended to be executed after P3/P4 hardening is complete.

---

## 1. Preconditions

Verify before running tests:

1. Latest backend/frontend is deployed from `origin/main`.
2. Backend env is set for relay + strict webhook mode:
   - `BYOK_WIX_REQUIRE_SIGNATURE=true`
   - `BYOK_WIX_ALLOW_QUERY_SECRET=false`
   - `BYOK_WIX_ALLOW_BODY_SECRET=false`
   - `BYOK_WIX_WEBHOOK_SECRET=<relay_to_backend_secret>`
   - `BYOK_WIX_SIGNATURE_SECRET=<worker_hmac_secret>`
3. Cloudflare Worker relay is deployed and active.
4. Wix automations are configured for all packages.
5. SSL/SAN includes all 5 apex + 5 www domains.
6. Nginx passes `nginx -t` and is reloaded.
7. Test accounts exist:
   - BYOK trial owner
   - BYOK member
   - Manual tenant admin/user
   - Superadmin
8. Superadmin APIs reachable.
9. Logs accessible:
   - backend logs (`pm2 logs my-backend`)
   - Worker logs
   - Cloudflare security events

---

## 2. Test Data Matrix

Use these package codes:
- `PD_APP`
- `VFX_APP`
- `PD_STUDIO`
- `VFX_STUDIO`
- `VFX_STUDIO_AGENCY`

Domain expectations:
- `BYOK_TRIAL` -> `byok.link`
- `PD_APP` -> `picdrift.app`
- `VFX_APP` -> `visualfx.app`
- `PD_STUDIO` -> `picdrift.studio`
- `VFX_STUDIO` and `VFX_STUDIO_AGENCY` -> `visualfx.studio`

---

## 3. P0 - Payment + Onboarding Orchestration

### P0.1 Checkout intent creation
1. From BYOK trial account, open upgrade modal and choose any package.
2. Confirm backend receives `POST /api/byok/checkout-intent`.
3. Validate response contains:
   - `checkoutSessionId`
   - `checkoutUrl`
   - `returnUrl` with `/billing/return`

Expected:
- Intent persisted as pending session event.
- No entitlement change yet.

### P0.2 Return arrives before webhook
1. Initiate checkout and manually open callback URL with `checkoutSessionId`.
2. Ensure webhook has not yet been delivered.
3. Observe callback page state.

Expected:
- Shows waiting/activating states, not success.
- `GET /api/byok/activation-status` returns `PENDING`.

### P0.3 Webhook arrives before return
1. Complete checkout so webhook processes first.
2. Then open callback route.

Expected:
- Callback resolves rapidly to success.
- Activation status returns `PROCESSED`.

### P0.4 Duplicate webhook event
1. Replay same webhook payload/event key.

Expected:
- Idempotent behavior.
- No duplicate entitlement or side effects.
- Webhook response indicates duplicate/processed.

### P0.5 Unsupported package code webhook
1. Send signed webhook with invalid `packageCode`.

Expected:
- Marked ignored/error without entitlement mutation.
- Stable error classification.

### P0.6 Missing email webhook
1. Send signed webhook without `customerEmail`.

Expected:
- 400/handled error.
- No activation.

### P0.7 Fallback correlation without checkoutSessionId
1. Trigger Wix automation payload without `checkoutSessionId`.
2. Ensure pending checkout intent exists for same `customerEmail + packageCode`.

Expected:
- Fallback matcher links and marks matching intent as processed.
- Callback eventually completes.

---

## 4. P1 - Cross-Domain Session and Routing Stability

### P1.1 Chooser-first for multi-profile account
1. Login with account that has multiple profiles.

Expected:
- Routed to `/studios` before privileged app access.
- No dead-end "Workspace selection required" loops.

### P1.2 Canonical domain redirect
1. Login to wrong domain for selected profile.

Expected:
- Redirects to org canonical `routingDomain`.
- Deep links preserved.

### P1.3 Loop breaker validation
1. Force repeated cross-domain navigation with markers.

Expected:
- Redirect hop budget prevents infinite loops.

### P1.4 Callback redirect exemption
1. Hit `/billing/return?checkoutSessionId=...` on non-canonical host.

Expected:
- Callback process starts; no premature loop that drops query.

### P1.5 Domain matrix smoke
Run login -> chooser -> projects -> app journey across all 5 domains.

Expected:
- No 404, no loop, no profile dead-end.

---

## 5. P2 - Entitlement Integrity and BYOK Access Model

### P2.1 Trial baseline policy
On BYOK trial org verify:
- max users = 5
- max projects total = 3
- render daily limit = 5
- trial = 14 days

Expected:
- Enforced at API and UI.

### P2.2 Upgrade transitions
Run trial -> each paid package transition.

Expected:
- Correct package/routing/limits applied.

### P2.3 Seat lock on 1-user app plans
For `PD_APP` and `VFX_APP` with >1 members:

Expected:
- Owner/admin remains active.
- Extra seats set locked.
- Locked users blocked from mutating endpoints.

### P2.4 BYOK shared projects visibility
In BYOK org, member users should list shared org projects.

Expected:
- Visibility shared by org.
- Destructive mutations restricted to owner/admin policy.

### P2.5 Manual tenant isolation regression
Run tenant admin/user flows on non-BYOK org.

Expected:
- No BYOK policy bleed.
- Existing tenant behavior unchanged.

### P2.6 Superadmin reset trial API
Call `POST /api/superadmin/byok/reset-trial`.

Expected:
- Entitlement resets to `BYOK_TRIAL`.
- Trial dates and trial limits reapplied.

### P2.7 Superadmin reconcile API
Call `POST /api/superadmin/byok/reconcile` with drifted test org.

Expected:
- Drift detected and repaired.
- Result includes repaired/mismatch fields.

---

## 6. P3 - Security Completion

### P3.1 Unsigned direct backend call rejected
Call backend webhook endpoint directly without valid relay signature.

Expected:
- Rejected (401/invalid signature).

### P3.2 Wrong relay secret rejected
Forward with invalid `x-byok-webhook-secret`.

Expected:
- Rejected.

### P3.3 Expired timestamp rejected
Send signed payload older than allowed window.

Expected:
- Rejected with stable code.

### P3.4 Future-skew timestamp rejected
Send signed payload too far in future.

Expected:
- Rejected with stable code.

### P3.5 Payload tamper check
Sign payload A, send modified payload B.

Expected:
- Signature invalid, request rejected.

### P3.6 Replay defense
Replay same signed event multiple times.

Expected:
- Idempotent handling; no duplicate side effects.

### P3.7 Worker ingress restriction
Call Worker without correct query secret.

Expected:
- Worker rejects unauthorized.

---

## 7. P4 - Ops, Monitoring, and Scale Readiness

### P4.1 Superadmin webhook event listing
Call `GET /api/superadmin/byok/webhook-events` with filters:
- status
- packageCode
- organizationId
- date range

Expected:
- Correct filtered result set.

### P4.2 Alert path - webhook failures
Simulate repeated invalid webhooks.

Expected:
- Error spike is observable/alerted via configured stack.

### P4.3 Alert path - stale pending activation
Create pending checkout that does not complete.

Expected:
- Stale pending is surfaced to ops.

### P4.4 Daily reconciliation report
Run reconciliation report/job.

Expected:
- Actionable diffs emitted with org IDs and mismatch detail.

### P4.5 Runbook drill
Execute runbook scenarios:
- missed webhook
- duplicate/replay event
- wrong-domain callback
- rollback path

Expected:
- Operators can resolve without DB manual edits.

---

## 8. API-Level Contract Tests

### Contract: `POST /api/byok/checkout-intent`
Expected response fields:
- `checkoutSessionId` (non-empty)
- `checkoutUrl` (absolute URL)
- `returnUrl` (absolute URL)
- `packageCode`

### Contract: `GET /api/byok/activation-status`
Expected:
- status in `PENDING | PROCESSED | ERROR`
- `lifecycle`
- `packageCode`
- `routingDomain`

### Contract: superadmin APIs
Validate schema and auth behavior for:
- `/api/superadmin/byok/reset-trial`
- `/api/superadmin/byok/reconcile`
- `/api/superadmin/byok/webhook-events`

Expected:
- Superadmin-only access.
- Stable error codes/messages.

---

## 9. Regression Suite (Critical)

Run before release:
1. Login/logout/profile selection still works.
2. Project CRUD works for manual tenants.
3. BYOK render path honors Fal key + quota + upgrade rules.
4. Admin panel lock behavior for app plans.
5. No false "payment complete" UI without backend confirmation.

---

## 10. Evidence Collection Template

For each case capture:
1. Test ID
2. Timestamp (UTC)
3. Account/profile used
4. Domain used
5. Request/response snippets
6. Screenshot/video
7. Backend log lines
8. Worker log lines
9. Result: PASS/FAIL
10. If FAIL: root cause + owner + ETA

---

## 11. Release Gate Criteria

Release only when all are true:
1. All P0/P1/P2 tests pass.
2. All P3 security tests pass in strict mode.
3. P4 operational tests pass (or documented temporary mitigation approved).
4. Manual tenant regression passes.
5. No unresolved critical/high defects.
