# Incident: Railway environment variables disclosure (21 October 2026)

Status: **open — containment in progress**
Owner: _[name]_
Opened: 2026-10-23
Last updated: 2026-10-23

## What happened

On 21 October 2026 Railway disclosed "anomalous activity involving systems that
store customer environment variables". An unauthorised third party may have
accessed encrypted variables and, for some customers, obtained their decrypted
values. Railway invalidated API tokens and revoked some GitHub credentials. It
has not said publicly which projects were affected, when access began, or how
many customers were involved.

We therefore treat **every variable stored on the `kinga` Railway project as
read by an attacker**, including the production database password.

## What is exposed

| Secret | Consequence |
| --- | --- |
| `DATABASE_URL` | Read/write access to production Postgres. Includes user names and emails, scrypt password hashes, organisation and ROPA/DPIA/breach/complaint content, `payments`, and `saved_cards.authorization_code` — reusable Paystack charge tokens. |
| `PAYSTACK_SECRET_KEY` | Charge saved cards, read customers and transactions, issue refunds or transfers on the integration. |
| `CRON_SECRET` | Call `/api/cron/reminders`, which runs automatic renewals (real charges) and sends mail. |
| `SMTP_URL` | Send email as the business (phishing), if configured. |
| `APP_URL`, `SELLER_*` | Not secret; no action. |

Not exposed: source code, repository credentials (no secrets are committed and
`.env` is ignored), and Railway API tokens beyond the already-invalidated set.

Personal data categories: account names and emails, organisation details,
compliance records (which may themselves describe data subjects and special
category data), billing records, and stored card authorisations.

## Containment checklist

Preserve evidence before destroying anything.

- [ ] Export Railway deploy and runtime logs for the project, 2026-10-14 onward.
- [ ] Export Postgres logs and connection history for the same period.
- [ ] Export Paystack API, transaction, refund and transfer logs.
- [ ] Roll `PAYSTACK_SECRET_KEY`; confirm webhook and callback URLs are unchanged.
- [ ] Deactivate every stored card authorisation (`POST /customer/deauthorize`, or ask Paystack support to bulk-revoke). Rotating the key does **not** invalidate them.
- [ ] Rotate SMTP credentials; review the provider's sent-mail log.
- [ ] Generate a new `CRON_SECRET`; set it in Railway and in GitHub → Settings → Secrets → `CRON_SECRET`.
- [ ] `ALTER ROLE <app_user> WITH PASSWORD '<new>'`; update the password variable on the Postgres service so `db.env.DATABASE_URL` re-renders; `railway config apply` if needed.
- [ ] Terminate existing DB connections: `select pg_terminate_backend(pid) from pg_stat_activity where usename = '<app_user>' and pid <> pg_backend_pid();`
- [ ] Redeploy and confirm `GET /api/health` returns `{"ok":true}`.
- [ ] `railway login` again (old tokens were invalidated); review members, tokens, domains, services and deploy history.
- [ ] Review GitHub deploy keys, Actions secrets, and commits/PRs since 2026-10-20. Reconnect the Railway GitHub integration if needed.
- [ ] Sign everyone out: `npm run sessions:revoke -- --all --yes`.
- [ ] Decide on forced password resets: `npm run sessions:revoke -- --all --force-password-reset --yes` (check SMTP first).
- [ ] Update the local `.env` to the new secrets; never commit it.

## Investigation queries

```sql
select id, email, name, created_at from users order by created_at desc limit 50;
select * from sessions order by created_at desc limit 50;
select * from activity_log where created_at >= '2026-10-20' order by created_at desc;
select * from payments  where created_at >= '2026-10-20' order by created_at desc;
select * from refunds   order by created_at desc limit 50;
select * from saved_cards;
select rolname from pg_roles;                 -- unexpected database users
select * from pg_stat_activity;               -- unexpected live connections
```

Look for: new or elevated users, activity by accounts that should not have it,
charges or refunds we did not initiate, changed webhook URLs, and bulk reads or
deletions.

## Notification

As a **processor**, tell each customer organisation without undue delay, per the
DPA and our contracts. As a **controller** for our own account data, section 43
of the Kenya Data Protection Act 2019 requires notifying the ODPC within 72
hours of becoming aware where the breach is likely to result in risk, and the
affected data subjects where the risk is high.

Record the incident in our own breach register once the facts are settled.

### Draft: ODPC notification

> **Data protection breach notification — [organisation legal name], [KRA PIN]**
>
> **Date and time of breach:** 2026-10-21, time unknown (disclosed by Railway on 2026-10-21; discovered by us on 2026-10-23).
>
> **Nature of the breach:** Our hosting provider, Railway, suffered unauthorised access to the systems storing customer environment variables. Our production database credential, payment gateway secret key, scheduled-job secret, and mail relay credential may have been read and decrypted by an unauthorised third party. We have no evidence yet that they were used against us.
>
> **Categories and approximate volume of data:** [N] account holders (name, email address, scrypt password hash); [N] organisations (name, sector, size, KRA PIN, billing contact); compliance records containing descriptions of processing activities, which may reference data subjects and special category data; [N] payment records and [N] stored card authorisations. Approximate total: [N] data subjects, [N] records.
>
> **Likely consequences:** Unauthorised access to, or alteration of, compliance records; account takeover if a password is cracked or reused; unauthorised card charges using stored authorisations; phishing email sent from our domain.
>
> **Measures taken:** Payment gateway key rolled and stored card authorisations deactivated; database password rotated and live connections terminated; scheduled-job and mail relay credentials rotated; all user sessions revoked; [password resets forced / not forced]; hosting account reviewed and redeployed; logs preserved for investigation.
>
> **Contact:** [name], [role], [email], [phone].

### Draft: customer (controller) notice

> **Subject: Security incident affecting [product] — action required**
>
> Dear [name],
>
> Our hosting provider Railway disclosed on 21 October 2026 that an unauthorised third party may have accessed customer environment variables, including decrypted secrets. Our production database credential and payment and email credentials were stored there, so we are treating them as compromised.
>
> The data at risk is the information in your [product] account: user names and email addresses, organisation details, and the compliance records you have entered, which may describe personal data you process. We have rotated our database, payment gateway, scheduled-job and mail credentials, revoked all user sessions and [forced password resets / asked users to reset their passwords]. [Add whether you have any evidence of access to their records.]
>
> As our customer and the controller of that data, you may need to assess and, where required, notify the ODPC and affected data subjects under section 43 of the Data Protection Act 2019. We will support your assessment and provide any logs or information you need.
>
> We are sorry for the concern this causes. [Name] is available at [email] / [phone].
>
> [Organisation]

### Draft: data subject notice

> **Subject: Important security notice about your [product] account**
>
> On 21 October 2026 our hosting provider suffered a security incident that may have exposed the credentials used by our systems. Your name and email address, and the compliance records held in your organisation's account, may have been affected. We have rotated all affected credentials, signed every user out and [forced a password reset / recommend you change your password]. If you reused this password anywhere else, change it there too.
>
> We have reported the incident to the Office of the Data Protection Commissioner. For questions, contact [name] at [email].
>
> [Organisation]

## Related hardening (done in this repository)

- Next.js upgraded `16.4.0` → `16.4.2`, closing two critical unauthenticated RCE
  advisories (SVG image optimisation and `use cache` typed arrays) plus a Server
  Actions denial-of-service.
- `npm run sessions:revoke` added to sign users out and optionally force a
  password reset after a credential leak.
