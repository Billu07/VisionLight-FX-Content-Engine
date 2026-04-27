# Domain Routing Plan (PicDrift vs VisionLight)

## Goal
Use a single app/backend, but route tenant owners and tenant users to the correct domain by tenant view:
- `PICDRIFT` tenants -> `picdrift.studio`
- `VISIONLIGHT` tenants -> `visualfx.studio`

Superadmins are exempt from forced domain switching.

## Scope Rules
- Applies to tenant owners and tenant users only.
- Does not use demo-user status as a routing signal.
- Keeps one login route and one frontend codebase.
- Allows hostname-based branding (logo/title) without splitting apps.

## Architecture
- One backend/API.
- One frontend build served on two domains.
- Canonical domain decided by backend from org view type.
- Frontend enforces canonical domain after auth check.

## Backend Changes
1. Extend auth/me payload to include:
- `orgViewType` (`PICDRIFT` or `VISIONLIGHT`)
- `canonicalDomain` (`picdrift.studio` or `visualfx.studio`)
- `domainRedirectRequired` (boolean)
- `isSuperAdmin` (already available or derived)
2. Domain decision logic:
- If `isSuperAdmin` -> no forced redirect.
- Else map org view type to canonical domain.
3. Security guard:
- Optionally reject/redirect protected requests when authenticated tenant user is on wrong domain.
4. CORS/Origin allowlist:
- Include both frontend origins for API access.

## Frontend Changes
1. Keep one `/login` page and one auth flow.
2. After successful auth check:
- If not superadmin and current host != canonical host -> redirect.
3. Preserve deep links during redirect:
- Redirect to same path/query on target domain.
4. Add hostname-based branding:
- `picdrift.studio` branding for PicDrift.
- `visualfx.studio` branding for VisionLight.
5. Add safe loop prevention:
- Do not re-trigger redirect if already on canonical domain.

## Infrastructure Changes
1. DNS:
- Point `visualfx.studio` and `picdrift.studio` to the same frontend entry.
2. TLS:
- Valid certs for both domains.
3. Nginx:
- Server blocks for both hosts.
- Same static build upstream/proxy configuration.
4. API origin config:
- Ensure backend trusts both domains.

## Session/Auth Notes
- Different root domains do not share browser storage/cookies.
- Users may need login on each domain unless cross-domain SSO handoff is implemented.
- Phase 1 can proceed without SSO; enforce canonical redirect after login/auth check.

## Test Plan
1. Tenant owner/user in PicDrift org logs in on `visualfx.studio` -> redirected to `picdrift.studio`.
2. Tenant owner/user in VisionLight org logs in on `picdrift.studio` -> redirected to `visualfx.studio`.
3. Superadmin logs in on either domain -> no forced redirect.
4. Deep links (dashboard/project paths) survive redirect.
5. No redirect loop when already on correct host.
6. Both domains pass API calls and websocket/polling behavior.

## Rollout Plan
1. Deploy backend payload/domain logic first.
2. Deploy frontend redirect logic.
3. Enable/verify both domain DNS + TLS + Nginx.
4. Run acceptance matrix with one account from each role.
5. Monitor logs for redirect loops, auth failures, CORS errors.

## Rollback Plan
1. Disable frontend redirect gate via feature flag/env switch.
2. Keep both domains live temporarily with no forced routing.
3. Re-enable once root cause is fixed.

## Implementation Status
Phase 1 implemented (backend auth metadata + frontend protected-route redirect).

## Runtime Config (Implemented)
- Backend env (optional, defaults shown):
  - `PICDRIFT_CANONICAL_DOMAIN=picdrift.studio`
  - `VISIONLIGHT_CANONICAL_DOMAIN=visualfx.studio`
  - `DOMAIN_ROUTING_ENABLED=true`
- Frontend currently consumes canonical host from `/api/auth/me` response, so no frontend domain env is required for routing.

## Current Checkpoint (2026-04-27)
### Completed in Code
- Backend `/api/auth/me` now returns domain-routing metadata:
  - `orgViewType`
  - `canonicalDomain`
  - `domainRoutingEnabled`
  - `domainRedirectRequired`
  - `isSuperAdmin`
- Canonical host mapping is view-based:
  - `PICDRIFT` -> `picdrift.studio`
  - `VISIONLIGHT` -> `visualfx.studio`
- Superadmin users are exempt from forced domain redirects.
- Frontend protected/admin routes now enforce canonical-domain redirect for non-superadmins.
- Redirect preserves deep links (`path + query + hash`).
- Local/private hosts are excluded from redirect enforcement for safe dev/testing.

### Infrastructure Status
- DNS for `visualfx.studio` was requested and is pending client-side update.
- Domain split rollout is intentionally paused until DNS + Nginx + TLS are confirmed.

### Safe Pause Mode (Current)
- Keep backend env as:
  - `DOMAIN_ROUTING_ENABLED=false`
- This keeps platform behavior stable on current domain and prevents dead-domain redirects.

### Resume Checklist (When DNS Is Ready)
1. Confirm DNS resolves to VPS:
- `visualfx.studio` -> `72.61.0.117`
- `www.visualfx.studio` -> `visualfx.studio` (or same VPS via A)
2. Update Nginx `server_name` to include:
- `picdrift.studio www.picdrift.studio visualfx.studio www.visualfx.studio`
3. Validate and reload Nginx:
- `nginx -t`
- `systemctl reload nginx`
4. Ensure SSL cert covers all four hosts (certbot).
5. Set backend env and restart:
- `PICDRIFT_CANONICAL_DOMAIN=picdrift.studio`
- `VISIONLIGHT_CANONICAL_DOMAIN=visualfx.studio`
- `DOMAIN_ROUTING_ENABLED=true`
- `pm2 restart my-backend`
6. Run role-based validation:
- PicDrift tenant on `visualfx.studio` redirects to `picdrift.studio`
- VisionLight tenant on `picdrift.studio` redirects to `visualfx.studio`
- Superadmin works on either domain without forced redirect
