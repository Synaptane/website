"""A throwaway Synaptane instance for the static demo.

Dedicated database (created, then dropped), temporary data folder, `file://` repositories
allowed, `synaptane init`, `db upgrade`, `synaptane demo`, a few fictional commits (life.py),
then `synaptane serve` on a free port. `close()` stops the server, drops the database and
deletes the folder, whatever happened before.
"""

import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx
import psycopg
from psycopg import sql

import life

DEMO_USER = "demo"
ORG, SPACE = "acme", "it"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def log(message: str) -> None:
    print(f"[build-demo] {message}", flush=True)


def identity(name: str, email: str, stamp: str) -> dict[str, str]:
    return {
        "GIT_AUTHOR_NAME": name,
        "GIT_AUTHOR_EMAIL": email,
        "GIT_AUTHOR_DATE": stamp,
        "GIT_COMMITTER_NAME": name,
        "GIT_COMMITTER_EMAIL": email,
        "GIT_COMMITTER_DATE": stamp,
    }


class Instance:
    def __init__(self, app: Path, admin_url: str, db_name: str) -> None:
        if "staticdemo" not in db_name:
            raise SystemExit("the database name must contain 'staticdemo' (it is dropped at the end)")
        self.app = app
        self.admin_url = admin_url
        self.db_name = db_name
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.dir = Path(tempfile.mkdtemp(prefix="synaptane-staticdemo-"))
        self.config = self.dir / "synaptane.toml"
        self.password = secrets.token_urlsafe(18)
        self.server: subprocess.Popen[bytes] | None = None
        self.db_created = False
        parts = urlsplit(admin_url)
        self.database_url = urlunsplit(
            ("postgresql+psycopg", parts.netloc, f"/{db_name}", "", "")
        )
        self.life_shas: list[str] = []
        self.life_paths: set[str] = set()

    # ---- processes ---------------------------------------------------------------------------
    def env(self) -> dict[str, str]:
        # Nothing from the caller's Synaptane or AI configuration: only this instance.
        env = {
            k: v
            for k, v in os.environ.items()
            if not k.startswith(("SYNAPTANE_", "ANTHROPIC_", "OPENAI_", "MISTRAL_"))
        }
        env |= {
            "SYNAPTANE_CONFIG": str(self.config),
            "SYNAPTANE_ALLOW_LOCAL_REPOS": "true",
            "SYNAPTANE_DEMO_PASSWORD": self.password,
            "TZ": "Europe/Paris",
        }
        return env

    def run(self, *args: str) -> str:
        cmd = [sys.executable, "-m", "synaptane", *args]
        done = subprocess.run(
            cmd, env=self.env(), cwd=self.dir, capture_output=True, text=True, timeout=600
        )
        if done.returncode != 0:
            raise RuntimeError(f"synaptane {' '.join(args)} failed:\n{done.stdout}\n{done.stderr}")
        return done.stdout

    # ---- database ----------------------------------------------------------------------------
    def _admin(self) -> psycopg.Connection:
        return psycopg.connect(self.admin_url, autocommit=True)

    def create_database(self) -> None:
        with self._admin() as conn:
            exists = conn.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (self.db_name,)
            ).fetchone()
            if exists:
                log(f"database {self.db_name} left by an earlier run: dropped")
                conn.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(self.db_name)))
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(self.db_name)))
        self.db_created = True

    def drop_database(self) -> None:
        if not self.db_created:
            return
        with self._admin() as conn:
            conn.execute(
                sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(self.db_name))
            )
        self.db_created = False

    def set_locale(self, locale: str) -> None:
        """Language of the demo account (it takes precedence over cookie and browser)."""
        url = urlunsplit(("postgresql", urlsplit(self.admin_url).netloc, f"/{self.db_name}", "", ""))
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute("UPDATE users SET locale = %s WHERE username = %s", (locale, DEMO_USER))

    # ---- setup -------------------------------------------------------------------------------
    def setup(self) -> None:
        log(f"instance in {self.dir}, database {self.db_name}, port {self.port}")
        self.create_database()
        self.run(
            "init",
            "--database-url", self.database_url,
            "--data-dir", str(self.dir / "data"),
            "--public-url", self.base,
        )
        self.run("db", "upgrade")
        # The demo repository is prepared here, with dates: `synaptane demo` keeps an existing
        # one, then creates the account, the organization and the space, syncs and indexes.
        self.seed()
        self.add_life()
        self.run("demo", "--source", str(self.dataset))

    def git(self, cwd: Path, *args: str, env: dict[str, str] | None = None) -> str:
        base = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(self.dir),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "LANG": "C",
        }
        done = subprocess.run(
            ["git", *args], cwd=cwd, env=base | (env or {}), capture_output=True, text=True, timeout=120
        )
        if done.returncode != 0:
            raise RuntimeError(f"git {' '.join(args)}: {done.stderr}")
        return done.stdout

    @property
    def dataset(self) -> Path:
        return self.app / "examples" / "acme-wiki"

    @property
    def bare(self) -> Path:
        return self.dir / "data" / "demo" / "acme-it.git"

    @property
    def work(self) -> Path:
        return self.dir / "life"

    def seed(self) -> None:
        """The data set in one commit, as `synaptane demo` does, but dated before the life."""
        from synaptane.services import demo  # the application's own rules for the data set

        self.bare.parent.mkdir(parents=True)
        self.git(self.dir, "init", "--quiet", "--bare", "-b", demo.BRANCH, str(self.bare))
        self.git(self.dir, "clone", "--quiet", self.bare.as_uri(), str(self.work))
        for name, data in demo.dataset_files(self.dataset).items():
            target = self.work / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        day = date.today() - timedelta(days=life.IMPORT_DAYS_AGO)
        self.git(self.work, "add", "--all")
        self.git(self.work, "commit", "--quiet", "-m", demo.COMMIT_MESSAGE,
                 env=identity(demo.AUTHOR.name, demo.AUTHOR.email, f"{day.isoformat()}T09:00:00+02:00"))
        self.git(self.work, "push", "--quiet", "origin", f"HEAD:{demo.BRANCH}")

    def add_life(self) -> None:
        work = self.work
        for day, change in life.changes(date.today()):
            page = work / "content" / change.path
            text = page.read_text(encoding="utf-8")
            new = change.edit(text)
            if new is None or new == text:
                log(f"warning: life commit skipped (the page changed): {change.message}")
                continue
            page.write_text(new, encoding="utf-8")
            who = identity(change.author, change.email, f"{day.isoformat()}T{change.hour}:00+02:00")
            self.git(work, "add", "--", f"content/{change.path}")
            self.git(work, "commit", "--quiet", "-m", change.message, env=who)
            self.life_shas.append(self.git(work, "rev-parse", "HEAD").strip())
            self.life_paths.add(change.path)
        self.git(work, "push", "--quiet", "origin", "HEAD:main")
        log(f"{len(self.life_shas)} fictional commits added")

    # ---- server ------------------------------------------------------------------------------
    def serve(self) -> None:
        self.server = subprocess.Popen(
            [sys.executable, "-m", "synaptane", "serve", "--port", str(self.port)],
            env=self.env(),
            cwd=self.dir,
            stdout=subprocess.DEVNULL,
            stderr=open(self.dir / "serve.log", "wb"),  # noqa: SIM115 — closed with the folder
            start_new_session=True,
        )
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if self.server.poll() is not None:
                raise RuntimeError("synaptane serve stopped:\n" + (self.dir / "serve.log").read_text())
            try:
                if httpx.get(f"{self.base}/readyz", timeout=2).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.5)
        raise RuntimeError("synaptane serve did not answer within 60 s")

    def client(self) -> httpx.Client:
        """A client signed in as the demo account."""
        client = httpx.Client(base_url=self.base, timeout=60, follow_redirects=False)
        response = client.post(
            "/login",
            data={"username": DEMO_USER, "password": self.password, "next": "/"},
            headers={"Origin": self.base},
        )
        if response.status_code != 303:
            raise RuntimeError(f"sign-in failed ({response.status_code})")
        return client

    def close(self) -> None:
        if self.server and self.server.poll() is None:
            os.killpg(self.server.pid, signal.SIGTERM)
            try:
                self.server.wait(15)
            except subprocess.TimeoutExpired:
                os.killpg(self.server.pid, signal.SIGKILL)
                self.server.wait(5)
        try:
            self.drop_database()
        finally:
            shutil.rmtree(self.dir, ignore_errors=True)
        log("instance stopped, database dropped, data folder deleted")
