# Platform email (drift.li) — setup

Transactional email for the platform (lead notifications, admin invites,
follow-ups, and whatever the next automations need). The **code is built**:
`src/services/mail.ts` (nodemailer, SMTP) plus two wired notifications. This file
is the one-time **operational** setup — server env + DNS — that you run once.

Until the env vars are set, email is a **safe no-op**: every send is skipped and
logged (`[mail] not configured — skipped ...`), the app runs normally.

---

## 1. Server env vars (required)

The mailbox is `web@drift.li` on Namecheap Private Email (privateemail.com). Add
these to the backend env on the VPS (`/var/www/myapp/backend/.env`):

```bash
SMTP_HOST=mail.privateemail.com
SMTP_PORT=465                       # 465 = SSL/TLS. Use 587 for STARTTLS if 465 is blocked.
SMTP_USER=web@drift.li
SMTP_PASS=<the mailbox password>    # SECRET — server env only, never in git or chat
MAIL_FROM=Drift Link <web@drift.li> # optional; defaults to SMTP_USER
# MAIL_REPLY_TO=web@drift.li        # optional default Reply-To
```

`ADMIN_EMAILS` (already set) is used as the fallback recipient for platform
notifications when a brand has no admin user yet.

Apply:

```bash
# on the VPS
cd /var/www/myapp/backend
# edit .env to add the vars above
pm2 restart my-backend --update-env
```

**Verify:** the boot log prints one of:
- `[mail] SMTP ready — web@drift.li via mail.privateemail.com:465`  ✅
- `[mail] SMTP verify FAILED (...)` → wrong password/port/host.
- `[mail] disabled (SMTP_* env not set)` → env not picked up (did you `--update-env`?).

The `Environment Check` line at boot also shows `smtp: "Loaded"`.

> **Security:** the password lives ONLY in the server env. Don't commit it, don't
> paste it into chat or code. If it's ever exposed, rotate it in the Private Email
> dashboard and update `SMTP_PASS`.

---

## 2. DNS for deliverability (do this — or mail lands in spam)

Automated mail from `web@drift.li` needs SPF + DKIM + DMARC on the **drift.li**
zone (Cloudflare). Add as **DNS-only** (grey cloud) TXT records:

| Type | Name | Value |
|------|------|-------|
| TXT  | `@` (drift.li) | `v=spf1 include:spf.privateemail.com ~all` |
| TXT  | `_dmarc` | `v=DMARC1; p=none; rua=mailto:web@drift.li; fo=1` |
| TXT  | `default._domainkey` | **the DKIM value from the Private Email dashboard** |

- **SPF:** if a `v=spf1` TXT already exists for `@`, don't add a second — merge
  `include:spf.privateemail.com` into the existing one.
- **DKIM:** Namecheap generates the key. In the Private Email admin →
  *your domain → Auto-enable DKIM / show DKIM record* — it gives you the exact
  host (selector, usually `default._domainkey`) and the long `v=DKIM1; k=rsa; p=...`
  value. Copy it verbatim into Cloudflare.
- **DMARC:** starts at `p=none` (monitor only). Once SPF+DKIM pass for a week,
  tighten to `p=quarantine` then `p=reject`.
- **MX / receiving** is already handled by the mailbox setup (privateemail MX
  records); nothing to add for *sending*.

**Check:** after DNS propagates, send a test (below) to a Gmail address and use
"Show original" — SPF, DKIM, and DMARC should all say **PASS**. Or use
mail-tester.com for a spam score.

---

## 3. What's wired right now

Both are best-effort (never block the request; skipped cleanly if email is off):

1. **New lead → brand admins.** When a viewer submits a drift form
   (`POST /api/drift/public/forms/:id/submit`), the brand's ADMIN users get an
   email with the submitted fields. Reply-To is set to the lead's own email when
   the form captured one, so the brand can reply straight to them.
2. **New brand admin → the admin.** When a superadmin creates a drift brand with
   an admin email, that person is emailed their sign-in address + temporary
   password.

Recipients for a brand come from its ADMIN `User` rows (there's no
`Organization.email` field), falling back to `ADMIN_EMAILS`.

---

## 4. Sending mail from new code (future automations)

```ts
import { sendMail, renderEmail } from "../services/mail";

await sendMail({
  to: "someone@example.com",
  subject: "…",
  html: renderEmail({ heading: "…", intro: "…", rows: [["Label", "Value"]], ctaLabel: "Open", ctaUrl: "https://drift.li/…" }),
  replyTo: "web@drift.li", // optional
});
```

- `sendMail` never throws — it returns `{ ok, skipped?, error? }`; use
  `void sendMail(...).catch(...)` for fire-and-forget.
- `renderEmail(...)` wraps content in the branded Drift Link shell.
- `mailConfigured()` tells you if SMTP is set up; `orgNotificationRecipients(orgId)`
  resolves a brand's admin emails.
- For follow-up sequences, send from wherever the trigger lives (e.g. a cron/queue)
  — the service is stateless and reusable.

---

## Quick checklist

- [ ] Add `SMTP_*` + `MAIL_FROM` to the VPS `backend/.env` · `pm2 restart my-backend --update-env`
- [ ] Boot log shows `[mail] SMTP ready`
- [ ] Cloudflare (drift.li): SPF, DKIM (from Private Email), DMARC TXT records
- [ ] Test send → Gmail "Show original" shows SPF/DKIM/DMARC = PASS
