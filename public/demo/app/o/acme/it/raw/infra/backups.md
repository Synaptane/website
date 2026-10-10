---
owner: Hugo Bernard
verified: 2026-10-01
review_every: 1y
---
# Backups

- **Virtual machines:** vzdump every night at 2 a.m., kept for 14 days.
- **PostgreSQL databases:** pg_dump every 6 hours, copied off-site to our backup provider.
- **File shares:** NAS snapshots every hour, kept for 7 days.
- **GitLab:** built-in backup every night at 3 a.m., copied off-site with the databases.
- **Restoring:** see the [restore procedure](../procedures/restore.md).

A restore drill takes place every quarter; the last one is logged in the
[restore procedure](../procedures/restore.md).
