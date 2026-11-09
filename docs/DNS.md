# DNS for synaptane.com (GitHub Pages)

The site is served by GitHub Pages from the `synaptane/website` repository, on the apex domain
`synaptane.com` (`public/CNAME`). `www.synaptane.com` redirects to it.

IP addresses checked on 2026-10-10 in GitHub's documentation,
[Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
Check them again there before changing the zone.

## 1. Verify the domain for the organization (first)

Verifying prevents anyone else from publishing a GitHub Pages site on the domain.

1. GitHub → **Synaptane organization → Settings → Pages → Add a domain** → `synaptane.com`.
2. Create the TXT record GitHub shows, then click **Verify**. Keep the record afterwards.

| Name                                             | Type | Value                     |
| ------------------------------------------------ | ---- | ------------------------- |
| `_github-pages-challenge-synaptane.synaptane.com` | TXT  | *(code given by GitHub)*  |

## 2. Records at the registrar

Remove any other `A`, `AAAA` or `CNAME` record on `@` and `www` (parking pages, forwarding).
Do not use a wildcard (`*.synaptane.com`).

| Name  | Type  | Value                   |
| ----- | ----- | ----------------------- |
| `@`   | A     | `185.199.108.153`       |
| `@`   | A     | `185.199.109.153`       |
| `@`   | A     | `185.199.110.153`       |
| `@`   | A     | `185.199.111.153`       |
| `@`   | AAAA  | `2606:50c0:8000::153`   |
| `@`   | AAAA  | `2606:50c0:8001::153`   |
| `@`   | AAAA  | `2606:50c0:8002::153`   |
| `@`   | AAAA  | `2606:50c0:8003::153`   |
| `www` | CNAME | `synaptane.github.io.`  |

Optional: a `CAA` record allowing Let's Encrypt (`0 issue "letsencrypt.org"`), which GitHub uses
for the certificate, if the zone has CAA records at all.

## 3. Repository settings

1. **synaptane/website → Settings → Pages → Source: GitHub Actions** (the `deploy.yml` workflow
   publishes the site).
2. **Custom domain**: `synaptane.com` → Save. GitHub runs a DNS check.
3. Once the certificate is issued (minutes to an hour), tick **Enforce HTTPS**.

## Check

```sh
dig synaptane.com +noall +answer A
dig synaptane.com +noall +answer AAAA
dig www.synaptane.com +noall +answer CNAME
dig _github-pages-challenge-synaptane.synaptane.com +noall +answer TXT
curl -sI https://www.synaptane.com | grep -i location   # -> https://synaptane.com/
```

## HTTP headers and cache: the limits of GitHub Pages

GitHub Pages sets the HTTP headers itself and lets no one add or change them (checked on
2026-11-09 with `curl -sI https://synaptane.com/`):

- **Cache: 10 minutes for everything.** Every file is served with `Cache-Control: max-age=600`
  and an ETag, including those whose name holds a hash (`/_astro/*`, which never change under the
  same name) and the fonts (`/fonts/*`). After 10 minutes, a returning visitor's browser asks
  again for each of them and gets a `304 Not Modified` (a round trip, no download). A year
  (`Cache-Control: public, max-age=31536000, immutable` on `/_astro/*` and `/fonts/*`) would take
  another host, or a proxy in front of GitHub Pages that can set headers. Nothing to do in the code.
- **Security headers: none.** No `Strict-Transport-Security`, `Content-Security-Policy`,
  `X-Content-Type-Options` or `Referrer-Policy`. What HTML can carry is set at build time by
  `scripts/csp.mjs`, in a `<meta>` of every page: a Content-Security-Policy (the site's own files
  only; inline scripts allowed by their hash; styles with `'unsafe-inline'`) and
  `referrer: strict-origin-when-cross-origin`. A `<meta>` cannot carry the rest:
  - **HSTS**: `http://` is redirected to `https://` (301, *Enforce HTTPS*), but a first visit in
    `http://` is not protected before that redirect, and the domain cannot join the browsers'
    HSTS preload list without the header;
  - `X-Content-Type-Options: nosniff`;
  - `frame-ancestors` (no framing by other sites; the site has no account and no form, so the
    risk is low) and CSP violation reports.

  These would need a proxy in front of GitHub Pages (Cloudflare, for instance): a hosting
  decision, not a change in this repository.
