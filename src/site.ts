/** Facts used across the site. Change them here, not in the pages. */
export const SITE = {
  url: 'https://synaptane.com',
  github: 'https://github.com/synaptane/synaptane',
  discussions: 'https://github.com/synaptane/synaptane/discussions',
  releases: 'https://github.com/synaptane/synaptane/releases',
  image: 'ghcr.io/synaptane/synaptane',
  /** Latest published version of Synaptane. */
  version: 'v1.0.0-rc.1',
  author: 'René Cotton',
} as const;

/** Main navigation of the site pages (paths in English; the French ones get the /fr/ prefix). */
export const mainNav = [
  { key: 'docs', path: '/docs/' },
  { key: 'demo', path: '/demo/' },
  { key: 'roadmap', path: '/roadmap/' },
  { key: 'about', path: '/about/' },
] as const;
