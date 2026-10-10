// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const GITHUB = 'https://github.com/synaptane/synaptane';

// https://astro.build/config
export default defineConfig({
  site: 'https://synaptane.com',
  // Every page URL ends with a slash (/about/, /docs/concepts/): the same rule for the site
  // pages, the docs and the links checked by scripts/check-links.mjs.
  trailingSlash: 'always',
  // No prefetch script: the site pages ship no JavaScript besides two small inline scripts.
  prefetch: false,
  // The languages are declared once, in Starlight (`locales` below): Starlight derives Astro's
  // `i18n` configuration from them (English at the root, French under /fr/), so `astro:i18n`
  // and `Astro.currentLocale` work in the site pages too. See src/i18n/index.ts.
  integrations: [
    starlight({
      title: 'Synaptane',
      description:
        'Synaptane is a self-hosted team second brain stored in Git: a Markdown wiki, full-text and semantic search, an MCP server for AI assistants, and nightly tidy-up by an AI agent.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        fr: { label: 'Français', lang: 'fr' },
      },
      logo: {
        light: './src/assets/brand/logo.svg',
        dark: './src/assets/brand/logo-dark.svg',
        alt: 'Synaptane',
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: GITHUB }],
      customCss: ['./src/styles/tokens.css', './src/styles/starlight.css'],
      head: [
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://synaptane.com/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1280' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '640' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://synaptane.com/og.png' } },
      ],
      components: {
        Header: './src/components/starlight/Header.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
        LanguageSelect: './src/components/starlight/LanguageSelect.astro',
        MobileMenuFooter: './src/components/starlight/MobileMenuFooter.astro',
        EditLink: './src/components/starlight/EditLink.astro',
      },
      // The bilingual 404 page is src/pages/404.astro (GitHub Pages serves one 404.html).
      disable404Route: true,
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          borderRadius: '8px',
          borderColor: 'var(--border)',
          codeFontFamily: 'var(--font-mono)',
          uiFontFamily: 'var(--font-body)',
          codeFontSize: '13px',
          codeBackground: 'var(--bg-2)',
          frames: {
            editorBackground: 'var(--bg-2)',
            terminalBackground: 'var(--bg-2)',
            editorTabBarBackground: 'var(--bg)',
            terminalTitlebarBackground: 'var(--bg)',
            editorActiveTabBackground: 'var(--bg-2)',
            terminalTitlebarBorderBottomColor: 'var(--border)',
            editorTabBarBorderBottomColor: 'var(--border)',
            frameBoxShadowCssValue: 'none',
          },
        },
      },
      // Sidebar: five groups. Overview pages are listed by hand; the other groups list their
      // folder, in the order of docs/index.md (sync-docs writes `sidebar.order`).
      sidebar: [
        {
          label: 'Overview',
          translations: { fr: "Vue d'ensemble" },
          items: [
            { slug: 'docs', label: 'Introduction', translations: { fr: 'Introduction' } },
            { slug: 'docs/concepts' },
          ],
        },
        {
          label: 'Guide',
          translations: { fr: 'Guide' },
          items: [{ autogenerate: { directory: 'docs/guide' } }],
        },
        {
          label: 'Administration',
          translations: { fr: 'Administration' },
          items: [{ autogenerate: { directory: 'docs/admin' } }],
        },
        {
          label: 'Reference',
          translations: { fr: 'Référence' },
          items: [{ autogenerate: { directory: 'docs/reference' } }],
        },
        {
          label: 'Development',
          translations: { fr: 'Développement' },
          collapsed: true,
          items: [{ autogenerate: { directory: 'docs/dev' } }],
        },
      ],
    }),
  ],
});
