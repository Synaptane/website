"""Checks the built static demo in a headless browser (after `npm run build`):

- every request made by the demo pages stays on the site and targets demo files or /fonts/;
- no console error (CSP violation, script error);
- no active control in a frozen form; a forced submission changes nothing;
- navigation by clicks, from page to page (tree fragment, history, diff, inbox, search);
- files other than Markdown: the PDF opens in the browser's viewer, the HTML file is rendered
  in its sandboxed frame, the extracted text of an Office document is shown;
- screenshots of a few pages (light/dark, EN/FR, mobile) in screenshots/demo/ (ignored by Git);
  with --preview, also the two images of the /demo/ page (src/assets/demo/, committed); with
  --gallery, the home page screenshots taken on the demo (src/assets/app/ and
  public/images/app/, committed; needs Pillow).

Chromium runs in its full headless mode (channel "chromium"): the lighter headless shell has no
PDF viewer. The viewer's own requests (chrome-extension://, chrome://) are not the demo's.

    npm run build
    uv run --no-project --with playwright [--with pillow] python scripts/build-demo/browse.py [--dist dist]
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
BROWSER_OWN = ("chrome-extension://", "chrome://")  # the PDF viewer
DOCS = "/demo/app/o/acme/it/p/infra/documents/"
PDF = DOCS + "brightrack-support-contract.pdf/"
HTML_FILE = DOCS + "status-report-2026-w40.html/"
SLIDES = "/demo/app/o/acme/it/p/team/documents/2026-q3-infrastructure-review.pptx/"

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
    PDF,
    DOCS + "2026-09-delivery-note.pdf/",
    DOCS + "hardware-inventory.xlsx/",
    DOCS + "rack-b-elevation.png/",
    HTML_FILE,
    HTML_FILE + "@source-1/",
    SLIDES,
    "/fr/demo/app/o/acme/it/p/team/documents/onboarding-checklist.docx/",
    "/demo/app/o/acme/it/p/infra/servers.md/",
    "/demo/app/search/kestrel/",
    "/fr/demo/app/search/mttr/",
    "/demo/app/search/docking/",
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
    ("en-pdf-light", PDF, "light", 1440, 900),
    ("en-html-dark", HTML_FILE, "dark", 1440, 900),
    ("fr-slides-dark", "/fr" + SLIDES, "dark", 1440, 900),
    ("en-servers-mobile", "/demo/app/o/acme/it/p/infra/servers.md/", "light", 390, 844),
]

# Screenshots of the home page gallery (--gallery): the real interface, without the demo banner.
# (name, url, script run before the shot)
SCAN_AND_TEXT = """() => {
  document.querySelector('.doc-body > details').open = true;
  document.querySelector('.doc-frame').style.height = '450px';
}"""
GALLERY = [
    ("pdf", PDF, None),
    ("office", SLIDES, None),
    # The scanned delivery note and, below a shorter frame, the text read by OCR.
    ("ocr", DOCS + "2026-09-delivery-note.pdf/", SCAN_AND_TEXT),
]
GALLERY_SIZE = (2000, 1250)
WITHOUT_DEMO = """() => {
  document.querySelector('.demo-banner')?.remove();
  document.querySelector('.demo-search-note')?.remove();
  document.body.classList.remove('demo-static');
}"""

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
    parser.add_argument("--gallery", action="store_true",
                        help="also update the home page screenshots (src/assets/app/, public/images/app/)")
    args = parser.parse_args()
    server, origin = serve(args.dist.resolve())
    problems: list[str] = []
    requests: list[str] = []
    args.shots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chromium")
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

        # Files other than Markdown.
        visit(PDF)
        page.wait_for_timeout(1500)
        if not any(f.url.startswith("chrome-extension://") for f in page.frames):
            problems.append(f"{PDF}: the PDF viewer did not open")
        visit(HTML_FILE)
        frame = page.frame_locator("iframe.doc-frame")
        if "Weekly status report" not in (frame.locator("h1").text_content(timeout=5000) or ""):
            problems.append(f"{HTML_FILE}: the HTML file is not rendered")
        visit(SLIDES)
        if not page.locator(".doc-body details[open] pre").is_visible():
            problems.append(f"{SLIDES}: no extracted text shown")

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
        if args.gallery:
            gallery(browser, origin)
        browser.close()
    server.shutdown()

    for url in requests:
        if url.startswith(BROWSER_OWN):
            continue
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


def gallery(browser, origin: str) -> None:
    """Home page screenshots: 1440×900 at scale 2, reduced to 2000×1250, 256-color PNG
    (libimagequant through the `imagequant` package if present, as pngquant does). The
    thumbnail (src/assets/app/, optimized by Astro) and the full-size original opened by the
    viewer (public/images/app/) are the same file."""
    from PIL import Image

    try:
        import imagequant
    except ImportError:
        imagequant = None

    assets, full = SITE / "src" / "assets" / "app", SITE / "public" / "images" / "app"
    full.mkdir(parents=True, exist_ok=True)
    for name, url, prepare in GALLERY:
        shot = browser.new_context(viewport={"width": 1440, "height": 900},
                                   color_scheme="light", device_scale_factor=2)
        tab = shot.new_page()
        tab.goto(origin + url, wait_until="networkidle")
        tab.evaluate(WITHOUT_DEMO)
        if prepare:
            tab.evaluate(prepare)
        tab.wait_for_timeout(2000)  # the PDF viewer renders after the load
        raw = full / f"screenshot-{name}.raw.png"
        tab.screenshot(path=str(raw))
        shot.close()
        with Image.open(raw) as image:
            small = image.convert("RGB").resize(GALLERY_SIZE, Image.Resampling.LANCZOS)
        if imagequant:
            quantized = imagequant.quantize_pil_image(small.convert("RGBA"), dithering_level=1.0, max_colors=256)
        else:
            quantized = small.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
        target = full / f"screenshot-{name}.png"
        quantized.save(target, optimize=True)
        raw.unlink()
        (assets / f"{name}.png").write_bytes(target.read_bytes())
        print(f"gallery: {name}.png, {target.stat().st_size // 1024} KiB")


if __name__ == "__main__":
    sys.exit(main())
