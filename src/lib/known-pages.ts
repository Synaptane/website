/**
 * The pages of the site, for the suggestions of the 404 pages (src/lib/not-found.ts): the site
 * pages and every page of the docs, by path (in English) with their title in each language.
 * Build time only (reads the docs collection).
 */
import { getCollection } from 'astro:content';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import type { KnownPage } from './not-found';

export async function knownPages(): Promise<KnownPage[]> {
  const pages = new Map<string, KnownPage>();
  const add = (path: string, title: { en: string; fr: string }) => pages.set(path, { path, title });
  add('/', { en: 'Synaptane', fr: 'Synaptane' });
  add('/docs/', { en: 'Documentation', fr: 'Documentation' });
  for (const key of ['demo', 'releases', 'roadmap', 'about', 'legal'] as const) {
    add(`/${key}/`, { en: en.nav[key], fr: fr.nav[key] });
  }
  for (const entry of await getCollection('docs')) {
    const lang = entry.id.startsWith('fr/') ? 'fr' : 'en';
    const path = `/${entry.id.replace(/^fr\//, '')}/`;
    if (path === '/docs/') continue;
    const page = pages.get(path) ?? { path, title: { en: '', fr: '' } };
    page.title[lang] = entry.data.title;
    pages.set(path, page);
  }
  for (const page of pages.values()) {
    page.title.en ||= page.title.fr;
    page.title.fr ||= page.title.en;
  }
  return [...pages.values()];
}

/** The list as the content of a <script type="application/json">. */
export const knownPagesJson = (pages: KnownPage[]) => JSON.stringify(pages).replace(/</g, '\\u003c');
