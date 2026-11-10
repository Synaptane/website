// Security policy of the pages, as <meta> tags: GitHub Pages sends no custom HTTP header, so a
// Content-Security-Policy and a referrer policy can only be set in the HTML (see docs/DNS.md for
// what this cannot cover: HSTS, X-Content-Type-Options, frame-ancestors).
//
// An Astro integration: after the build, every page of dist/ (site pages, docs, 404) gets, right
// after <meta charset>, a CSP that allows the site's own files and, for scripts, only those files
// plus the inline scripts of that very page, by their SHA-256 hash (computed here, so a changed
// script never needs a hand-edited list). Styles keep 'unsafe-inline': Astro, Starlight and
// Expressive Code write style attributes, and a style cannot run code. 'wasm-unsafe-eval' is
// for Pagefind (the docs search, and the 404 page), which runs WebAssembly.
// The static demo (demo/app/, fr/demo/app/) is skipped: its pages have their own, stricter CSP
// (scripts/build-demo/).

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = [/^demo\/app\//, /^fr\/demo\/app\//];

/** The policy of a page whose inline scripts have these hashes. */
export function policy(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval'${hashes.map((h) => ` '${h}'`).join('')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Hashes of the inline scripts the browser runs (not JSON-LD or other data blocks). */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    hashes.add(`sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}`);
  }
  return [...hashes].sort();
}

/** The page with its policy tags, right after <meta charset> (before any script). */
export function addPolicy(html) {
  if (/http-equiv=["']?content-security-policy/i.test(html)) return html;
  const tags =
    `<meta http-equiv="Content-Security-Policy" content="${policy(inlineScriptHashes(html))}">` +
    '<meta name="referrer" content="strict-origin-when-cross-origin">';
  const charset = /<meta\s+charset=["']?[\w-]+["']?\s*\/?>/i.exec(html);
  if (charset) return html.slice(0, charset.index + charset[0].length) + tags + html.slice(charset.index + charset[0].length);
  return html.replace(/<head(\s[^>]*)?>/i, (head) => head + tags);
}

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

export default function csp() {
  return {
    name: 'synaptane-csp',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        let count = 0;
        for await (const file of htmlFiles(root)) {
          const rel = relative(root, file).split(sep).join('/');
          if (SKIP.some((re) => re.test(rel))) continue;
          const html = await readFile(file, 'utf8');
          const out = addPolicy(html);
          if (out !== html) {
            await writeFile(file, out);
            count++;
          }
        }
        logger.info(`Content-Security-Policy and referrer policy added to ${count} pages.`);
      },
    },
  };
}
