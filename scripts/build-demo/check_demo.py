#!/usr/bin/env python3
"""Checks the static demo (public/demo/app/, public/fr/demo/app/). Standard library only: runs
without the application, in CI too (`npm run check-demo`).

- Links: every address of a demo page under /demo/app/ or /fr/demo/app/ (href, src,
  data-tree, data-related, form action) leads to a generated file; page URLs end with a slash.
  The site's own pages (/docs/…, /fonts/…) are checked by check-links after the build.
- Nothing calls a server: no external script, stylesheet, image or frame; no inline script,
  inline style or event attribute (the pages carry a strict Content-Security-Policy).
- HTML files of the wiki (under /raw/, shown in a sandboxed frame): their own styles are
  allowed, but no script, no event attribute, and a policy that forbids everything else.
- Read-only: every form but search is marked data-demo-off and all its controls are
  disabled; every submit button anywhere is disabled.
- No secret or local trace: CSRF token, session cookie, Bearer token, API key (sk-…),
  localhost / 127.0.0.1, local paths, file:// URLs, and e-mail addresses other than the
  fictional ones of the data set (*.example, *.internal).

Usage: python3 scripts/build-demo/check_demo.py [--public public]
Exit code 1 with the list of problems.
"""

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

PREFIXES = ("/demo/app/", "/fr/demo/app/")
ALLOWED_EMAIL = re.compile(r"@([a-z0-9-]+\.)*([a-z0-9-]+\.example|acme\.internal|example\.(com|org|net))$", re.I)
FORBIDDEN = [
    (re.compile(r"csrf", re.I), "CSRF field or token"),
    (re.compile(r"synaptane_session|synaptane_lang"), "session or language cookie name"),
    (re.compile(r"Bearer\s+(?!…|\.\.\.|&lt;|<)[A-Za-z0-9._~+/-]{12,}"), "Bearer token"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{8,}"), "API key (sk-…)"),
    (re.compile(r"\b(syn|stk|sat)_[A-Za-z0-9_-]{16,}"), "Synaptane token"),
    (re.compile(r"localhost", re.I), "localhost"),
    (re.compile(r"127\.0\.0\.1|0\.0\.0\.0"), "local address"),
    (re.compile(r"file://"), "file:// URL"),
    (re.compile(r"/tmp/|/home/|synaptane-staticdemo-"), "local path"),
    (re.compile(r"name=[\"']?(token|password|api_key|secret)[\"' >]", re.I), "secret field"),
]
# Policy of the wiki's HTML files (build_demo.py writes it into them).
DOCUMENT_CSP = (
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; "
    "form-action 'none'"
)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")


class Page(HTMLParser):
    def __init__(self, document: bool = False) -> None:
        super().__init__(convert_charrefs=True)
        self.document = document  # an HTML file of the wiki: inline styles allowed
        self.urls: list[tuple[str, str, str]] = []  # (tag, attr, value)
        self.problems: list[str] = []
        self.forms: list[dict] = []  # stack of open forms
        self.in_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        for k in a:
            if k.startswith("on"):
                self.problems.append(f"event attribute {k} on <{tag}>")
        if "style" in a and not self.document:
            self.problems.append(f"inline style on <{tag}>")
        if tag == "script":
            if "src" not in a:
                self.problems.append("inline script")
            self.in_script = True
        for attr in ("href", "src", "data-tree", "data-related", "action", "srcset", "poster"):
            if attr in a:
                self.urls.append((tag, attr, a[attr]))
        if tag == "form":
            search = "data-demo-search" in a
            if not search and "data-demo-off" not in a:
                self.problems.append("form not frozen (no data-demo-off)")
            if not search and ("action" in a or "method" in a):
                self.problems.append("frozen form keeps an action or method")
            self.forms.append({"search": search})
        if tag in ("input", "button", "select", "textarea", "fieldset"):
            kind = a.get("type", "submit" if tag == "button" else "text").lower()
            frozen = "disabled" in a and a.get("aria-disabled") == "true"
            in_frozen_form = bool(self.forms) and not self.forms[-1]["search"]
            exempt = "data-theme-option" in a or kind == "hidden"
            if in_frozen_form and not exempt and not frozen:
                self.problems.append(f"active <{tag} type={kind}> in a frozen form")
            if kind in ("submit", "image", "reset") and not frozen and not (self.forms and self.forms[-1]["search"]):
                self.problems.append(f"active submit <{tag}>")

    def handle_endtag(self, tag: str) -> None:
        if tag == "form" and self.forms:
            self.forms.pop()
        if tag == "script":
            self.in_script = False


def resolve(public: Path, url: str) -> str | None:
    """Problem with a demo address, or None."""
    path = unquote(urlsplit(url).path)
    local = public / path.lstrip("/")
    if path.endswith("/"):
        return None if (local / "index.html").is_file() else "not found"
    if local.is_file():
        return None
    if (local / "index.html").is_file():
        return "missing trailing slash"
    return "not found"


def check(public: Path) -> list[str]:
    problems: list[str] = []
    roots = [public / p.strip("/") for p in PREFIXES]
    files = [f for root in roots if root.is_dir() for f in sorted(root.rglob("*")) if f.is_file()]
    if not files:
        return [f"no demo under {public}: run scripts/build-demo/build.sh"]
    pages = 0
    for file in files:
        rel = "/" + file.relative_to(public).as_posix()
        text_like = file.suffix in (".html", ".css", ".js", ".json", ".md", ".csv", ".txt", ".svg")
        if not text_like:
            continue
        text = file.read_text(encoding="utf-8", errors="replace")
        if file.name == "MANIFEST.json":
            continue
        for pattern, label in FORBIDDEN:
            if label.startswith("CSRF") and rel.endswith("/static/preferences.js"):
                continue  # the application's script names the field it never stores
            if m := pattern.search(text):
                around = text[max(m.start() - 40, 0) : m.end() + 40].replace("\n", " ")
                problems.append(f"{rel}: {label}: …{around}…")
        for m in EMAIL.finditer(text):
            if not ALLOWED_EMAIL.search(m.group(0)):
                problems.append(f"{rel}: e-mail address {m.group(0)}")
        if file.suffix != ".html":
            continue
        pages += 1
        document = "/raw/" in rel
        parser = Page(document)
        parser.feed(text)
        problems += [f"{rel}: {p}" for p in parser.problems]
        if document and f'content="{DOCUMENT_CSP}"' not in text:
            problems.append(f"{rel}: HTML file without its Content-Security-Policy")
        is_page = "<html" in text[:300] and not document
        if is_page and 'http-equiv="Content-Security-Policy"' not in text:
            problems.append(f"{rel}: no Content-Security-Policy")
        if is_page and 'class="demo-banner"' not in text:
            problems.append(f"{rel}: no demo banner")
        for tag, attr, value in parser.urls:
            parts = urlsplit(value)
            if parts.scheme in ("http", "https") or value.startswith("//"):
                if tag != "a":
                    problems.append(f"{rel}: external resource <{tag} {attr}={value}>")
                continue
            if parts.scheme in ("mailto", "tel"):
                continue
            if parts.scheme:
                problems.append(f"{rel}: {parts.scheme}: URL in <{tag} {attr}>")
                continue
            if not value or value.startswith("#"):
                continue
            if not value.startswith("/"):
                problems.append(f"{rel}: relative address <{tag} {attr}={value}>")
                continue
            if value.startswith(PREFIXES):
                if problem := resolve(public, value):
                    problems.append(f"{rel}: <{tag} {attr}={value}>: {problem}")
            elif tag != "a" and not value.startswith(("/fonts/", "/favicon")):
                problems.append(f"{rel}: resource outside the demo <{tag} {attr}={value}>")
    if not problems:
        print(f"Static demo OK: {pages} HTML files, {len(files)} files, no secret, links valid.")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Checks the static demo.")
    parser.add_argument("--public", type=Path, default=Path(__file__).resolve().parents[2] / "public")
    args = parser.parse_args(argv)
    problems = check(args.public.resolve())
    if problems:
        for p in problems[:200]:
            print(f"  ✗ {p}", file=sys.stderr)
        print(f"\n{len(problems)} problem(s) in the static demo.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
