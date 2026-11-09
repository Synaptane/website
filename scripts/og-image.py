"""Generates the social preview images (Open Graph, 1280×640): public/og.png (English) and
public/og-fr.png (French).

Each image is a small HTML page rendered in a headless browser: the site's tokens and fonts
(src/styles/tokens.css, public/fonts/), the dark logo (src/assets/brand/logo-dark.svg), the
promise of the home page in the language, the address of the site, and a screenshot of a page
of the static demo (public/demo/app/ or public/fr/demo/app/, in Slate, the dark theme). Nothing
to build first: the script serves public/ itself.

    uv run --no-project --with playwright python scripts/og-image.py

Run it again when the promise of the home page, the logo or the demo change. The pages that use
the images are src/layouts/Base.astro (site) and src/components/starlight/Head.astro (docs).
"""

import base64
import functools
import http.server
import threading
from pathlib import Path

from playwright.sync_api import Route, sync_playwright

SITE = Path(__file__).resolve().parents[1]
PUBLIC = SITE / "public"
WIDTH, HEIGHT = 1280, 640
DEMO_PAGE = "o/acme/it/p/infra/backups.md/"

# The promise of the home page (title and muted line of the hero, src/pages/index.astro and
# src/pages/fr/index.astro): keep them identical.
TEXTS = {
    "en": {
        "file": "og.png",
        "demo": "/demo/app/",
        "title": "Your team’s memory, in&nbsp;Git.",
        "line": "Fed by your AI assistants, tidied up every night.",
    },
    "fr": {
        "file": "og-fr.png",
        "demo": "/fr/demo/app/",
        "title": "La mémoire de votre équipe, dans&nbsp;Git.",
        "line": "Vos assistants IA l’alimentent, elle se range chaque&nbsp;nuit.",
    },
}

TEMPLATE = """<!doctype html>
<html lang="{lang}" data-theme="dark">
<head>
<meta charset="utf-8">
<style>
{tokens}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; width: {width}px; height: {height}px; overflow: hidden; }}
body {{
  position: relative;
  background:
    radial-gradient(640px 420px at 0% 100%, rgb(182 243 106 / .10), transparent 70%),
    var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}}
.text {{ position: absolute; left: 72px; top: 72px; bottom: 64px; width: 500px; display: flex; flex-direction: column; }}
.logo {{ height: 52px; width: auto; align-self: flex-start; }}
h1 {{
  margin: 56px 0 0; font-weight: 600; font-size: 54px; line-height: 1.08; letter-spacing: -0.03em;
  text-wrap: balance;
}}
p {{ margin: 22px 0 0; font-size: 25px; line-height: 1.35; color: var(--ink-3); text-wrap: balance; }}
.url {{
  margin-top: auto; display: flex; align-items: center; gap: 12px;
  font-family: var(--font-mono); font-size: 24px; color: var(--ink-2); letter-spacing: -0.01em;
}}
.url::before {{ content: ""; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); }}
.shot {{
  position: absolute; left: 628px; top: 84px; width: 900px; height: 600px; overflow: hidden;
  border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
  box-shadow: 0 30px 80px rgb(0 0 0 / .55), 0 0 0 1px rgb(182 243 106 / .06);
}}
.shot img {{ display: block; width: 900px; height: auto; }}
</style>
</head>
<body>
  <div class="text">
    {logo}
    <h1>{title}</h1>
    <p>{line}</p>
    <div class="url">synaptane.com</div>
  </div>
  <div class="shot"><img src="data:image/png;base64,{shot}" alt=""></div>
</body>
</html>
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args: object) -> None:
        pass


def fulfill(html: str, route: Route) -> None:
    route.fulfill(body=html, content_type="text/html; charset=utf-8")


def main() -> None:
    handler = functools.partial(QuietHandler, directory=str(PUBLIC))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    tokens = (SITE / "src/styles/tokens.css").read_text(encoding="utf-8")
    logo = (SITE / "src/assets/brand/logo-dark.svg").read_text(encoding="utf-8")
    logo = logo.replace("<svg ", '<svg class="logo" ', 1)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for lang, t in TEXTS.items():
                # The demo page, in Slate, without its banner; drawn larger than shown, for sharp text.
                demo = browser.new_page(viewport={"width": 1120, "height": 760}, device_scale_factor=1.6, color_scheme="dark")
                demo.goto(base + t["demo"] + DEMO_PAGE)
                demo.evaluate("document.querySelector('.demo-banner')?.remove()")  # CSP: no inline style
                demo.evaluate("document.fonts.ready")
                shot = base64.b64encode(demo.screenshot()).decode()
                demo.close()

                page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=1)
                html = TEMPLATE.format(lang=lang, tokens=tokens, width=WIDTH, height=HEIGHT, logo=logo, title=t["title"], line=t["line"], shot=shot)
                # Served from the same origin as public/, so that /fonts/ resolves.
                page.route(base + "/og-image/", functools.partial(fulfill, html))
                page.goto(base + "/og-image/")
                page.evaluate("document.fonts.ready")
                out = PUBLIC / t["file"]
                page.screenshot(path=str(out))
                page.close()
                print(f"{out.relative_to(SITE)}: {out.stat().st_size // 1024} KB")
            browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
