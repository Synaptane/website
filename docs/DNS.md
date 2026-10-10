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
