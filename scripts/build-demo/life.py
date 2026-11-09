"""A little fictional life for the demo wiki: a few commits by the people of the Acme data set,
last night's tidy-up run, and two notes dropped since.

The demo data set is imported in one commit ("Acme IT wiki: demo data"). These commits give the
history, diff and activity pages something to show, and re-verify one page, as a team would.
Dates are relative to the build day. Each edit is skipped (with a warning) when the page no
longer has the expected text, so a change of the data set never breaks the build.

The tidy-up run (`TIDY_RUN`) is the model's side of a nightly run over the six notes of the data
set, written in advance: `tidy_replay.py` plays it through the application's own tidy-up code,
which runs the tools, commits, logs the run and closes the notes, as with a real model. Unlike
the commits above, it must fit the data set: when it no longer does, the build stops.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

IMPORT_DAYS_AGO = 14  # the data set is imported two weeks before the build

Edit = Callable[[str], str | None]  # new text, or None if the page no longer fits


@dataclass(frozen=True)
class Change:
    days_ago: int
    hour: str  # HH:MM, local time of the fictional author (Europe/Paris)
    author: str
    email: str
    path: str  # under content/
    message: str
    edit: Edit


def _insert_after(anchor: str, addition: str) -> Edit:
    def edit(text: str) -> str | None:
        if anchor not in text or addition.strip() in text:
            return None
        return text.replace(anchor, anchor + addition, 1)

    return edit


def _replace(old: str, new: str) -> Edit:
    def edit(text: str) -> str | None:
        return text.replace(old, new, 1) if old in text else None

    return edit


def _chain(*edits: Edit) -> Edit:
    def edit(text: str) -> str | None:
        for step in edits:
            changed = step(text)
            if changed is None:
                return None
            text = changed
        return text

    return edit


def _append(addition: str) -> Edit:
    def edit(text: str) -> str | None:
        if addition.strip() in text:
            return None
        return text.rstrip("\n") + "\n" + addition

    return edit


def _verified_on(day: date) -> Edit:
    def edit(text: str) -> str | None:
        lines = text.split("\n")
        if not lines or lines[0] != "---":
            return None
        for i, line in enumerate(lines[1:], start=1):
            if line == "---":
                return None
            if line.startswith("verified:"):
                lines[i] = f"verified: {day.isoformat()}"
                return "\n".join(lines)
        return None

    return edit


RESTORE_INTRO = """
Use this procedure after a data loss, a failed update or a ransomware alert. Open a P1
[incident](incident.md) first, and warn the person [on call](../team/on-call.md).

## Recovery targets

| What | Source | Target time (RTO) | Max data loss (RPO) | Owner |
|---|---|---|---|---|
| Virtual machine | vzdump on the NAS | 30 minutes | 24 hours | Hugo Bernard |
| PostgreSQL database | pg_dump, off-site copy | 1 hour | 6 hours | Claire Martin |
| File share | NAS snapshot | 15 minutes | 1 hour | Malik Robert |
| GitLab | nightly GitLab backup | 2 hours | 24 hours | Hugo Bernard |

Schedules and retention are described in [Backups](../infra/backups.md).
"""

VPN_TROUBLESHOOTING = """
## Troubleshooting

- **The tunnel is up but nothing answers:** check that the profile still has `AllowedIPs`
  for the server VLAN (10.10.0.0/24, see [VLANs](../network/vlans.md)).
- **Connected at home, not at a hotel:** some networks block UDP. Use the TCP fallback profile.
- **Lost laptop:** revoke the profile at once, as for an [offboarding](../procedures/offboarding.md).
"""


def changes(today: date) -> list[tuple[date, Change]]:
    """The commits to add, oldest first, with their day."""
    plan = [
        Change(
            9, "10:12", "Malik Robert", "malik.robert@acme.example", "network/vlans.md",
            "VLANs: guest Wi-Fi VLAN",
            _chain(
                _insert_after(
                    "| 30 | phones | 10.30.0.0/24 |\n", "| 40 | guests (Wi-Fi) | 10.40.0.0/24 |\n"
                ),
                _append(
                    "\nThe guest VLAN only reaches the Internet: see [Wi-Fi](wifi.md) and the\n"
                    "[firewall rules](firewall.md).\n"
                ),
            ),
        ),
        Change(
            6, "16:40", "Hugo Bernard", "hugo.bernard@acme.example", "procedures/restore.md",
            "Restore: recovery targets (RTO/RPO) and links to the related pages",
            _chain(
                _insert_after("# Restore\n", RESTORE_INTRO),
                _replace(
                    "From the Proxmox web interface, open **Backup**, pick the vzdump archive and "
                    "restore it.\nTypical duration: 20 minutes for 50 GB. From the command line:",
                    "From the [Proxmox](../infra/proxmox.md) web interface, open **Backup**, pick "
                    "the vzdump\narchive and restore it. Typical duration: 20 minutes for 50 GB. "
                    "From the command line:",
                ),
                _replace(
                    "Restore the latest pg_dump on db2 first, check it, then switch the "
                    "application over.",
                    "Restore the latest pg_dump on db2 first, check it, then switch the "
                    "application over (see\n[Databases](../infra/databases.md)).",
                ),
            ),
        ),
        Change(
            5, "09:05", "Claire Martin", "claire.martin@acme.example", "infra/backups.md",
            "Backups: GitLab is backed up too",
            _insert_after(
                "- **File shares:** NAS snapshots every hour, kept for 7 days.\n",
                "- **GitLab:** built-in backup every night at 3 a.m., copied off-site with the "
                "databases.\n",
            ),
        ),
        Change(
            3, "14:22", "Inès Petit", "ines.petit@acme.example", "tools/vpn.md",
            "VPN: troubleshooting",
            _append(VPN_TROUBLESHOOTING),
        ),
        Change(
            1, "11:30", "Hugo Bernard", "hugo.bernard@acme.example", "procedures/restore.md",
            "Page verified: procedures/restore.md",
            _verified_on(today - timedelta(days=1)),
        ),
    ]
    return [(today - timedelta(days=c.days_ago), c) for c in plan]


# ---- Last night's tidy-up run ------------------------------------------------------------------
# The organization's AI, as an administrator would set it: the provider's default model. The key
# is a placeholder, never sent anywhere: the replay gives the tidy-up its own conversation, no
# provider is opened. The static demo says so on the Tidy-up page.
TIDY_PROVIDER = "anthropic"
TIDY_MODEL = "claude-sonnet-5-5"
TIDY_KEY = "static-demo-placeholder-no-provider-called"
TIDY_TIME, TIDY_ZONE = "02:00", "Europe/Paris"  # the application's defaults
TIDY_SECONDS = 97  # length of the run


def item(title: str) -> str:
    """An inbox note of the data set, by its title (its file name is found at replay time)."""
    return f"{{item:{title}}}"


NAS, BACKUPS = "NAS capacity raised to 16 TB", "VM backups"
MEETING, OLD_SERVER = "Team meeting moves to Tuesday", "Old server?"
SWITCHES, FRIDAY = "Switch inventory", "No production deployments on Friday afternoons"
DECISION = "decisions/2026-10-no-friday-deployments.md"


@dataclass(frozen=True)
class Turn:
    """One answer of the model: its tool calls, and the tokens it is billed (input read at full
    price, input read back from the provider's cache, output)."""

    calls: list[tuple[str, dict[str, Any]]]
    tokens: tuple[int, int, int]


TIDY_RUN = [
    Turn([("list_tree", {})], (8_200, 0, 70)),
    Turn(
        [
            ("read_inbox_item", {"item": item(title)})
            for title in (NAS, BACKUPS, MEETING, OLD_SERVER, SWITCHES, FRIDAY)
        ],
        (1_900, 8_200, 420),
    ),
    Turn(
        [
            ("read_page", {"path": "infra/storage.md"}),
            ("read_page", {"path": "infra/backups.md"}),
            ("read_page", {"path": "team/meetings.md"}),
            ("backlinks", {"path": "team/meetings.md"}),
            ("search", {"query": "Monday"}),
            ("read_page", {"path": "network/topology.md"}),
            ("read_page", {"path": "procedures/deployment.md"}),
            ("read_page", {"path": "decisions/README.md"}),
            ("search", {"query": "old server"}),
        ],
        (5_200, 10_100, 610),
    ),
    Turn(
        [
            ("edit_page", {
                "path": "infra/storage.md",
                "old": "The NAS in rack B provides 8 TB of usable space in RAID 6.",
                "new": "The NAS in rack B provides 16 TB of usable space in RAID 6, since 1 October 2026 "
                       "(four disks\nadded). Previously: 8 TB.",
            }),
            ("mark_done", {
                "item": item(NAS),
                "summary": "Capacity updated: 16 TB since 1 October 2026 (previously 8 TB).",
                "pages": ["infra/storage.md"],
            }),
            ("mark_done", {
                "item": item(BACKUPS),
                "summary": "Already in Backups (vzdump every night at 2 a.m.): nothing to add.",
            }),
        ],
        (6_900, 15_300, 820),
    ),
    Turn(
        [
            ("read_page", {"path": "decisions/2026-02-remote-work.md"}),
            ("read_page", {"path": "infra/monitoring.md"}),
        ],
        (900, 22_200, 160),
    ),
    Turn(
        [
            ("edit_page", {
                "path": "team/meetings.md",
                "old": "The weekly team meeting takes place on **Monday at 10 a.m.**, in the Everest room.",
                "new": "The weekly team meeting takes place on **Tuesday at 10 a.m.**, in the Everest room, "
                       "since\n13 October 2026. Previously: Monday at 10 a.m.",
            }),
            ("mark_done", {
                "item": item(MEETING),
                "summary": "Meeting moved to Tuesday 10 a.m. from 13 October 2026 (previously Monday). "
                           "To check: the remote-work decision and the dashboard export in Monitoring "
                           "still mention a Monday meeting.",
                "pages": ["team/meetings.md"],
            }),
            ("leave_in_inbox", {
                "item": item(OLD_SERVER),
                "reason": "Which server? The note does not say, and the wiki lists several (web1, web2, "
                          "db1, db2, pve1, and the machines retired before 2020). A question for Malik "
                          "Robert, who wrote it: the space's purpose says to leave such questions in "
                          "the inbox.",
            }),
        ],
        (700, 23_100, 540),
    ),
    Turn(
        [
            ("file_attachment", {
                "item": item(SWITCHES),
                "attachment": "switch-inventory.csv",
                "path": "network/switch-inventory.csv",
            }),
            ("append_page", {
                "path": "network/topology.md",
                "content": "\n## Switches\n\n"
                "Two core switches, core-a (rack A) and core-b (rack B), and one access switch per "
                "floor. The\n[switch inventory](switch-inventory.csv) lists their ports and firmware "
                "versions, checked on\n4 October 2026 after the Sunday maintenance: firmware 7.4.2 on "
                "the core switches, 7.3.9 on\nthe floor switches.\n",
            }),
            ("mark_done", {
                "item": item(SWITCHES),
                "summary": "Inventory filed next to Topology, with a Switches section that links to it.",
                "pages": ["network/topology.md", "network/switch-inventory.csv"],
            }),
        ],
        (600, 23_800, 380),
    ),
    Turn(
        [
            ("write_page", {
                "path": DECISION,
                "content": "# No production deployments on Friday afternoons\n\n"
                "October 2026: no production deployment on Friday after 3 p.m., except an urgent fix "
                "approved\nby Claire Martin. Decided at the team meeting of 5 October 2026. See\n"
                "[Deployment](../procedures/deployment.md).\n",
            }),
            ("edit_page", {
                "path": "decisions/README.md",
                "old": "- [2026-02: remote work](2026-02-remote-work.md)",
                "new": "- [2026-02: remote work](2026-02-remote-work.md)\n"
                       "- [2026-10: no production deployments on Friday afternoons]"
                       "(2026-10-no-friday-deployments.md)",
            }),
            ("edit_page", {
                "path": "procedures/deployment.md",
                "old": "by a second person.\n",
                "new": "by a second person.\n\nNever on Friday after 3 p.m., except an urgent fix "
                       "approved by Claire Martin: see the\n[decision of October 2026]"
                       "(../decisions/2026-10-no-friday-deployments.md).\n",
            }),
        ],
        (1_100, 24_400, 760),
    ),
    Turn(
        [
            ("mark_done", {
                "item": item(FRIDAY),
                "summary": "New decision page, listed in Decisions and linked from the Deployment "
                           "procedure.",
                "pages": [DECISION, "decisions/README.md", "procedures/deployment.md"],
            }),
            ("finish", {
                "summary": "6 notes reviewed: 4 integrated (NAS capacity, team meeting, switch "
                           "inventory and its file, Friday deployments decision), 1 already in the "
                           "wiki (VM backups), 1 left in the inbox for its author (Old server?).",
            }),
        ],
        (900, 25_500, 410),
    ),
]
TIDY_FILED, TIDY_LEFT = 5, 1  # what the run must report, or the replay stops the build


def tidy_start(now: datetime) -> datetime:
    """Start of last night's scheduled run: the latest TIDY_TIME (local) at least an hour ago."""
    zone = ZoneInfo(TIDY_ZONE)
    local = now.astimezone(zone)
    start = datetime.combine(local.date(), time.fromisoformat(TIDY_TIME), tzinfo=zone)
    if start > local - timedelta(hours=1):
        start -= timedelta(days=1)
    return start


# ---- Notes dropped since the run ---------------------------------------------------------------
@dataclass(frozen=True)
class Note:
    """A note dropped after the run, waiting for the next one. `share`: when, between the run
    and the build (0 to 1)."""

    share: float
    author: str
    email: str
    source: str  # web or mcp, as the application records it
    via: str
    title: str
    body: str
    hint: str = ""
    origin: str = ""
    attachments: dict[str, bytes] = field(default_factory=dict)


NEW_NOTES = [
    Note(
        0.55, "Hugo Bernard", "hugo.bernard@acme.example", "mcp", "Claude",
        "Disk alert threshold lowered to 80 %",
        "Zabbix now raises the disk usage alert at 80 % instead of 85 %, to leave more time to "
        "react\nbefore a volume fills up. Changed this morning on every host template.\n",
        origin="Conversation with Claude about the Zabbix alerts",
    ),
    Note(
        0.8, "Inès Petit", "ines.petit@acme.example", "web", "web",
        "Guest Wi-Fi password rotated",
        "The password of the guest Wi-Fi was changed this morning. The new one is in the "
        "password\nvault, entry \"Wi-Fi guests\". Next rotation in three months.\n",
        hint="network/wifi.md",
    ),
]
