"""Builds the static demo of synaptane.com from the real Synaptane interface.

Run through build.sh (it provides the application's Python environment):

    scripts/build-demo/build.sh [--app ../synaptane-public] [--admin-url postgresql://…/postgres]

Steps: a throwaway instance (instance.py) loaded with the Acme demo data and a few fictional
commits (life.py); a signed-in crawl of the read-only pages, once per interface language; then
each page is rewritten for static hosting (links, assets, forms, banner) and written to
public/demo/app/ (English) and public/fr/demo/app/ (French), with MANIFEST.json. The instance
is always torn down. check_demo.py then checks the result (also usable alone, without the app).
See README.md in this folder.
"""

import argparse
import importlib.metadata
import json
import re
import shutil
import subprocess
import sys
from collections import deque
from dataclasses import dataclass, field
from datetime import date
from hashlib import sha256
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit

from bs4 import BeautifulSoup, NavigableString, Tag
from bs4.formatter import HTMLFormatter

import check_demo
from instance import ORG, SPACE, Instance, log

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
ASSETS = "/demo/app/static"  # demo.js, demo.css and the application's files, shared by EN and FR
PUBLIC_URL = "https://brain.acme.example"  # replaces the instance address (fictional, reserved)
UNAVAILABLE = "/unavailable"

# Searches frozen in the demo (the dataset is in English, in both interface languages). The last
# four find files other than Markdown: the scanned delivery note (OCR), the slides, the sheet,
# and the 2019 inventory in the old .xls format (catdoc).
QUERIES = [
    "backup", "vpn", "onboarding", "nas", "firewall", "restore", "wifi", "password",
    "kestrel", "mttr", "docking", "netware",
]

SPACE_BASE = f"/o/{ORG}/{SPACE}"
SEEDS = [
    "/",
    f"/o/{ORG}",
    SPACE_BASE,
    f"{SPACE_BASE}/inbox",
    f"{SPACE_BASE}/tidy",
    f"{SPACE_BASE}/activity",
    f"{SPACE_BASE}/health",
    f"{SPACE_BASE}/-/routines",
    f"{SPACE_BASE}/-/vocation",
    "/account/assistants",
    "/search",
    *[f"/search?q={q}" for q in QUERIES],
]

LANGS = {
    "en": {
        "prefix": "/demo/app",
        "install": "/docs/admin/installation/",
        "about": "/demo/",
        "banner_label": "Static demo",
        "banner_title": "Static demo",
        "banner_text": " — nothing you do here is saved.",
        "banner_link": "Install Synaptane to try it for real.",
        "legal": ("/legal/", "Legal notice"),
        "flash": "Read-only demo: this action is not available here.",
        "other": ("fr", "Français", "Version française"),
        "appearance": "Appearance",
        # The site's labels (src/i18n/en.ts, theme): the same three choices, shared with the site.
        "themes": ("Light (Paper)", "Dark (Slate)", "System"),
        "search_note": "In the static demo, search is limited to these words:",
        "search_miss": "This search is not part of the static demo. Try one of these words:",
        "unavailable_title": "Not available in the static demo",
        "unavailable_text": (
            "This page changes data, or needs a running server: it is not part of the static "
            "demo. Everything here is a frozen copy of a real Synaptane instance."
        ),
        "unavailable_back": "Back to the demo",
        "unavailable_install": "Install Synaptane",
    },
    "fr": {
        "prefix": "/fr/demo/app",
        "install": "/fr/docs/admin/installation/",
        "about": "/fr/demo/",
        "banner_label": "Démo figée",
        "banner_title": "Démo figée",
        "banner_text": " : rien n’est enregistré.",
        "banner_link": "Installez Synaptane pour l’essayer pour de vrai.",
        "legal": ("/fr/legal/", "Mentions légales"),
        "flash": "Démo en lecture seule : cette action n’est pas disponible ici.",
        "other": ("en", "English", "English version"),
        "appearance": "Apparence",
        # Les libellés du site (src/i18n/fr.ts, theme).
        "themes": ("Clair (Papier)", "Sombre (Ardoise)", "Système"),
        "search_note": "Dans la démo figée, la recherche se limite à ces mots :",
        "search_miss": "Cette recherche ne fait pas partie de la démo figée. Essayez l’un de ces mots :",
        "unavailable_title": "Indisponible dans la démo figée",
        "unavailable_text": (
            "Cette page modifie des données ou demande un serveur en marche : elle ne fait pas "
            "partie de la démo figée. Tout ici est une copie figée d’une vraie instance Synaptane."
        ),
        "unavailable_back": "Retour à la démo",
        "unavailable_install": "Installer Synaptane",
    },
}

CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
    "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
)
# An HTML file of the wiki, shown rendered in a sandboxed frame (opaque origin) of its page. On
# synaptane.com it is a static file: it gets the strict policy the application gives raw files
# (its own styles, no script, nothing from the network), even when opened on its own.
DOCUMENT_CSP = check_demo.DOCUMENT_CSP
HTML_FILES = (".html", ".htm")

ICONS = {
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "moon": '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    "monitor": '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
}


# ---- URLs -------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Ref:
    """A crawlable address of the instance: kind, path, kept query parameters."""

    kind: str  # page | fragment | file | asset
    path: str
    params: tuple[tuple[str, str], ...] = ()

    @property
    def url(self) -> str:
        return self.path + (f"?{urlencode(self.params)}" if self.params else "")


@dataclass
class Rules:
    life_shas: list[str]
    life_paths: set[str]

    def classify(self, raw: str) -> Ref | None:
        """The Ref of an instance URL if it belongs to the demo, otherwise None."""
        parts = urlsplit(raw)
        if parts.scheme or parts.netloc:
            return None
        path = unquote(parts.path)
        if len(path) > 1:
            path = path.rstrip("/")
        params = parse_qsl(parts.query)
        q = dict(params)
        if path.startswith("/static/") or path == "/assets/code.css":
            return Ref("asset", path)
        if path in ("/", f"/o/{ORG}", SPACE_BASE, "/account/assistants"):
            return Ref("page", path)
        if path == "/search":
            query = q.get("q", "").strip().lower()
            if not query:
                return Ref("page", path)
            return Ref("page", path, (("q", query),)) if query in QUERIES else None
        if not path.startswith(SPACE_BASE + "/"):
            return None
        rest = path[len(SPACE_BASE) + 1 :]
        if rest.startswith("p/"):
            if not q:
                return Ref("page", path)
            # "View source" of an HTML file (shown rendered by default).
            if q == {"source": "1"} and path.lower().endswith(HTML_FILES):
                return Ref("page", path, (("source", "1"),))
            return None
        if rest.startswith("history/"):
            return Ref("page", path)
        if m := re.fullmatch(r"diff/([0-9a-f]{7,40})/(.+)", rest):
            sha, file = m.groups()
            wanted = any(s.startswith(sha) or sha.startswith(s) for s in self.life_shas)
            return Ref("page", path) if wanted or file in self.life_paths else None
        if rest.startswith("raw/"):
            return Ref("file", path)
        if rest == "inbox" or re.fullmatch(r"inbox/[^/]+", rest):
            return Ref("page", path) if not q else None
        if re.fullmatch(r"inbox/[^/]+/files/.+", rest):
            return Ref("file", path)
        if rest in ("tidy", "-/routines", "-/vocation"):
            return Ref("page", path) if not q else None
        if re.fullmatch(r"-/routines/[0-9a-f-]{36}", rest):
            return Ref("page", path)
        if rest == "health":
            kept = tuple((k, v) for k, v in params if k == "months")
            return Ref("page", path, kept)
        if rest == "activity":
            if "skip" in q:
                return None
            return Ref("page", path, tuple((k, v) for k, v in params if k == "kind"))
        if rest == "-/tree":
            return Ref("fragment", path, (("dir", q.get("dir", "")),))
        if rest.startswith("-/related/"):
            return Ref("fragment", path)
        return None


def static_url(ref: Ref, prefix: str) -> str:
    """Address of a frozen resource on synaptane.com."""
    if ref.kind == "asset":
        if ref.path.startswith("/static/fonts/") and ref.path.endswith(".woff2"):
            name = ref.path.rsplit("/", 1)[1]
            if same_font(name):
                return f"/fonts/{name}"
        return "/demo/app" + ref.path
    if ref.kind == "file":
        return prefix + quote(ref.path, safe="/@")
    if ref.kind == "fragment":
        if ref.path.endswith("/-/tree"):
            folder = dict(ref.params).get("dir", "").strip("/")
            return prefix + quote(f"{ref.path}/{folder or '_root'}.html", safe="/@")
        return prefix + quote(ref.path + ".html", safe="/@")
    if ref.path == "/search":
        q = dict(ref.params).get("q")
        return f"{prefix}/search/{quote(q)}/" if q else f"{prefix}/search/"
    path = "" if ref.path == "/" else ref.path
    if ref.params:
        path += "/@" + "-".join(re.sub(r"[^a-z0-9]+", "-", f"{k}-{v}".lower()) for k, v in ref.params)
    return prefix + quote(path, safe="/@") + "/"


def file_of(url: str, public: Path) -> Path:
    path = unquote(url)
    return public / (path.lstrip("/") + ("index.html" if path.endswith("/") else ""))


_FONT_CACHE: dict[str, bool] = {}
APP_STATIC: Path = Path()


def same_font(name: str) -> bool:
    """The site already serves this font (same bytes) under /fonts/."""
    if name not in _FONT_CACHE:
        site, app = SITE / "public" / "fonts" / name, APP_STATIC / "fonts" / name
        _FONT_CACHE[name] = (
            site.is_file() and app.is_file()
            and sha256(site.read_bytes()).digest() == sha256(app.read_bytes()).digest()
        )
    return _FONT_CACHE[name]


# ---- Crawl ------------------------------------------------------------------------------------
@dataclass
class Crawl:
    lang: str
    found: dict[Ref, bytes | None] = field(default_factory=dict)  # None: nothing (204)
    content_type: dict[Ref, str] = field(default_factory=dict)
    skipped: set[str] = field(default_factory=set)


URL_ATTRS = ("href", "src", "action", "data-tree", "data-related")


def links_of(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    urls = []
    for tag in soup.find_all(True):
        for attr in URL_ATTRS:
            if attr == "action" and (tag.get("method") or "get").lower() != "get":
                continue
            value = tag.get(attr)
            if isinstance(value, str) and value.startswith("/") and not value.startswith("//"):
                urls.append(value.split("#", 1)[0])
    return urls


def crawl(client, rules: Rules, lang: str) -> Crawl:
    result = Crawl(lang)
    queue: deque[str] = deque(SEEDS)
    seen: set[Ref] = set()
    while queue:
        raw = queue.popleft()
        ref = rules.classify(raw)
        if ref is None:
            result.skipped.add(urlsplit(raw).path)
            continue
        if ref in seen:
            continue
        seen.add(ref)
        response = client.get(ref.path, params=list(ref.params) or None)
        if response.status_code == 204:
            result.found[ref] = None
            continue
        # A link to a wiki page that does not exist: the application's "missing page" view
        # (404), which the demo shows as well (broken link of the Health tab).
        missing = response.status_code == 404 and "/p/" in ref.path and "text/html" in response.headers.get("content-type", "")
        if response.status_code != 200 and not missing:
            log(f"warning: {ref.url} answered {response.status_code}: left out")
            continue
        result.found[ref] = response.content
        kind = response.headers.get("content-type", "")
        result.content_type[ref] = kind
        if "text/html" in kind:
            queue.extend(links_of(response.text))
        elif "text/css" in kind:
            queue.extend(re.findall(r"url\((/static/[^)\"']+)\)", response.text))
    pages = sum(1 for r in result.found if r.kind == "page")
    log(f"{lang}: {pages} pages, {len(result.found) - pages} other files")
    return result


# ---- Rewrite ----------------------------------------------------------------------------------
class Rewriter:
    def __init__(self, rules: Rules, crawl: Crawl, lang: str, base: str, twins: set[Ref]) -> None:
        self.rules = rules
        self.crawl = crawl
        self.lang = lang
        self.t = LANGS[lang]
        self.prefix = self.t["prefix"]
        self.base = base  # http://127.0.0.1:port of the instance
        self.twins = twins  # pages frozen in the other language too

    def target(self, raw: str) -> str | None:
        """New address of an instance URL; None: not an instance URL (left as is)."""
        if raw.startswith(self.base):
            raw = raw[len(self.base) :] or "/"
        if raw.startswith("?"):  # same page, other parameters
            raw = self.current.path + raw
        if not raw.startswith("/") or raw.startswith("//"):
            return None
        address, _, anchor = raw.partition("#")
        ref = self.rules.classify(address)
        if ref is not None and ref in self.crawl.found and self.crawl.found[ref] is not None:
            return static_url(ref, self.prefix) + (f"#{anchor}" if anchor else "")
        if ref is not None and ref.kind == "asset":
            raise RuntimeError(f"asset not frozen: {raw}")
        if address == "" and anchor:
            return None
        return f"{self.prefix}{UNAVAILABLE}/"

    def rewrite(self, html: str, ref: Ref) -> str:
        soup = BeautifulSoup(html, "html.parser")
        self.current = ref
        page = ref.kind == "page"
        if page and soup.html:
            soup.html["data-user-key"] = "demo"
        for field_ in soup.select("input[name=csrf]"):
            field_.decompose()
        for dialog in soup.select("dialog#search-palette"):
            dialog.decompose()
        # Confirmations left by the generator's own actions ("Routine enabled…").
        for flash in soup.select("div.notice[data-flash]"):
            flash.decompose()
        for attr in ("data-palette-open", "data-assistant-test", "data-test-pending", "data-tidy-state"):
            for tag in soup.select(f"[{attr}]"):
                del tag[attr]
        for tag in soup.find_all(True):
            for attr in ("href", "src", "data-tree"):
                value = tag.get(attr)
                if isinstance(value, str) and (new := self.target(value)) is not None:
                    tag[attr] = new
                    # "Download": the static file has no Content-Disposition header.
                    if attr == "href" and ("download", "1") in parse_qsl(urlsplit(value).query):
                        tag["download"] = ""
            related = tag.get("data-related")
            if isinstance(related, str):
                found = self.rules.classify(related)
                if found is not None and self.crawl.found.get(found):
                    tag["data-related"] = static_url(found, self.prefix)
                else:
                    del tag["data-related"]
        self.freeze_forms(soup)
        # A document without preview (Word, PowerPoint, Excel…): its extracted text is what
        # there is to read, so the demo shows it unfolded.
        if page and soup.select_one(".doc-body > .notice a[download]"):
            for details in soup.select(".doc-body > details"):
                details["open"] = ""
        if page:
            self.add_frame(soup, ref)
            if ref.path == "/search":
                self.add_search_note(soup, ref)
        compact(soup)
        return serialize(soup).replace(self.base, PUBLIC_URL)

    def freeze_forms(self, soup: BeautifulSoup) -> None:
        for form in soup.find_all("form"):
            action = form.get("action", "")
            if (form.get("method") or "get").lower() == "get" and urlsplit(action).path == "/search":
                form["action"] = f"{self.prefix}/search/"
                form["data-demo-search"] = ""
                continue
            form["data-demo-off"] = ""
            for attr in ("action", "method", "enctype"):
                if attr in form.attrs:
                    del form[attr]
            for control in form.find_all(["input", "button", "select", "textarea", "fieldset"]):
                if control.has_attr("data-theme-option"):
                    continue
                if control.name == "input" and control.get("type") == "hidden":
                    continue
                disable(control)
        for control in soup.find_all(["button", "input"]):
            kind = (control.get("type") or ("submit" if control.name == "button" else "text")).lower()
            in_search = control.find_parent("form", attrs={"data-demo-search": True})
            if kind in ("submit", "image", "reset") and not control.has_attr("disabled") and not in_search:
                disable(control)

    def add_frame(self, soup: BeautifulSoup, ref: Ref) -> None:
        head, body = soup.head, soup.body
        if head is None or body is None:
            raise RuntimeError(f"no head or body in {ref.url}")
        csp = soup.new_tag("meta", attrs={"http-equiv": "Content-Security-Policy", "content": CSP})
        robots = soup.new_tag("meta", attrs={"name": "robots", "content": "noindex"})
        charset = head.find("meta", attrs={"charset": True})
        if charset:
            charset.insert_after(csp)
        else:
            head.insert(0, csp)
        csp.insert_after(robots)
        script = soup.new_tag("script", attrs={"src": f"{ASSETS}/demo.js"})
        first_script = head.find("script")
        if first_script:
            first_script.insert_before(script)
        else:
            head.append(script)
        head.append(soup.new_tag("link", attrs={"rel": "stylesheet", "href": f"{ASSETS}/demo.css"}))
        self.insert_banner(body, ref)
        body["class"] = [*body.get("class", []), "demo-static"]

    def insert_banner(self, body: Tag, ref: Ref) -> None:
        # The banner comes right after the application's skip link: that link stays the first
        # thing the keyboard reaches.
        banner = BeautifulSoup(self.banner(ref), "html.parser")
        skip = body.find("a", class_="skip-link")
        if skip is not None:
            skip.insert_after(banner)
        else:
            body.insert(0, banner)
        # Phones: the banner has no room for the theme switch and the legal notice; they go at
        # the bottom of the navigation drawer (shown by demo.css on narrow screens only).
        footer = body.find(class_="sidebar-footer")
        if footer is not None:
            footer.insert(0, BeautifulSoup(self.drawer_tools(), "html.parser"))

    def theme_switch(self, extra_class: str) -> str:
        """The application's theme buttons (enabled and bound by its preferences.js)."""
        t = self.t
        buttons = "".join(
            f'<button type="button" data-theme-option="{value}" aria-pressed="false" '
            f'title="{label}" aria-label="{label}" disabled>{svg(icon)}</button>'
            for value, label, icon in zip(
                ("light", "dark", "system"), t["themes"], ("sun", "moon", "monitor"), strict=True
            )
        )
        return f'<div class="segmented {extra_class}" role="group" aria-label="{t["appearance"]}">{buttons}</div>'

    def drawer_tools(self) -> str:
        legal_href, legal_label = self.t["legal"]
        return (
            f'<div class="demo-drawer-tools">{self.theme_switch("demo-theme")}'
            f'<a class="demo-drawer-legal" href="{legal_href}">{legal_label}</a></div>'
        )

    def banner(self, ref: Ref) -> str:
        t = self.t
        other, other_label, other_title = t["other"]
        twin_prefix = LANGS[other]["prefix"]
        twin = static_url(ref, twin_prefix) if ref in self.twins else f"{twin_prefix}/"
        if ref.path == "/unavailable":
            twin = f"{twin_prefix}{UNAVAILABLE}/"
        legal_href, legal_label = t["legal"]
        return (
            f'<div class="demo-banner" role="region" aria-label="{t["banner_label"]}" '
            f'data-flash="{t["flash"]}">'
            f'<p class="demo-banner-text"><strong>{t["banner_title"]}</strong>'
            f'<span class="demo-banner-long">{t["banner_text"]}</span> '
            f'<a href="{t["install"]}">{t["banner_link"]}</a></p>'
            f'<p class="demo-banner-flash" role="status" aria-live="polite"></p>'
            f'<div class="demo-banner-tools">'
            f'{self.theme_switch("demo-theme")}'
            f'<a class="demo-banner-legal" href="{legal_href}">{legal_label}</a>'
            f'<a class="demo-banner-lang" href="{twin}" hreflang="{other}" lang="{other}" '
            f'title="{other_title}">{other_label}</a>'
            f"</div></div>"
        )

    def query_links(self) -> str:
        return " ".join(
            f'<a class="badge badge-quiet" href="{self.prefix}/search/{quote(q)}/">{q}</a>'
            for q in QUERIES
        )

    def add_search_note(self, soup: BeautifulSoup, ref: Ref) -> None:
        form = soup.find("form", attrs={"data-demo-search": True})
        if form is None:
            raise RuntimeError("no search form on the search page")
        mapping = {q: f"{self.prefix}/search/{quote(q)}/" for q in QUERIES}
        form["data-demo-queries"] = json.dumps(mapping)
        note = BeautifulSoup(
            f'<div class="notice demo-search-note" data-demo-search-note '
            f'data-miss="{self.t["search_miss"]}"><p data-demo-search-text>{self.t["search_note"]}</p>'
            f'<p class="demo-search-queries">{self.query_links()}</p></div>',
            "html.parser",
        )
        form.insert_after(note)


def svg(name: str, size: int = 14) -> str:
    return (
        f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '
        f'focusable="false">{ICONS[name]}</svg>'
    )


def disable(control: Tag) -> None:
    control["disabled"] = ""
    control["aria-disabled"] = "true"
    for attr in ("required", "autofocus", "formaction"):
        if attr in control.attrs:
            del control[attr]


class Html5(HTMLFormatter):
    """Attributes in their original order, HTML5 void elements (<meta>, not <meta/>)."""

    def __init__(self) -> None:
        super().__init__(void_element_close_prefix=None, empty_attributes_are_booleans=True)

    def attributes(self, tag: Tag):  # noqa: ANN201 — bs4's signature
        return list(tag.attrs.items())


HTML5 = Html5()


def serialize(soup: BeautifulSoup) -> str:
    text = soup.decode(formatter=HTML5)
    return re.sub(r"^<!DOCTYPE html>", "<!doctype html>", text)


KEEP_SPACE = {"pre", "textarea", "code", "script", "style"}


def compact(soup: BeautifulSoup) -> None:
    """Blank runs between tags become one newline (not in pre, textarea, code)."""
    for text in list(soup.find_all(string=True)):
        if not isinstance(text, NavigableString) or text.strip():
            continue
        if any(parent.name in KEEP_SPACE for parent in text.parents if parent.name):
            continue
        if "\n" in text and text != "\n":
            text.replace_with("\n")


def unavailable_page(home_html: str, lang: str) -> str:
    """The "Not available in the static demo" page, in the frozen home page's frame."""
    t = LANGS[lang]
    soup = BeautifulSoup(home_html, "html.parser")
    if soup.title:
        soup.title.string = f"{t['unavailable_title']} · Synaptane"
    crumbs = soup.select_one("nav.topbar-crumbs")
    if crumbs:
        crumbs.clear()
        crumbs.append(BeautifulSoup(f'<span aria-current="page">{t["unavailable_title"]}</span>', "html.parser"))
    for current in soup.select("[aria-current]"):
        if not (crumbs and current in crumbs.descendants):
            del current["aria-current"]
    main = soup.select_one("main#content")
    if main is None:
        raise RuntimeError("no main#content in the home page")
    main.clear()
    main.append(
        BeautifulSoup(
            f'<header class="page-header"><div><h1>{t["unavailable_title"]}</h1></div></header>'
            f'<section class="card demo-unavailable"><p>{t["unavailable_text"]}</p>'
            f'<div class="actions"><a class="button button-primary" href="{t["install"]}">'
            f'{t["unavailable_install"]}</a><a class="button" href="{t["prefix"]}/">'
            f'{t["unavailable_back"]}</a></div></section>',
            "html.parser",
        )
    )
    banner_lang = soup.select_one(".demo-banner-lang")
    if banner_lang:
        banner_lang["href"] = f"{LANGS[t['other'][0]]['prefix']}{UNAVAILABLE}/"
    return serialize(soup)


# ---- Output -----------------------------------------------------------------------------------
def write(path: Path, data: bytes | str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        data = data.encode("utf-8")
    path.write_bytes(data)


def title_of(html: bytes) -> str:
    m = re.search(rb"<title>(.*?)</title>", html, re.S)
    return BeautifulSoup(m.group(1), "html.parser").get_text().strip() if m else ""


def app_commit(app: Path) -> tuple[str, bool]:
    def git(*args: str) -> str:
        return subprocess.run(["git", "-C", str(app), *args], capture_output=True, text=True).stdout.strip()

    return git("rev-parse", "HEAD"), bool(git("status", "--porcelain", "--untracked-files=no"))


def main() -> int:
    global APP_STATIC
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--app", type=Path, default=SITE.parent / "synaptane-public",
                        help="clone of synaptane/synaptane (default: ../synaptane-public)")
    parser.add_argument("--admin-url", default="postgresql://synaptane:synaptane@127.0.0.1:5433/postgres",
                        help="PostgreSQL (with pgvector) URL of a role allowed to create databases")
    parser.add_argument("--db-name", default="synaptane_staticdemo",
                        help="throwaway database, created then dropped (name must contain 'staticdemo')")
    args = parser.parse_args()
    if shutil.which("tesseract") is None:
        # The scanned delivery note and the rack image of the data set are searchable through
        # OCR: without it, their extracted text and the "kestrel" search would be missing.
        log("tesseract not found: install tesseract-ocr (eng, fra), see README.md")
        return 1
    if any(shutil.which(tool) is None for tool in ("catdoc", "xls2csv", "catppt")):
        # The 2019 inventory of the data set is an old .xls file, read by catdoc: without it,
        # its extracted text and the "netware" search would be missing.
        log("catdoc not found: install catdoc, see README.md")
        return 1
    app = args.app.resolve()
    APP_STATIC = app / "src" / "synaptane" / "web" / "static"
    public = SITE / "public"

    instance = Instance(app, args.admin_url, args.db_name)
    try:
        instance.setup()
        instance.serve()
        client = instance.client()
        enable_routine(client)
        rules = Rules(instance.life_shas, instance.life_paths)
        crawls: dict[str, Crawl] = {}
        for lang in LANGS:
            instance.set_locale(lang)
            crawls[lang] = crawl(client, rules, lang)
        client.close()
        base = instance.base
    finally:
        instance.close()

    # Output: wiped and rewritten.
    for lang, t in LANGS.items():
        shutil.rmtree(public / t["prefix"].lstrip("/"), ignore_errors=True)
    pages_by_lang = {lang: {r for r, body in c.found.items() if r.kind == "page" and body} for lang, c in crawls.items()}
    manifest_pages: dict[str, dict] = {}
    for lang, result in crawls.items():
        t = LANGS[lang]
        other = t["other"][0]
        rewriter = Rewriter(rules, result, lang, base, pages_by_lang[lang] & pages_by_lang[other])
        home = None
        for ref, body in result.found.items():
            if body is None:
                continue
            url = static_url(ref, t["prefix"])
            if ref.kind == "asset":
                if url.startswith("/fonts/"):
                    continue
                data: bytes | str = body
                if ref.path.endswith(".css"):
                    data = rewrite_css(body.decode("utf-8"), t["prefix"])
                write(file_of(url, public), data)
                continue
            if ref.kind == "file":
                data = body.decode("utf-8").replace(base, PUBLIC_URL) if is_text(ref, result) else body
                if isinstance(data, str) and ref.path.lower().endswith(HTML_FILES):
                    data = document_html(data)
                write(file_of(url, public), data)
                continue
            html = rewriter.rewrite(body.decode("utf-8"), ref)
            write(file_of(url, public), html)
            if ref.kind == "page":
                entry = manifest_pages.setdefault(ref.url, {"source": ref.url})
                entry[lang] = url
                entry[f"title_{lang}"] = title_of(body)
                if ref.path == "/":
                    home = html
        if home is None:
            raise RuntimeError("the home page was not frozen")
        write(file_of(f"{t['prefix']}{UNAVAILABLE}/", public), unavailable_page(home, lang))
        log(f"{lang}: {len(pages_by_lang[lang])} pages written under public{t['prefix']}/")

    for name in ("demo.js", "demo.css"):
        shutil.copyfile(HERE / name, public / ASSETS.lstrip("/") / name)
    commit, dirty = app_commit(app)
    manifest = {
        "description": "Static demo of Synaptane, generated by scripts/build-demo (do not edit by hand).",
        "synaptane": {
            "version": importlib.metadata.version("synaptane"),
            "commit": commit,
            "dirty": dirty,
        },
        "generated": date.today().isoformat(),
        "dataset": "examples/acme-wiki (fictional) + scripts/build-demo/life.py",
        "languages": {lang: t["prefix"] + "/" for lang, t in LANGS.items()},
        "public_url_shown": PUBLIC_URL,
        "queries": QUERIES,
        "unavailable": {lang: f"{t['prefix']}{UNAVAILABLE}/" for lang, t in LANGS.items()},
        "pages": sorted(manifest_pages.values(), key=lambda p: p["source"]),
    }
    write(public / "demo" / "app" / "MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    log(f"manifest: {len(manifest_pages)} pages")
    return check_demo.main(["--public", str(public)])


def document_html(html: str) -> str:
    """An HTML file of the wiki, frozen: the application's policy for raw files, noindex."""
    soup = BeautifulSoup(html, "html.parser")
    if soup.head is None:
        raise RuntimeError("an HTML file of the demo wiki has no <head>")
    for meta in soup.head.find_all("meta", attrs={"http-equiv": True}):
        meta.decompose()
    tags = [
        soup.new_tag("meta", attrs={"http-equiv": "Content-Security-Policy", "content": DOCUMENT_CSP}),
        soup.new_tag("meta", attrs={"name": "robots", "content": "noindex"}),
    ]
    anchor = soup.head.find("meta", attrs={"charset": True})
    for tag in reversed(tags):
        if anchor:
            anchor.insert_after(tag)
        else:
            soup.head.insert(0, tag)
    return serialize(soup)


def is_text(ref: Ref, result: Crawl) -> bool:
    kind = result.content_type.get(ref, "")
    return kind.startswith("text/") or "markdown" in kind or "csv" in kind


def rewrite_css(css: str, prefix: str) -> str:
    def repl(m: re.Match[str]) -> str:
        ref = Ref("asset", m.group(1))
        return f"url({static_url(ref, prefix)})"

    return re.sub(r"url\((/static/[^)\"']+)\)", repl, css)


def enable_routine(client) -> None:
    """Adds the first routine template (as in the README screenshots): shown, never run."""
    page = client.get(f"{SPACE_BASE}/-/routines")
    soup = BeautifulSoup(page.text, "html.parser")
    form = soup.find("form", action=re.compile(r"/-/routines/from/"))
    if form is None:
        log("warning: no routine template to enable")
        return
    csrf = form.find("input", attrs={"name": "csrf"})["value"]
    response = client.post(form["action"], data={"csrf": csrf}, headers={"Origin": str(client.base_url).rstrip("/")})
    if response.status_code not in (200, 303):
        log(f"warning: routine not enabled ({response.status_code})")


if __name__ == "__main__":
    sys.exit(main())
