/**
 * Structured data (schema.org, JSON-LD) of the site, from the facts of src/site.ts and the
 * interface strings: nothing here that the pages do not say (no rating, no review, no date).
 *
 * - home pages (/, /fr/): the web site, its author, the application and its source code
 *   (src/layouts/Base.astro);
 * - docs pages: the article and its breadcrumb (src/components/starlight/Head.astro).
 *
 * The nodes refer to each other by `@id` (absolute URLs with a fragment), also across pages.
 */
import { localizePath, useTranslations, type Lang } from '../i18n';
import { SITE } from '../site';

const abs = (path: string) => new URL(path, SITE.url).href;
const LICENSE = 'https://www.apache.org/licenses/LICENSE-2.0';
export const ids = {
  website: abs('/#website'),
  author: abs('/about/#author'),
  software: abs('/#software'),
  source: abs('/#source'),
};
const inLanguage = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-US');

/** Web site, author, application and source code: for the home page of each language. */
export function homeGraph(lang: Lang) {
  const t = useTranslations(lang);
  const version = SITE.version.replace(/^v/, '');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': ids.website,
        url: abs('/'),
        name: 'Synaptane',
        inLanguage: ['en-US', 'fr-FR'],
        publisher: { '@id': ids.author },
      },
      {
        '@type': 'Person',
        '@id': ids.author,
        name: SITE.author,
        url: abs(localizePath('/about/', lang)),
        sameAs: ['https://www.rene-cotton.fr/', 'https://www.linkedin.com/in/cottonrene', 'https://github.com/EtreRe'],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': ids.software,
        name: 'Synaptane',
        description: t.meta.defaultDescription,
        url: abs(localizePath('/', lang)),
        sameAs: SITE.github,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Linux',
        softwareVersion: version,
        softwareHelp: abs(localizePath('/docs/', lang)),
        releaseNotes: abs(localizePath('/releases/', lang)),
        downloadUrl: SITE.releases,
        license: LICENSE,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        author: { '@id': ids.author },
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': ids.source,
        name: 'synaptane/synaptane',
        codeRepository: SITE.github,
        programmingLanguage: 'Python',
        license: LICENSE,
        version,
        author: { '@id': ids.author },
        targetProduct: { '@id': ids.software },
      },
    ],
  };
}

/** A docs page: the article (technical documentation) and its breadcrumb. */
export function docsGraph(opts: { lang: Lang; url: string; title: string; description?: string }) {
  const { lang, url, title, description } = opts;
  const t = useTranslations(lang);
  const docsHome = abs(localizePath('/docs/', lang));
  const crumbs = [
    { name: 'Synaptane', item: abs(localizePath('/', lang)) },
    { name: t.nav.docs, item: docsHome },
    ...(url === docsHome ? [] : [{ name: title, item: url }]),
  ];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: title,
        ...(description ? { description } : {}),
        url,
        mainEntityOfPage: url,
        inLanguage: inLanguage(lang),
        isPartOf: { '@id': ids.website },
        about: { '@id': ids.software },
        publisher: { '@id': ids.author },
        license: LICENSE,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
      },
    ],
  };
}

/** The JSON for a <script type="application/ld+json">, safe inside HTML. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
