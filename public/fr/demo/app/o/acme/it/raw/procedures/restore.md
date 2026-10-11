---
owner: Hugo Bernard
verified: 2026-10-10
review_every: 1y
---
# Restore

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

## Restore a virtual machine

From the [Proxmox](../infra/proxmox.md) web interface, open **Backup**, pick the vzdump
archive and restore it. Typical duration: 20 minutes for 50 GB. From the command line:

```bash
qmrestore /mnt/nas/dump/vzdump-qemu-104-2026_10_01-02_00_03.vma.zst 104 --storage local-lvm
```

## Restore a database

Restore the latest pg_dump on db2 first, check it, then switch the application over (see
[Databases](../infra/databases.md)).

## Drills

A restore drill takes place every quarter. Last drill: 29 September 2026, web1 restored in
18 minutes.
