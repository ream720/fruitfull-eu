# Fruitfull Seeds EU

Independent European deployment of the Fruitfull Seeds Astro site, published through the main domain at `https://fruitfullseeds.com/eu/`.

## Local development

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Fill in the required values in `.env` before testing reservations or admin authentication. The local `.env` file is ignored by Git. Node.js includes npm, so a separate npm installation is not required when a current Node.js installation is already present.

## EU-specific configuration

- Production URL: `https://fruitfullseeds.com/eu/`
- Document language: `en-GB`
- Original US site: linked through `hreflang="en-US"`

Set `SITE_URL=https://fruitfullseeds.com` in Vercel. Do not edit generated files in `dist/`.

## Deploy behind the `/eu` route

1. Push this directory to its own Git repository.
2. Import that repository as a new Vercel project named `fruitfull-seeds-eu`.
3. Add all variables from `.env.example` under Project Settings > Environment Variables for Production and Preview as appropriate.
4. Keep this as a separate Vercel project and use its stable `fruitfull-seeds-eu.vercel.app` production alias as the upstream for the core site's `/eu` rewrites. The core rewrite removes `/eu` before forwarding; Astro's `base` setting adds it to every public URL returned to the browser.
5. Deploy, then verify `/eu/robots.txt`, `/eu/sitemap-index.xml`, and canonical tags through `https://fruitfullseeds.com/eu/`.

The EU seed library contains only genetics confirmed for European release. Rainbow Juice and Berry Mist are the first listed seeds.

## Drops and order administration

The public Drops page is `/drops`. It remains in its empty state until an active catalog is synchronized. In local development, `/drops?preview=1` displays the inactive Rainbow Juice + Berry Mist draft for layout testing; the preview form cannot submit.

Launch checkout is EUR-only with a server-enforced flat `€10.00` shipping charge per reservation. PayPal is the accepted payment method, and customers must provide the exact PayPal email or username where the team should send the manual payment request.

Catalog definitions live in `src/content/drops`. Add real inventory only after the artist, EUR amount, stock, PayPal instructions, and schedule are confirmed. Every definition must use `"currency": "EUR"`, `"shippingAmountMinor": 1000`, and `"paymentMethods": ["PayPal"]`. Then run the explicit synchronization command:

```powershell
npm run drops:sync
```

Synchronization never runs during a build, never deletes historical items, and refuses a total-stock reduction below already reserved or committed quantities. Set `active: false` to archive a drop or item.

The admin routes are `/admin/login` and `/admin/orders`. Administrators must first be invited under Supabase Authentication > Users and their normalized email addresses must also appear in the server-only, comma-separated `ADMIN_EMAILS` variable. Magic-link account creation is disabled. Add these redirect URLs under Supabase Authentication > URL Configuration:

- `http://localhost:4321/auth/callback`
- the Vercel preview callback URL(s)
- `https://fruitfullseeds.com/eu/auth/callback`

## Supabase deployment

1. Create or connect a Supabase project through the Vercel Marketplace and choose Frankfurt (`eu-central-1`). Keep Vercel Functions in Frankfurt via `vercel.json`.
2. Add all Supabase values from `.env.example` to Local, Preview, and Production as appropriate. Secret keys and `ADMIN_EMAILS` must never use a `PUBLIC_` prefix.
   The Vercel Marketplace may namespace synchronized variables with the resource prefix (for example `SUPABASE_SUPABASE_URL`); the application accepts both the standard names and these Vercel-prefixed forms.
3. Apply the order schema and expiry migrations. Do not deploy `supabase/functions/send-order-emails` or apply the notification-cron migration while automated email is disabled.
4. Reservations show their reference, total, deadline, and payment instructions in the browser, with an explicit reminder to keep a screenshot because no confirmation email is sent. Handle PayPal requests and order communication manually during the initial launch.

The schema enables RLS and removes browser-role access to orders, items, events, and notifications. Customer and admin mutations pass only through server routes. Do not log full API bodies or customer fields.

## Cloudflare Turnstile and transactional email

Create a Turnstile widget for localhost, preview domains, and production, then configure `PUBLIC_TURNSTILE_SITE_KEY` and server-only `TURNSTILE_SECRET_KEY`. Reservation tokens are verified with Cloudflare before the transactional reservation function runs. Use Cloudflare's official test keys in automated tests.

The Brevo-based transactional email function and deferred cron definition in `supabase/deferred-migrations/notification_cron.sql` remain available for a later phase, but should not be deployed until the order templates and operational workflow are ready. When that phase begins, create a newly timestamped migration from the deferred SQL rather than moving it directly into the active migration history.

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
