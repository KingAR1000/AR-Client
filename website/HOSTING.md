# AR Client website hosting

Published public preview: https://ar-client-kingar1000.kingar-1000.chatgpt.site
Intended custom domain: client.kingar1000.xyz (DNS validation pending).
Public contact: hello@kingar1000.xyz.

This is an existing Sites project. Reuse project ID `appgprj_6ae299e130d8819195c255e0a348c2dc`; do not create another site. The identity is also recorded in `.openai/hosting.json` here. The configured deployment source is the Sites source repository; GitHub's `website/*.html` files are the source mirror. Prepare `dist/` by copying those HTML files into it, then synchronize/push the exact source to the existing Sites repository and save/deploy that version. Keep repository credentials in memory/stdin, never in this folder.

Verified deployed source commit: `c9702349fc6c592d290c55fe2057d5c6cfb406ff` in the Sites repository.
Deployment: `appgdep_6ae29a9cee3c819194de5011b0ce8685` (succeeded).
Custom domain ID: `appgdom_6ae29ab27eb48191a48ee37bb9a0484f` (pending).

## Cloudflare DNS records

In the kingar1000.xyz zone, add these records (TTL Auto). Keep the CNAME DNS only while validation and certificate provisioning complete. These are public DNS verification values, not credentials.

| Type | Name | Content |
| --- | --- | --- |
| CNAME | client | custom-domains.chatgpt.site |
| TXT | _openai-site-verification.client | openai-site-verification=_I75j-OrX2QVI-K4uwe6g-NUlzkVgtuqSZnW8BCN2Xg |
| TXT | _cf-custom-hostname.client | 48144107-c359-45ef-a7e5-51cd96c6ce58 |

Once the owner confirms the records, use Sites custom-domain refresh and inspect its returned DNS and SSL status. Pending domain registration does not mean the custom URL is active. Do not replace these records with invented values or recreate the project.
