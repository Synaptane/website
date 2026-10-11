import type { Dictionary } from './en';

/** Chaînes d’interface des pages du site, en français (mêmes clés que en.ts). */
export const fr: Dictionary = {
  meta: {
    siteName: 'Synaptane',
    defaultDescription:
      "Synaptane est un second cerveau d’équipe auto-hébergé, stocké dans Git : le Markdown d’abord, et tous vos fichiers (PDF, scans, Office, images), une recherche plein texte et sémantique, un serveur MCP pour vos assistants IA, et un rangement nocturne par un agent IA.",
    ogImageAlt: "Synaptane, le second cerveau d’équipe stocké dans Git",
    ogLocale: 'fr_FR',
  },
  a11y: {
    skipToContent: 'Aller au contenu',
    mainNav: 'Navigation principale',
    footerNav: 'Pied de page',
    home: "Accueil de Synaptane",
    menu: 'Menu',
    externalLink: '(ouvre GitHub)',
  },
  nav: {
    docs: 'Documentation',
    demo: 'Démo',
    roadmap: 'Feuille de route',
    about: 'À propos',
    releases: 'Versions',
    github: 'GitHub',
    discussions: 'Discussions',
    legal: 'Mentions légales',
  },
  language: {
    label: 'Langue',
    switchTo: 'Read in English',
  },
  lightbox: {
    label: 'Captures d’écran',
    open: '(ouvre un aperçu en grand)',
    close: 'Fermer',
    previous: 'Capture précédente',
    next: 'Capture suivante',
    zoomIn: 'Afficher en taille réelle',
    zoomOut: 'Ajuster à l’écran',
    thumbnails: 'Toutes les captures',
    counter: '{n} sur {total}',
  },
  theme: {
    label: 'Apparence',
    light: 'Clair (Papier)',
    dark: 'Sombre (Ardoise)',
    auto: 'Système',
  },
  footer: {
    tagline: "Un second cerveau d’équipe stocké dans Git.",
    license: 'Synaptane est un logiciel libre sous licence Apache 2.0.',
    madeBy: 'Conçu par',
    author: 'René Cotton',
    contact: 'Questions et idées : Discussions GitHub',
    copyright: 'René Cotton et les contributeurs de Synaptane.',
    licenseShort: 'Licence Apache 2.0',
  },
  release: {
    preview: 'Préversion',
    upcoming: 'Préversion à venir',
    released: 'Préversion : {version}, publiée le {date}.',
    coming: 'Préversion : {version}, à venir.',
  },
  code: {
    copy: 'Copier',
    copied: 'Copié',
    copyLabel: 'Copier le code dans le presse-papiers',
  },
  screenshot: {
    light: 'thème clair',
    dark: 'thème sombre',
  },
  todo: 'À faire',
  notFound: {
    title: 'Page introuvable',
    text: "Cette page n’existe pas, ou elle a été déplacée.",
    home: "Retour à l’accueil",
    docs: 'Lire la documentation',
  },
};
