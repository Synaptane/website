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
        // Empty: the link is named by the site title, which Starlight keeps in a screen-reader
        // only span (replacesTitle); an alt text too would read « Synaptane Synaptane ».
        alt: '',
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: GITHUB }],
      customCss: ['./src/styles/tokens.css', './src/styles/starlight.css'],
      head: [
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        // Social preview image (og.png / og-fr.png), og:locale and structured data, in the page's
        // language: src/components/starlight/Head.astro
      ],
      components: {
        Header: './src/components/starlight/Header.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
        LanguageSelect: './src/components/starlight/LanguageSelect.astro',
        MobileMenuFooter: './src/components/starlight/MobileMenuFooter.astro',
        MobileMenuToggle: './src/components/starlight/MobileMenuToggle.astro',
        EditLink: './src/components/starlight/EditLink.astro',
        Footer: './src/components/starlight/Footer.astro',
        Head: './src/components/starlight/Head.astro',
        MarkdownContent: './src/components/starlight/MarkdownContent.astro',
      },
      // The bilingual 404 page is src/pages/404.astro (GitHub Pages serves one 404.html).
      disable404Route: true,
      // Code blocks of the docs drawn like those of the site pages (src/components/CodeBlock.astro):
      // same size, padding and background, a "Terminal" title bar without the window dots, and
      // a copy button always shown in that bar (layout of the bar and of the button:
      // starlight.css, "Code blocks").
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          borderRadius: '8px',
          borderColor: 'var(--border)',
          codeFontFamily: 'var(--font-mono)',
          uiFontFamily: 'var(--font-body)',
          codeFontSize: '13.5px',
          codeLineHeight: '1.6',
          codePaddingBlock: '14px',
          codePaddingInline: '16px',
          codeBackground: 'var(--bg-2)',
          frames: {
            editorBackground: 'var(--bg-2)',
            terminalBackground: 'var(--bg-2)',
            editorTabBarBackground: 'var(--bg-2)',
            terminalTitlebarBackground: 'var(--bg-2)',
            terminalTitlebarForeground: 'var(--ink-3)',
            terminalTitlebarDotsOpacity: '0',
            editorActiveTabBackground: 'var(--bg-2)',
            terminalTitlebarBorderBottomColor: 'var(--border)',
            editorTabBarBorderBottomColor: 'var(--border)',
            frameBoxShadowCssValue: 'none',
            inlineButtonForeground: 'var(--ink-2)',
            inlineButtonBackground: 'var(--hover)',
            inlineButtonBorder: 'var(--border)',
            inlineButtonBorderOpacity: '1',
          },
        },
      },
      // Sidebar: five groups. Overview pages are listed by hand; the other groups list their
      // folder, in the order of docs/index.md (sync-docs writes `sidebar.order`).
      sidebar: [
        {
          label: 'Overview',
          translations: { fr: 'Vue d’ensemble' },
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
