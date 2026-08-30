# Fruitfull Seeds EU

Independent European deployment of the Fruitfull Seeds Astro site.

## Local development

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Fill in the required values in `.env` before testing newsletter signup, reservations, or admin authentication. The local `.env` file is ignored by Git. Node.js includes npm, so a separate npm installation is not required when a current Node.js installation is already present.

## EU-specific configuration

- Default production URL: `https://fruitfullseeds.eu.com`
- Document language: `en-GB`
- Newsletter: explicit consent plus Brevo double opt-in
- Newsletter contacts: dedicated list selected by `BREVO_LIST_ID`
- Original US site: linked through `hreflang="en-US"`

If the final domain differs, set `SITE_URL` and `BREVO_DOI_REDIRECT_URL` in Vercel. Do not edit generated files in `dist/`.

## Deploy as a separate Vercel project

1. Push this directory to its own Git repository.
2. Import that repository as a new Vercel project named `fruitfull-seeds-eu`.
3. Add all variables from `.env.example` under Project Settings > Environment Variables for Production and Preview as appropriate.
4. In Brevo, create a dedicated EU contact list and a double-opt-in transactional template. Put their numeric IDs in Vercel.
5. Add the final custom domain under Project Settings > Domains and follow the DNS records Vercel displays.
6. Deploy, then verify `/robots.txt`, `/sitemap-index.xml`, canonical tags, and newsletter confirmation.

Four breeder-cut entries still point to the original Rocky Mountain High vendor. Replace those links with an EU distributor before launch if availability differs.

## Drops and order administration

The public Drops page is `/drops`. It remains in its newsletter empty state until an active catalog is synchronized. In local development, `/drops?preview=1` displays the inactive placeholder definition for layout testing; the preview form cannot submit.

Launch checkout is USD-only with a server-enforced flat `$10.00` shipping charge per reservation. PayPal is the accepted payment method, and customers must provide the exact PayPal email or username where the team should send the manual payment request.

Catalog definitions live in `src/content/drops`. Add real inventory only after the artist, USD amount, stock, PayPal instructions, and schedule are confirmed. Every definition must use `"currency": "USD"`, `"shippingAmountMinor": 1000`, and `"paymentMethods": ["PayPal"]`. Then run the explicit synchronization command:

```powershell
npm run drops:sync
```

Synchronization never runs during a build, never deletes historical items, and refuses a total-stock reduction below already reserved or committed quantities. Set `active: false` to archive a drop or item.

The admin routes are `/admin/login` and `/admin/orders`. Administrators must first be invited under Supabase Authentication > Users and their normalized email addresses must also appear in the server-only, comma-separated `ADMIN_EMAILS` variable. Magic-link account creation is disabled. Add these redirect URLs under Supabase Authentication > URL Configuration:

- `http://localhost:4321/auth/callback`
- the Vercel preview callback URL(s)
- `https://fruitfullseeds.eu.com/auth/callback`

## Supabase deployment

1. Create or connect a Supabase project through the Vercel Marketplace and choose Frankfurt (`eu-central-1`). Keep Vercel Functions in Frankfurt via `vercel.json`.
2. Add all Supabase values from `.env.example` to Local, Preview, and Production as appropriate. Secret keys and `ADMIN_EMAILS` must never use a `PUBLIC_` prefix.
   The Vercel Marketplace may namespace synchronized variables with the resource prefix (for example `SUPABASE_SUPABASE_URL`); the application accepts both the standard names and these Vercel-prefixed forms.
3. Generate a strong `DISPATCH_SECRET`. Add it to Edge Function secrets together with `BREVO_API_KEY` and every `BREVO_ORDER_*_TEMPLATE_ID`; Supabase provides its URL and named API keys to hosted functions automatically.
4. Deploy `supabase/functions/send-order-emails`.
5. In Supabase Vault create `fruitfull_project_url` with the project URL and `fruitfull_dispatch_secret` with the same `DISPATCH_SECRET`.
6. Apply `supabase/migrations` in filename order with the Supabase CLI or SQL migration workflow. The migrations schedule the protected email function every minute and the database expiry job every five minutes. The function sends queued reservation, paid, awaiting-shipment, shipped, cancelled, and expired messages through Brevo, and retries failures up to eight attempts.

The schema enables RLS and removes browser-role access to orders, items, events, and notifications. Customer and admin mutations pass only through server routes. Do not log full API bodies or customer fields.

## Cloudflare Turnstile and Brevo

Create a Turnstile widget for localhost, preview domains, and production, then configure `PUBLIC_TURNSTILE_SITE_KEY` and server-only `TURNSTILE_SECRET_KEY`. Reservation tokens are verified with Cloudflare before the transactional reservation function runs. Use Cloudflare's official test keys in automated tests.

Create separate Brevo transactional templates for each order lifecycle message. Template parameters include `reference`, `status`, `expiresAt`, `currency`, minor-unit totals, payment method, optional tracking fields, and item snapshots. These transactional messages do not subscribe the customer to the newsletter.

## Privacy operations

Admins can anonymize shipped, cancelled, or expired orders after an explicit confirmation. This removes contact, address, payment-matching, and customer-note fields while preserving non-identifying totals, item snapshots, and audit history. No automatic retention deletion is configured; establish a documented retention policy before adding one.

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Start the Astro development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run core drop and reservation tests |
| `npm run check` | Type-check Astro and TypeScript source |
| `npm run drops:check` | Validate drop definitions without connecting to Supabase |
| `npm run drops:sync` | Validate and explicitly synchronize drop inventory |
