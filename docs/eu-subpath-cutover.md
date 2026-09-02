# EU subpath cutover

The public EU URL is `https://fruitfullseeds.com/eu/`. The EU application remains a separate Vercel project and is mounted behind the core project with external rewrites.

## Routing contract

Astro's public base path is `/eu`, but the Vercel adapter exposes the EU project's server routes and static files at the upstream project root. The core project must therefore remove the public prefix when forwarding:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/eu",
      "destination": "https://fruitfull-seeds-eu.vercel.app/"
    },
    {
      "source": "/eu/:path*",
      "destination": "https://fruitfull-seeds-eu.vercel.app/:path*"
    }
  ]
}
```

The upstream is the stable production domain shown in the EU project's Vercel settings. Do not replace it with a deployment-specific preview URL in production.

## Environment changes

- `SITE_URL=https://fruitfullseeds.com`
- Supabase redirect allow list: `https://fruitfullseeds.com/eu/auth/callback`
- Cloudflare Turnstile allowed hostname: `fruitfullseeds.com`

Keep all existing EU secrets, Supabase values, the dedicated Brevo list ID, and administrator allow-list values unchanged. Brevo is collection-only for the initial launch; no DOI or order-email template IDs are required.

## Preview validation

1. Deploy the EU branch and record its preview hostname.
2. Point a core-site preview rewrite at that preview hostname using the same prefix-removing pattern.
3. Test the site through the core preview's `/eu/` URL. The EU preview URL by itself is only an upstream and is not the public routing surface.
4. Verify navigation, static assets, Vercel image optimization, newsletter submission, reservations, Turnstile, admin authentication, canonical tags, alternate language links, and both sitemaps.

## Production order

1. Deploy the EU project and verify its stable upstream root responds.
2. Deploy the core project rewrites, EU navigation link, and root `robots.txt` update.
3. Smoke-test `https://fruitfullseeds.com/eu/` before announcing the route.
4. Configure path-preserving permanent redirects from the old EU domain after the new route is healthy.

## Rollback

Remove or revert the two core-project rewrites. This immediately isolates the EU application without changing DNS or the existing core routes.
