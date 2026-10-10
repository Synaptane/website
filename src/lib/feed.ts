/**
 * RSS 2.0 feed of the blog, one per language: /blog/rss.xml and /fr/blog/rss.xml.
 * Written by hand (no dependency): the published posts, newest first, with their full text.
 * Drafts are left out, like on the blog itself (see getPosts).
 */
import { localizePath, useTranslations, type Lang } from '../i18n';
import { SITE } from '../site';
import { getPosts, postPath } from './blog';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The HTML of a post for a feed reader: without the stylesheet links and scripts that the code
 * blocks bring (Expressive Code), and with absolute URLs (href="/docs/…"): readers have no base URL.
 */
const forFeed = (html: string, site: URL) =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\b(href|src)="\/(?!\/)([^"]*)"/g, (_, attr, path) => `${attr}="${new URL(`/${path}`, site).href}"`);

export async function blogFeed(lang: Lang, site: URL | undefined): Promise<Response> {
  const base = site ?? new URL(SITE.url);
  const t = useTranslations(lang);
  const posts = await getPosts(lang);
  const blogUrl = new URL(localizePath('/blog/', lang), base).href;
  const feedUrl = new URL(localizePath('/blog/rss.xml', lang).replace(/\/$/, ''), base).href;
  const title = lang === 'fr' ? 'Blog de Synaptane' : 'Synaptane blog';
  const description = lang === 'fr' ? 'Les nouvelles de Synaptane.' : 'News about Synaptane.';
  const updated = posts[0]?.data.updated ?? posts[0]?.data.date ?? new Date();

  const items = posts.map((post) => {
    const url = new URL(postPath(post), base).href;
    const html = post.rendered?.html ? forFeed(post.rendered.html, base) : '';
    return `    <item>
      <title>${escape(post.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${post.data.date.toUTCString()}</pubDate>
      <dc:creator>${escape(post.data.author)}</dc:creator>
      <description>${escape(post.data.description)}</description>${html ? `
      <content:encoded>${escape(html)}</content:encoded>` : ''}
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escape(title)}</title>
    <link>${blogUrl}</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <description>${escape(description)}</description>
    <language>${t.meta.ogLocale.replace('_', '-').toLowerCase()}</language>
    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
