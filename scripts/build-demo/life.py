"""A little fictional life for the demo wiki: a few commits by the people of the Acme data set.

The demo data set is imported in one commit ("Acme IT wiki: demo data"). These commits give the
history, diff and activity pages something to show, and re-verify one page, as a team would.
Dates are relative to the build day. Each edit is skipped (with a warning) when the page no
longer has the expected text, so a change of the data set never breaks the build.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta

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
