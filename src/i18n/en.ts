/**
 * Interface strings of the site pages (header, footer, shared components), in English.
 * src/i18n/fr.ts must have the same keys: TypeScript checks it (`npm run check`).
 * Page copy lives in the pages themselves (src/pages/… and src/pages/fr/…), not here.
 */
export const en = {
  meta: {
    siteName: 'Synaptane',
    defaultDescription:
      'Synaptane is a self-hosted team second brain stored in Git: Markdown first, and all your files (PDF, scans, Office, images), full-text and semantic search, an MCP server for your AI assistants, and a nightly tidy-up by an AI agent.',
    ogImageAlt: 'Synaptane, the team second brain stored in Git',
    ogLocale: 'en_US',
  },
  a11y: {
    skipToContent: 'Skip to content',
    mainNav: 'Main',
    footerNav: 'Footer',
    home: 'Synaptane home',
    menu: 'Menu',
    externalLink: '(opens GitHub)',
  },
  nav: {
    docs: 'Docs',
    demo: 'Demo',
    blog: 'Blog',
    roadmap: 'Roadmap',
    about: 'About',
    releases: 'Releases',
    github: 'GitHub',
    discussions: 'Discussions',
    legal: 'Legal notice',
  },
  language: {
    label: 'Language',
    switchTo: 'Lire en français',
  },
  lightbox: {
    label: 'Screenshots',
    open: '(opens a larger view)',
    close: 'Close',
    previous: 'Previous screenshot',
    next: 'Next screenshot',
    zoomIn: 'Show at actual size',
    zoomOut: 'Fit to the screen',
    thumbnails: 'All screenshots',
    counter: '{n} of {total}',
  },
  theme: {
    label: 'Appearance',
    light: 'Light (Paper)',
    dark: 'Dark (Slate)',
    auto: 'System',
  },
  footer: {
    tagline: 'A team second brain stored in Git.',
    license: 'Synaptane is open source under the Apache License 2.0.',
    madeBy: 'Made by',
    author: 'René Cotton',
    contact: 'Questions and ideas: GitHub Discussions',
    status: 'Alpha. First release: v1.0.0-rc.1.',
  },
  code: {
    copy: 'Copy',
    copied: 'Copied',
    copyLabel: 'Copy the code to the clipboard',
  },
  screenshot: {
    light: 'light theme',
    dark: 'dark theme',
  },
  blog: {
    readMore: 'Read the post',
    by: 'By',
    published: 'Published on',
    updated: 'Updated on',
    empty: 'No posts yet.',
    backToList: 'All posts',
    translationMissing: 'This post is not available in French.',
  },
  todo: 'To do',
  notFound: {
    title: 'Page not found',
    text: 'This page does not exist, or it has moved.',
    home: 'Back to the home page',
    docs: 'Read the documentation',
  },
};

export type Dictionary = typeof en;
