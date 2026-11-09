/**
 * Starlight route middleware (astro.config.mjs, `routeMiddleware`): the <title> of the docs
 * pages. Starlight writes « Page title · Synaptane »; a page whose title already names Synaptane
 * would read « Synaptane documentation · Synaptane ». The docs home page becomes
 * « Documentation · Synaptane », the other ones keep their title alone
 * (« Install and run Synaptane »), and so does a title too long for a search result with the
 * suffix (over 60 characters). The page itself (heading, og:title) is unchanged.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const title = route.entry.data.title;
  const tag = route.head.find((entry) => entry.tag === 'title');
  if (!tag) return;
  if (!/\bSynaptane\b/.test(title)) {
    if (`${title} · Synaptane`.length > 60) tag.content = title;
    return;
  }
  const home = route.id === 'docs' || route.id === 'fr/docs';
  // (« Documentation » in both languages.)
  tag.content = home ? 'Documentation · Synaptane' : title;
});
