/**
 * The commands that install Synaptane with Docker Compose and load the demo wiki, shown on the
 * home page and on the demo page (same commands, comments in the page's language). Checked
 * against docs/admin/installation.md (section "Demo data") of synaptane/synaptane.
 */
import { SITE } from '../site';

/** Image tag of the latest version (v1.0.0-rc.1 -> 1.0.0-rc.1). */
export const imageVersion = SITE.version.replace(/^v/, '');

const comments = {
  en: {
    clone: '# 1. Get the release',
    env: '# 2. Write a minimal .env (the last line is for the demo only)',
    start: '# 3. Start, then load the demo wiki',
  },
  fr: {
    clone: '# 1. Récupérer la version publiée',
    env: '# 2. Écrire un .env minimal (la dernière ligne ne sert qu’à la démo)',
    start: '# 3. Démarrer, puis charger le wiki de démonstration',
  },
} as const;

export function installCode(lang: 'en' | 'fr'): string {
  const c = comments[lang];
  return `${c.clone}
git clone --branch ${SITE.version} https://github.com/synaptane/synaptane.git && cd synaptane

${c.env}
printf 'PUBLIC_URL=http://localhost:8000\\nPOSTGRES_PASSWORD=%s\\nSYNAPTANE_VERSION=${imageVersion}\\n' \\
  "$(openssl rand -hex 24)" > .env
echo 'COMPOSE_FILE=compose.yaml:examples/compose.demo.yaml' >> .env

${c.start}
docker compose up -d
docker compose exec app synaptane demo`;
}
