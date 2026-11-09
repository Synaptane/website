/**
 * Help on the 404 pages (src/pages/404.astro, src/pages/fr/404.astro), in the browser: from the
 * address that was asked for,
 *   - a suggestion, when it looks like a page of the site: a link copied from the repository
 *     (/docs/admin/installation.md, .fr.md), a missing /docs/ (/admin/installation/), a page in
 *     another folder (/docs/installation/), a typo (/docs/admin/instalation/);
 *   - a search in the documentation (Pagefind, the index of the docs search), filled with the words
 *     of a /docs/… address and run at once.
 * The pages list the known pages (path without the /fr/ prefix, title in each language) in a
 * <script type="application/json" data-known-pages>, and hold the hidden elements filled here:
 * [data-suggest] (with an <a> inside, one per language section), [data-doc-search] (a form: input,
 * [data-status], [data-results]). Without JavaScript, the pages keep their plain links.
 */

export interface KnownPage {
  /** Path in English, e.g. /docs/admin/installation/ (the French page has the /fr/ prefix). */
  path: string;
  /** Title of the page per language. */
  title: { en: string; fr: string };
}

/** The asked address as a path of the site, without the language: /fr/docs/x.fr.md -> /docs/x/. */
export function normalize(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {}
  path = path.toLowerCase().replace(/\/{2,}/g, '/');
  path = path.replace(/^\/fr(?=\/|$)/, '');
  path = path.replace(/\/index\.(html?|md)$/, '/').replace(/(\.fr)?\.(md|html?)$/, '');
  if (!path.startsWith('/')) path = `/${path}`;
  if (!path.endsWith('/')) path += '/';
  return path;
}

/** Levenshtein distance (short strings: segments of a path). */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

const lastSegment = (path: string) => path.split('/').filter(Boolean).pop() ?? '';

/** The known page the address probably meant, if any. */
export function suggest(pathname: string, pages: KnownPage[]): KnownPage | undefined {
  const path = normalize(pathname);
  if (path === '/' || path === '/404/') return undefined;
  const exact = (p: string) => pages.find((page) => page.path === p);
  const found = exact(path) ?? (path.startsWith('/docs/') ? undefined : exact(`/docs${path}`));
  if (found) return found;
  // The same last segment elsewhere, then the closest one (one typo in five letters).
  const segment = lastSegment(path);
  if (segment.length < 3) return undefined;
  const ranked = pages
    .map((page) => ({ page, d: distance(segment, lastSegment(page.path)) }))
    .filter(({ page, d }) => page.path !== '/' && d <= Math.max(1, Math.floor(segment.length / 5)))
    .sort((a, b) => a.d - b.d);
  return ranked[0]?.page;
}

/** Words to search for: those of a /docs/… address (/docs/admin/sso-setup/ -> "sso setup"). */
export function searchWords(pathname: string): string {
  const path = normalize(pathname);
  if (!path.startsWith('/docs/')) return '';
  return path.split('/').slice(2).filter(Boolean).pop()?.split(/[-_.\s]+/).filter(Boolean).join(' ') ?? '';
}

interface PagefindResult {
  data: () => Promise<{ url: string; meta: { title?: string } }>;
}
interface Pagefind {
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
}

let pagefind: Promise<Pagefind> | undefined;
function loadPagefind(): Promise<Pagefind> {
  // The docs search index, built with the site (Starlight); the language is the page's.
  const url = '/pagefind/pagefind.js';
  pagefind ??= import(/* @vite-ignore */ url) as Promise<Pagefind>;
  return pagefind;
}

function setUpSearch(form: HTMLFormElement, initial: string) {
  const input = form.querySelector('input');
  const status = form.querySelector<HTMLElement>('[data-status]');
  const list = form.querySelector<HTMLElement>('[data-results]');
  if (!input || !status || !list) return;
  const run = async () => {
    const query = input.value.trim();
    list.replaceChildren();
    status.textContent = '';
    if (!query) return;
    try {
      const { results } = await (await loadPagefind()).search(query);
      const items = await Promise.all(results.slice(0, 5).map((r) => r.data()));
      for (const item of items) {
        const link = document.createElement('a');
        link.href = item.url;
        link.textContent = item.meta.title || item.url;
        const li = document.createElement('li');
        li.append(link);
        list.append(li);
      }
      status.textContent = items.length ? (form.dataset.found ?? '') : (form.dataset.none ?? '');
    } catch {
      status.textContent = form.dataset.error ?? '';
    }
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void run();
  });
  form.hidden = false;
  if (initial) {
    input.value = initial;
    void run();
  }
}

export function setUpNotFound() {
  const data = document.querySelector('script[data-known-pages]');
  const pages: KnownPage[] = data?.textContent ? JSON.parse(data.textContent) : [];
  const page = suggest(location.pathname, pages);
  if (page) {
    for (const p of document.querySelectorAll<HTMLElement>('[data-suggest]')) {
      const lang = p.closest<HTMLElement>('[lang]')?.lang === 'fr' ? 'fr' : 'en';
      const link = p.querySelector('a');
      if (!link) continue;
      link.href = lang === 'fr' ? `/fr${page.path}` : page.path;
      link.textContent = page.title[lang];
      p.hidden = false;
    }
  }
  const form = document.querySelector<HTMLFormElement>('[data-doc-search]');
  if (form) setUpSearch(form, searchWords(location.pathname));
}
