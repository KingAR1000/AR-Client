# AR Client social service

Cloudflare Worker + D1 for Minecraft-verified friends and chat. This is a separate deployment from the Cloudflare Static Assets website. The launcher defaults to `https://social.client.kingar1000.xyz/`; use the build-time `AR_SOCIAL_URL` for another trusted deployment.

## Deploy as the project owner

Deployed on Workers/D1 Free on 2 November 2026. Database `771aff69-4495-4998-b489-7ee9fc59781f` has the initial schema applied and recorded in `d1_migrations`. The `/health` endpoint returns 200; unauthenticated social calls return 401. Daily retention cleanup is scheduled at 01:00 UTC. Full Minecraft-verified session and two-player chat remain unverified until real-account login succeeds.

For subsequent deployment, use the existing database ID in the checked-in configuration. A fresh fork can create its own database after verifying Workers Free:

```text
cd social
npm ci
npx wrangler login
npx wrangler d1 create ar-client-social --binding DB --update-config
npx wrangler d1 migrations apply ar-client-social --remote
npm run deploy
```

Creation writes the real database ID to `wrangler.jsonc`; retain it for future migrations/deployments. If the database already exists, use its existing ID instead of creating another. Verify that the account is on **Workers Free**, then select that account; do not upgrade it to deploy this service. Free-plan request/storage limits still apply and may require operational limits or capacity decisions as usage grows. No paid hosting is provisioned by the application. Never enable paid overages or upgrade automatically: free-quota exhaustion must stop or throttle requests. Workers Free enforces its built-in CPU limit; do not configure custom CPU limits, which require Paid.

Check the returned URL's `/health` endpoint, then test two real Minecraft-owning accounts. Do not call public deployment verified until this succeeds. The provided configuration enables a daily data-retention cleanup; it does not enable scheduled GitHub workflows.

## Local validation

```text
npm test
npm run build
npx wrangler d1 migrations apply ar-client-social --local
npm run dev
```

Integration tests use real local workerd/D1 with seeded test sessions and generated stand-in Mojang keys passed through the test-only `MOJANG_KEYS` binding (never set it in production; it replaces the pinned keys). There are no authentication-bypass flags in the production Worker. The live Microsoft/Minecraft session exchange still needs real-account validation.

Mojang answers 403 to requests from Cloudflare Workers, so the Worker never contacts Mojang. Session establishment accepts three things from the launcher: the Mojang-signed `textures` profile property from sessionserver (binds the profile ID to its current username, timestamp checked within 15 minutes), the Mojang-signed profile certificate from `/player/certificates` (binds the profile ID to an RSA public key), and a single-use proof over `AR Client social session v2\n<host>\n<profile id>\n<timestamp>\n<nonce>` signed with that certificate's private key (timestamp within 5 minutes; nonces are stored until expiry). Signatures are checked against the Mojang public keys pinned in `src/mojang-keys.js` (from `https://api.minecraftservices.com/publickeys`); refresh that file if Mojang rotates keys. No Minecraft access token is sent to the service. Usernames are resolved to UUIDs by the launcher; name-based lookups fall back to the most recently verified holder of a name. D1 stores SHA-256 session hashes, at most five sessions per identity, expiring after 24 hours. Native clients hold social tokens only in RAM. No Microsoft client secrets or refresh tokens are sent to this service.

Migration `0002_social_v2.sql` adds presence/activity, skin addresses, read positions (unread counts and read receipts) and the proof-replay table; the Workers Builds deploy command applies it before publishing. Friends must accept before messages are permitted. Both sides' blocks are enforced, including an atomic check during message insertion. Friend requests resolve usernames through Mojang to avoid directing requests to reassigned, stale usernames. Conversations are bounded and paginated, messages expire after 30 days, and deleting a profile cascades through its relationships/messages/sessions. The API limits message sizes, friendships and request rates. Chat is not end-to-end encrypted. No application logs contain message bodies or tokens; invocation logs and traces are disabled in the Worker configuration.

All application/database source is GPL-3.0-only under the repository LICENSE.

Production Worker: `ar-client`. Its D1 database remains `ar-client-social`; renaming a Worker does not require renaming or replacing its database. The stable custom domain keeps launcher configuration independent of the Worker name.
