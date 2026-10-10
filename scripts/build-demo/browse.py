"""Checks the built static demo in a headless browser (after `npm run build`):

- every request made by the demo pages stays on the site and targets demo files or /fonts/;
- no console error (CSP violation, script error);
- no active control in a frozen form; a forced submission changes nothing;
- navigation by clicks, from page to page (tree fragment, history, diff, inbox, search);
- screenshots of a few pages (light/dark, EN/FR, mobile) in screenshots/demo/ (ignored by Git);
  with --preview, also the two images of the /demo/ page (src/assets/demo/, committed).

    npm run build
    uv run --no-project --with playwright python scripts/build-demo/browse.py [--dist dist]
"""

import argparse
import functools
import http.server
import sys
import threading
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

SITE = Path(__file__).resolve().parents[2]
ALLOWED = ("/demo/app/", "/fr/demo/app/", "/fonts/")

PAGES = [
    "/demo/app/",
    "/demo/app/o/acme/it/",
    "/demo/app/o/acme/it/p/procedures/restore.md/",
    "/demo/app/o/acme/it/history/procedures/restore.md/",
    "/demo/app/o/acme/it/inbox/",
    "/demo/app/o/acme/it/health/",
    "/demo/app/o/acme/it/activity/",
    "/demo/app/o/acme/it/tidy/",
    "/demo/app/o/acme/it/-/routines/",
    "/demo/app/o/acme/it/-/vocation/",
    "/demo/app/search/",
    "/demo/app/search/vpn/",
    "/demo/app/account/assistants/",
    "/demo/app/unavailable/",
    "/fr/demo/app/",
    "/fr/demo/app/o/acme/it/p/infra/backups.md/",
    "/fr/demo/app/o/acme/it/inbox/",
    "/fr/demo/app/search/backup/",
]

SHOTS = [
    # (name, url, theme, width, height)
    ("en-wiki-light", "/demo/app/o/acme/it/p/procedures/restore.md/", "light", 1440, 900),
    ("en-diff-dark", "/demo/app/o/acme/it/history/procedures/restore.md/", "dark", 1440, 900),
    ("fr-inbox-light", "/fr/demo/app/o/acme/it/inbox/", "light", 1440, 900),
    ("fr-search-dark", "/fr/demo/app/search/backup/", "dark", 1440, 900),
    ("en-health-dark", "/demo/app/o/acme/it/health/", "dark", 1280, 800),
    ("fr-wiki-mobile", "/fr/demo/app/o/acme/it/p/procedures/restore.md/", "light", 390, 844),
    ("en-assistants-light", "/demo/app/account/assistants/", "light", 1280, 800),
    ("en-unavailable-light", "/demo/app/unavailable/", "light", 1280, 800),
]

PREVIEW = "/demo/app/o/acme/it/p/procedures/restore.md/"

ACTIVE_CONTROLS = """() => [...document.querySelectorAll('form[data-demo-off]')]
  .flatMap(f => [...f.elements])
  .filter(e => e.type !== 'hidden' && !e.disabled && !('themeOption' in e.dataset))
  .map(e => e.outerHTML.slice(0, 80))"""


def serve(dist: Path) -> tuple[http.server.ThreadingHTTPServer, str]:
    handler = functools.partial(QuietHandler, directory=str(dist))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args: object) -> None:
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist", type=Path, default=SITE / "dist")
    parser.add_argument("--shots", type=Path, default=SITE / "screenshots" / "demo")
    parser.add_argument("--preview", action="store_true", help="also update src/assets/demo/*.png")
    args = parser.parse_args()
    server, origin = serve(args.dist.resolve())
    problems: list[str] = []
    requests: list[str] = []
    args.shots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.on("request", lambda r: requests.append(r.url))
        page.on("console", lambda m: m.type == "error" and problems.append(f"console: {m.text} ({page.url})"))
        page.on("pageerror", lambda e: problems.append(f"script error: {e} ({page.url})"))

        def visit(url: str) -> None:
            response = page.goto(origin + url, wait_until="networkidle")
            if response is None or response.status != 200:
                problems.append(f"{url}: status {response.status if response else '?'}")
            if not page.locator(".demo-banner").count():
                problems.append(f"{url}: no banner")
            active = page.evaluate(ACTIVE_CONTROLS)
            if active:
                problems.append(f"{url}: active controls {active}")

        for url in PAGES:
            visit(url)

        # A forced submission: nothing leaves the page, the banner explains.
        visit("/demo/app/o/acme/it/p/procedures/restore.md/")
        before = page.url
        page.evaluate("document.querySelector('form[data-demo-off]').requestSubmit()")
        page.wait_for_timeout(300)
        if page.url != before:
            problems.append("forced submission navigated away")
        if "demo-banner-flashing" not in (page.locator(".demo-banner").get_attribute("class") or ""):
            problems.append("forced submission: no message in the banner")

        # Theme: the banner switch applies at once, is kept across pages and shared with the site.
        page.locator(".demo-banner [data-theme-option=dark]").click()
        if page.evaluate("document.documentElement.dataset.theme") != "dark":
            problems.append("theme switch: not applied")
        visit("/demo/app/o/acme/it/inbox/")
        stored = page.evaluate("[document.documentElement.dataset.theme, localStorage.getItem('starlight-theme')]")
        if stored != ["dark", "dark"]:
            problems.append(f"theme switch: not kept ({stored})")
        page.locator(".demo-banner [data-theme-option=system]").click()

        # Navigation by clicks.
        steps: list[str] = []

        def click(selector: str) -> None:
            page.locator(selector).first.click()
            page.wait_for_load_state("networkidle")
            steps.append(page.url.replace(origin, ""))

        visit("/demo/app/")
        click("aside a[href$='/demo/app/o/acme/it/']")  # IT team
        page.locator(".tree-toggle[aria-label$='infra']").first.click()  # fragment
        page.wait_for_selector(".space-tree a[href$='/p/infra/backups.md/']")
        click(".space-tree a[href$='/p/infra/backups.md/']")
        click(".topbar-doc a[href*='/history/']")
        click("a[href*='/diff/']")
        click(".sidebar-inbox")
        click("main a[href*='/inbox/2026']")
        click(".topbar-search")
        page.fill("form[data-demo-search] input[name=q]", "VPN")
        page.press("form[data-demo-search] input[name=q]", "Enter")
        page.wait_for_load_state("networkidle")
        steps.append(page.url.replace(origin, ""))
        click(".search-results a.search-title")
        click(".demo-banner-lang")  # French twin
        click("main a.button-primary[href*='unavailable'], .topbar-doc a.button-primary")  # Edit
        for step in steps:
            if not step.startswith(ALLOWED):
                problems.append(f"navigation left the demo: {step}")
        if "/unavailable/" not in steps[-1] or not steps[-2].startswith("/fr/demo/app/"):
            problems.append(f"navigation: unexpected end {steps[-2:]}")
        print("navigation:", " → ".join(steps))

        # Screenshots.
        for name, url, theme, width, height in SHOTS:
            shot = browser.new_context(viewport={"width": width, "height": height},
                                       color_scheme=theme, device_scale_factor=1)
            tab = shot.new_page()
            tab.on("request", lambda r: requests.append(r.url))
            tab.goto(origin + url, wait_until="networkidle")
            tab.screenshot(path=str(args.shots / f"{name}.png"))
            shot.close()
        if args.preview:
            target = SITE / "src" / "assets" / "demo"
            target.mkdir(parents=True, exist_ok=True)
            for theme in ("light", "dark"):
                shot = browser.new_context(viewport={"width": 1200, "height": 750},
                                           color_scheme=theme, device_scale_factor=2)
                tab = shot.new_page()
                tab.goto(origin + PREVIEW, wait_until="networkidle")
                tab.screenshot(path=str(target / f"demo-{theme}.png"))
                shot.close()
        browser.close()
    server.shutdown()

    for url in requests:
        if not url.startswith(origin):
            problems.append(f"request outside the site: {url}")
            continue
        path = url[len(origin):]
        if not path.startswith(ALLOWED):
            problems.append(f"request outside the demo: {path}")
    print(f"{len(requests)} requests, all to {', '.join(ALLOWED)}" if not problems else "")
    for p in dict.fromkeys(problems):
        print("  ✗", p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
