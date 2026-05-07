# BYOK Master Plan

## Objective
- Deliver a deterministic BYOK and paid onboarding flow across:
  - `byok.link`
  - `picdrift.app`
  - `visualfx.app`
  - `picdrift.studio`
  - `visualfx.studio`

## Guardrails
- No paid activation UI without backend-verified entitlement transition.
- No webhook replay side effects.
- BYOK policy does not leak into manual tenant workflows.
- Redirects must be loop-bounded and domain-canonical.

## API Contracts
- `POST /api/byok/checkout-intent`
  - Input: `{ packageCode }`
  - Output: `{ checkoutSessionId, packageCode, returnUrl, checkoutUrl }`
- `GET /api/byok/activation-status?checkoutSessionId=...`
  - Output: `{ status: PENDING|PROCESSED|ERROR, lifecycle, packageCode, routingDomain }`
- `POST /api/superadmin/byok/reset-trial`
  - Input: `{ organizationId? , email? , reason? }`
- `POST /api/superadmin/byok/reconcile`
  - Input: `{ organizationId? }`
- `GET /api/superadmin/byok/webhook-events`
  - Query: `status, packageCode, organizationId, from, to, limit`

## Checkout/Webhook Lifecycle
- Checkout intent creates a `checkoutSessionId`.
- Callback URL includes `checkoutSessionId` and plan.
- Webhook correlation tracks lifecycle:
  - `RECEIVED`
  - `VERIFIED`
  - `PROCESSED`
- Activation is successful only when:
  - correlated webhook reaches `PROCESSED`
  - runtime entitlement resolves to paid package.

## Frontend Callback UX
- Dedicated callback route: `/billing/return`.
- State progression:
  - Redirecting to checkout
  - Waiting for payment confirmation
  - Activating package
  - Activation complete
  - Activation delayed
- Callback never trusts query params as payment success.

## Routing Stability
- Profile chooser remains first gate for multi-profile auth.
- Canonical domain redirects use a hop budget (`__drh`) to prevent loops.
- Callback route is exempt from premature redirect enforcement.

## Entitlement Integrity
- BYOK trial baseline remains:
  - 5 users
  - 3 shared projects
  - 5 renders/day
  - 14 days
- Paid app baseline remains:
  - 1 user
  - 3 projects
  - admin locked
  - 7-day retention

## Recovery Operations
- `reset-trial` re-applies BYOK trial package and entitlement.
- `reconcile` repairs org/package drift from entitlement source of truth.
- `webhook-events` provides audit and troubleshooting surface.
