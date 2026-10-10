/**
 * Blog posts: src/content/blog/<lang>/<slug>.md, schema in src/content.config.ts.
 * A post and its translation share the same file name (the slug).
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { localizePath, type Lang } from '../i18n';

export type Post = CollectionEntry<'blog'>;

/** The slug of a post: 'en/hello-world' -> 'hello-world'. */
export function postSlug(post: Post): string {
  return post.id.replace(/^(en|fr)\//, '');
}

/** The URL of a post: /blog/<slug>/ or /fr/blog/<slug>/. */
export function postPath(post: Post): string {
  return localizePath(`/blog/${postSlug(post)}/`, post.data.lang);
}

/** The published posts of a language, newest first (drafts too under `npm run dev`). */
export async function getPosts(lang: Lang): Promise<Post[]> {
  const posts = await getCollection('blog', (post) => {
    const folder = post.id.split('/')[0];
    if (folder !== post.data.lang) {
      throw new Error(`Blog post ${post.id}: \`lang: ${post.data.lang}\` does not match its folder (${folder}/).`);
    }
    return post.data.lang === lang && (import.meta.env.DEV || !post.data.draft);
  });
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** getStaticPaths() of the post pages of a language. */
export async function postStaticPaths(lang: Lang) {
  const posts = await getPosts(lang);
  const other = await getPosts(lang === 'en' ? 'fr' : 'en');
  return posts.map((post) => {
    const translation = other.find((p) => postSlug(p) === postSlug(post));
    return {
      params: { slug: postSlug(post) },
      props: { post, translationPath: translation ? postPath(translation) : null },
    };
  });
}
