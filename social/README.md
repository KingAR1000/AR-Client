# AR Client social service

Cloudflare Worker + D1 for Minecraft-verified friends and chat. This is a separate deployment from the Vercel website. The launcher defaults to `https://ar-client-social.hi-helllloooo-hi123-e9f.workers.dev/`; use the build-time `AR_SOCIAL_URL` for another trusted deployment.

## Deploy as the project owner

The connected Cloudflare app currently lacks D1 write access. Reconnect with **D1 Edit** and **Workers Scripts Edit**, or use an authenticated local Wrangler installation:

```text
cd social
npm ci
npx wrangler login
npx wrangler d1 create ar-client-social --binding DB --update-config
npx wrangler d1 migrations apply ar-client-social --remote
npm run deploy
```

Creation writes the real database ID to `wrangler.jsonc`; retain it for future migrations/deployments. If the database already exists, use its existing ID instead of creating another. Select the existing account on the free plan; do not upgrade it to deploy this service. Free-plan request/storage limits still apply and may require operational limits or capacity decisions as usage grows. No paid hosting is provisioned by the application.

Check the returned URL's `/health` endpoint, then test two real Minecraft-owning accounts. Do not call public deployment verified until this succeeds. Reconnect the Cloudflare app if you want the agent to perform these steps instead. The provided configuration enables a daily data-retention cleanup; it does not enable scheduled GitHub workflows.

## Local validation

```text
npm test
npm run build
npx wrangler d1 migrations apply ar-client-social --local
npm run dev
```

Integration tests use real local workerd/D1 with seeded test sessions. There are no authentication-bypass flags in the production Worker. The live Microsoft/Minecraft session exchange still needs real-account validation.

Only session establishment accepts a Minecraft access token; it verifies the profile with Minecraft Services, discards the token and returns a random social token. D1 stores SHA-256 session hashes, at most five sessions per identity, expiring after 24 hours. Native clients hold social tokens only in RAM. No Microsoft client secrets or refresh tokens are sent to this service.

Friends must accept before messages are permitted. Both sides' blocks are enforced, including an atomic check during message insertion. Friend requests resolve usernames through Mojang to avoid directing requests to reassigned, stale usernames. Conversations are bounded and paginated, messages expire after 30 days, and deleting a profile cascades through its relationships/messages/sessions. The API limits message sizes, friendships and request rates. Chat is not end-to-end encrypted. No application logs contain message bodies or tokens; invocation logs and traces are disabled in the Worker configuration.

All application/database source is GPL-3.0-only under the repository LICENSE.
