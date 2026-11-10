"""Last night's tidy-up run, replayed in the throwaway instance without any AI.

Run by instance.py in the application's environment, with the instance's configuration
(`SYNAPTANE_CONFIG`), once `synaptane demo` has loaded the space:

1. The organization gets an AI setting, as an administrator would enter it (life.TIDY_PROVIDER,
   TIDY_MODEL), with a placeholder key: the tidy-up page then shows a configured instance.
2. The application's own scheduled run (`tidy.run`, trigger "schedule") goes over the inbox. The
   only thing replaced is the model: instead of a provider, a conversation that answers with the
   tool calls written in life.TIDY_RUN. Everything else is the application's code: the tools read
   and write the wiki, the end-of-run check, the single commit in the name of the tidy-up agent,
   the notes removed from the inbox or left with their reason, the log, the operations, the
   quality measures, the cost of the tokens declared for each turn. No provider is ever opened.
3. The clock of that run is set to last night (life.tidy_start), for its log and its commit.
4. The worker's follow-up (synchronization, indexing) is done here, as `synaptane worker` would.
5. Two notes are then dropped (life.NEW_NOTES), as the application writes them, dated between
   the run and the build: they wait for the next run.

Prints, on its last line, `TIDY_REPLAY {json}`: the run, its commit and the notes' commits.
The plan is checked against the wiki first, and the run's outcome afterwards: when the data set
no longer fits life.TIDY_RUN, the build stops with the reason.
"""

import json
import re
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select

import life
from synaptane.ai import providers
from synaptane.ai.base import AIConfig, ToolCall, ToolResult, ToolSpec, Turn
from synaptane.config import load_settings
from synaptane.git.repo import Identity, Repository
from synaptane.server import load_secret_box
from synaptane.services import accounts, ai_settings, git_sync, load_actor, tidy
from synaptane.services.deposits import list_items
from synaptane.services.extraction import update_index
from synaptane.services.inbox import CONTENT_DIR, attachments_dir, note_item
from synaptane.services.tidy_tools import Op
from synaptane.services.workspace import Workspace, trailers
from synaptane.storage.db import Database
from synaptane.storage.models import Job, Organization, Space, TidyRun

ORG, SPACE, USER = "acme", "it", "demo"


class Clock:
    """The replay's time (None: the real one), for the run's log and the Git commits."""

    at: datetime | None = None


class Frozen(datetime):
    @classmethod
    def now(cls, tz=None):  # noqa: ANN001, ANN206 — datetime's signature
        if Clock.at is None:
            return datetime.now(tz)
        return Clock.at.astimezone(tz) if tz else Clock.at.astimezone(UTC).replace(tzinfo=None)


_git_env = Repository._env


def _dated_env(self: Repository, author: Identity | None = None) -> dict[str, str]:
    env = _git_env(self, author)
    if Clock.at is not None:
        stamp = Clock.at.isoformat(timespec="seconds")
        env |= {"GIT_AUTHOR_DATE": stamp, "GIT_COMMITTER_DATE": stamp}
    return env


def _no_provider(*_: object, **__: object) -> None:
    raise RuntimeError("the replay must never open an AI provider")


Repository._env = _dated_env  # type: ignore[method-assign]
tidy.datetime = Frozen  # type: ignore[misc]  # the run's log, the left notes, its first message
providers.open_conversation = _no_provider  # type: ignore[assignment]


def fail(problem: str) -> None:
    raise SystemExit(f"tidy-up replay: {problem}. Update TIDY_RUN in scripts/build-demo/life.py.")


ITEM = re.compile(r"\{item:(.+)\}")


def resolve(value: Any, names: dict[str, str]) -> Any:
    """Arguments with the notes' file names in place of `life.item(title)`."""
    if isinstance(value, str) and (m := ITEM.fullmatch(value)):
        if m.group(1) not in names:
            fail(f"no inbox note titled {m.group(1)!r}")
        return names[m.group(1)]
    if isinstance(value, (list, tuple)):
        return type(value)(resolve(v, names) for v in value)
    if isinstance(value, dict):
        return {k: resolve(v, names) for k, v in value.items()}
    return value


def check_plan(repo: Repository, turns: list[life.Turn]) -> None:
    """The plan still fits the wiki: pages read or edited exist, each `old` text appears once,
    new files do not exist yet (otherwise the run would end differently, or fail)."""
    pages: dict[str, str | None] = {}

    def text(path: str) -> str | None:
        if path not in pages:
            data = repo.blob(f"{CONTENT_DIR}/{path}")
            pages[path] = data.decode("utf-8") if data is not None else None
        return pages[path]

    for turn in turns:
        for name, args in turn.calls:
            path = args.get("path", "")
            if name in ("read_page", "edit_page", "backlinks") and text(path) is None:
                fail(f"{name}: no page {path}")
            if name == "edit_page":
                found = text(path) or ""
                if found.count(args["old"]) != 1:
                    fail(f"edit_page {path}: the text to replace is no longer there exactly once")
                pages[path] = found.replace(args["old"], args["new"], 1)
            if name == "append_page":
                pages[path] = (text(path) or "") + args["content"]
            if name in ("write_page", "file_attachment"):
                if text(path) is not None:
                    fail(f"{name}: {path} already exists")
                pages[path] = args.get("content", "")


class Replay:
    """The model's side of the run: the turns of life.TIDY_RUN, in order. Keeps the tools'
    answers, to check that none failed."""

    def __init__(self, turns: list[life.Turn], names: dict[str, str], start: datetime) -> None:
        self.turns = [(resolve(t.calls, names), t.tokens) for t in turns]
        self.start = start
        self.index = 0
        self.results: list[ToolResult] = []
        self.nudges: list[str] = []

    def factory(self, config: AIConfig, system: str, first: str, tools: list[ToolSpec]) -> "Replay":
        return self

    def step(self) -> Turn:
        # The run's time goes by, turn after turn, up to TIDY_SECONDS.
        share = (self.index + 1) / len(self.turns)
        Clock.at = self.start + timedelta(seconds=round(4 + (life.TIDY_SECONDS - 6) * share))
        if self.index >= len(self.turns):
            return Turn("", [], "end")
        calls, (fresh, cached, output) = self.turns[self.index]
        self.index += 1
        return Turn(
            "",
            [ToolCall(f"toolu_{self.index:02d}{n:02d}", name, args) for n, (name, args) in enumerate(calls)],
            "tool_use",
            input_tokens=fresh,
            output_tokens=output,
            cached_tokens=cached,
        )

    def reply(self, results: list[ToolResult]) -> None:
        self.results.extend(results)

    def nudge(self, text: str) -> None:
        self.nudges.append(text)


def follow_up(database: Database, ws: Workspace, space_id: Any) -> None:
    """What the worker does after a commit: synchronization (push), then indexing."""
    git_sync.run_sync(database, ws, space_id)
    with database.session() as session:
        space = session.get(Space, space_id)
        assert space is not None
        repo = ws.local_repository(space)
        session.execute(
            delete(Job).where(
                Job.space_id == space_id, Job.kind.in_(("sync", "index")), Job.status == "queued"
            )
        )
    update_index(ws, space_id, repo)


def main() -> int:
    settings = load_settings()
    database = Database(settings.database_url)
    ws = Workspace.from_settings(settings, load_secret_box(settings))
    now = datetime.now(UTC)
    start = life.tidy_start(now).astimezone(UTC)
    try:
        with database.session() as session:
            actor = load_actor(session, accounts.get_user(session, USER))
            org = session.scalar(select(Organization).where(Organization.slug == ORG))
            assert org is not None
            space = session.scalar(select(Space).where(Space.org_id == org.id, Space.slug == SPACE))
            assert space is not None
            space_id = space.id
            ai_settings.configure(
                session, actor, ws.box, org,
                provider=life.TIDY_PROVIDER, model=life.TIDY_MODEL, api_key=life.TIDY_KEY,
            )
            repo = ws.local_repository(space)
            names = {i.title: i.name for i in list_items(tidy.system_reader(space), ws, space)}
        check_plan(repo, life.TIDY_RUN)
        replay = Replay(life.TIDY_RUN, names, start)

        Clock.at = start
        record = tidy.run(database, ws, space_id, trigger="schedule", factory=replay.factory)
        errors = [r.content for r in replay.results if r.is_error]
        if record is None or record.status != "done" or not record.commit:
            fail(f"the run did not complete ({record.status if record else 'nothing to do'}: "
                 f"{record.error if record else ''})")
        if errors or replay.nudges or replay.index != len(replay.turns):
            fail(f"tool errors {errors[:3]}, nudges {replay.nudges[:1]}, "
                 f"{replay.index} of {len(replay.turns)} turns played")
        if (record.items_done, record.items_left) != (life.TIDY_FILED, life.TIDY_LEFT):
            fail(f"{record.items_done} filed and {record.items_left} left, "
                 f"{life.TIDY_FILED} and {life.TIDY_LEFT} expected")
        if attention := [op for op in record.operations if op.get("op") == Op.ATTENTION]:
            fail(f"the end-of-run check found problems: {attention[:3]}")
        with database.session() as session:
            found = session.get(TidyRun, record.id)
            space = session.get(Space, space_id)
            assert found is not None and space is not None
            found.started_at = start
            space.tidy_last_date = life.tidy_start(now).date()
        Clock.at = None
        follow_up(database, ws, space_id)

        commits = [record.commit]
        with database.session() as session:
            space = session.get(Space, space_id)
            assert space is not None
            repo = ws.local_repository(space)
        for note in life.NEW_NOTES:
            Clock.at = start + (now - start) * note.share
            author = Identity(note.author, note.email)
            path, data = note_item(
                author, note.source, note.title, note.body, note.hint, list(note.attachments),
                Clock.at, via=note.via, origin=note.origin,
            )
            files: dict[str, bytes | None] = {path: data}
            files |= {f"{attachments_dir(path)}/{n}": b for n, b in note.attachments.items()}
            sha = repo.commit_changes(files, author, f"Inbox: {note.title}" + trailers(note.source, note.via))
            if sha:
                commits.append(sha)
        Clock.at = None
        follow_up(database, ws, space_id)
    finally:
        database.dispose()
    print("TIDY_REPLAY " + json.dumps({"run": str(record.id), "commits": commits}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
