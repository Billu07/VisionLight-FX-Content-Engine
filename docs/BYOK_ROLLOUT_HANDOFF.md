# BYOK Rollout Handoff

## 1) Updated Plan (Corrected)

### Goal
- Launch `byok.link` as a self-serve BYOK funnel with isolated BYOK orgs/profiles and in-place paid upgrades.

### Core Behavior
- BYOK users are operationally separated from manual tenant flow (`provisioningSource=BYOK` vs `MANUAL`).
- Signup/auth uses Supabase email/password and bootstraps/attaches BYOK workspace.
- Fal key is linked after entering dashboard (not forced in signup/login).

### Trial (Corrected Rule)
- Trial length: 14 days.
- Trial daily render cap: 5 renders/day.
- Trial keeps full product experience where allowed by policy.
- **Corrected project policy:**
  - BYOK demo org allows **5 users**.
  - BYOK demo org allows **3 total projects** (not 20).
  - Those 5 users collaborate/share within those 3 projects.

### Post-Trial / Paid Behavior
- Trial expiry does not block login; render attempts trigger upgrade requirements.
- Paid package activation is in-place on same BYOK org/profile through Wix webhook.
- For app packages (`PD_APP`, `VFX_APP`):
  - 1 user, 3 projects, admin locked, retention applied.
  - **Owner retains 3 projects; non-owner seats are locked according to downgrade policy.**

### Package Mapping
- `BYOK_TRIAL` -> `byok.link`
- `PD_APP` -> `picdrift.app`
- `VFX_APP` -> `visualfx.app`
- `PD_STUDIO` -> `picdrift.studio`
- `VFX_STUDIO` -> `visualfx.studio`
- `VFX_STUDIO_AGENCY` -> `visualfx.studio`

### v1 Scope
- Enforce entitlement, routing, admin lock, retention, storage/limits, daily quota first.
- Per-model package gating is deferred.

---

## 2) Completed Checklist (This Session)

### Backend/Data/Policy
- [x] BYOK package config + domain mapping implemented.
- [x] Org-level BYOK control fields used in runtime (entitlement/routing/locks/limits/provisioning).
- [x] BYOK status service includes trial state, package, usage, and lock metadata.
- [x] Render policy returns structured codes (`MISSING_FAL_KEY`, `UPGRADE_REQUIRED`, daily limit code).
- [x] BYOK retention cleanup script exists for plans with retention days.
- [x] Seat-lock/admin-lock behavior enforced in backend paths.

### API Surface
- [x] `POST /api/byok/bootstrap`
- [x] `POST /api/byok/link-key`
- [x] `GET /api/byok/status`
- [x] `GET /api/byok/packages`
- [x] `POST /api/byok/wix/webhook`
- [x] `GET /api/superadmin/byok/organizations`
- [x] `POST /api/superadmin/byok/activate`
- [x] `/api/auth/me` payload includes BYOK gating metadata.

### Frontend UX (BYOK)
- [x] Fal key moved from login flow to dashboard-themed modal.
- [x] Persistent `Link Fal Key` guidance CTA added and routed to API Integration tab.
- [x] `Link Fal Key` moved to header action row for visibility.
- [x] Rendering without key now correctly routes to key integration path.
- [x] No-credit UX improved with clearer top-up/admin direction.
- [x] BYOK top info banner made hideable and less cluttered.
- [x] Upgrade entry made always available for BYOK users.
- [x] Upgrade modal redesigned into custom premium package cards.
- [x] Direct Wix checkout links wired per package.
- [x] Current active package is visually indicated.
- [x] Upgrade modal made responsive with internal scrolling.
- [x] Added activation polling/loading experience after checkout.
- [x] Fixed false-positive payment confirmation on tab return.

### Ops/Infra Guidance Delivered
- [x] DNS + Nginx + SSL setup guidance for BYOK and new paid domains.
- [x] Wix automation/webhook configuration support + payload mapping guidance.
- [x] Debugged and resolved `405` routing issue during rollout.

---

## 3) Remaining Gaps / Next-Session Targets

### Functional Gaps
- [ ] Enforce the **corrected trial project rule** in backend limits everywhere: 5 users + 3 total projects (shared).
- [ ] Re-verify downgrade behavior exactly: after moving to 1-user packages, owner keeps 3 projects, non-owner seats locked.
- [ ] Confirm collaboration model behavior over shared 3-project pool in trial (permissions and visibility).

### Reliability / Automation
- [ ] Add deeper automated tests for webhook idempotency + replay + malformed payloads.
- [ ] Add comprehensive counted-endpoint quota tests (all render-consuming routes).
- [ ] Add end-to-end upgrade tests (trial -> paid -> routing/locks/limits updated).

### UX Improvements (Optional, Industry-Grade)
- [ ] Move from poll/focus recheck to real-time activation signal (SSE/WebSocket) for truly automatic completion state.
- [ ] Add explicit processing state for long-running package provisioning (especially agency/on-demand flows).

### API/Route Consistency
- [ ] If strict naming parity is needed with original doc, add alias route:
  - `POST /api/webhooks/wix` -> same handler as `/api/byok/wix/webhook`.

### Observability / Ops
- [ ] Add dashboard/alerts for webhook failures and stale `PENDING` provisioning statuses.
- [ ] Add runbook for manual recovery (missed webhook, failed entitlement transition).

---

## 4) Important Clarification Logged

- Initial plan statement "trial has 20 projects" is now superseded.
- **Authoritative rule going forward:** BYOK trial has 5 users and 3 total shared projects.

