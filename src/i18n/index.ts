/**
 * Languages of the site pages.
 *
 * The languages themselves are declared once, in the Starlight `locales` of astro.config.mjs;
 * Starlight turns them into Astro's `i18n` configuration (English at the root, French under
 * /fr/). This module reads the current language with `Astro.currentLocale` and builds the URLs
 * with `astro:i18n`, so the site pages and the docs follow the same rules.
 *
 * Convention: every page exists in both languages at the same path, the French one prefixed
 * with /fr/ (src/pages/about.astro <-> src/pages/fr/about.astro). The language switcher and the
 * hreflang links rely on it; a page without a translation passes `alternate` to Base.astro.
 */
import { getRelativeLocaleUrl } from 'astro:i18n';
import { en, type Dictionary } from './en';
import { fr } from './fr';

export const languages = { en: 'English', fr: 'Français' } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';
export const langs = Object.keys(languages) as Lang[];

const dictionaries: Record<Lang, Dictionary> = { en, fr };

/** The language of a page, from `Astro.currentLocale` (undefined or unknown -> English). */
export function getLang(locale: string | undefined): Lang {
  return locale === 'fr' ? 'fr' : 'en';
}

/** The interface strings of a language: `const t = useTranslations(lang); t.nav.docs`. */
export function useTranslations(lang: Lang): Dictionary {
  return dictionaries[lang];
}

/** The other language (two languages: the switcher toggles between them). */
export function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'fr' : 'en';
}

/**
 * The URL of a site path in a language: localizePath('/about/', 'fr') -> '/fr/about/'.
 * `path` is the English path (no language prefix); a hash or a query is kept.
 */
export function localizePath(path: string, lang: Lang): string {
  const match = /^([^?#]*)(.*)$/.exec(path);
  const pathname = (match?.[1] ?? path).replace(/^\/+|\/+$/g, '');
  const suffix = match?.[2] ?? '';
  return getRelativeLocaleUrl(lang, pathname) + suffix;
}

/** Removes the language prefix: '/fr/about/' -> '/about/'. */
export function stripLangPrefix(pathname: string): string {
  return pathname.replace(/^\/fr(?=\/|$)/, '') || '/';
}

/** The same page in another language: '/about/' + 'fr' -> '/fr/about/'. */
export function translatePath(pathname: string, lang: Lang): string {
  return localizePath(stripLangPrefix(pathname), lang);
}

/** Dates in the reader's language ("October 10, 2026" / "10 octobre 2026"). */
export function formatDate(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
