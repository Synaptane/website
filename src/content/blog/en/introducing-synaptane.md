---
title: Introducing Synaptane
description: A team second brain stored in Git. Your AI assistants search it and feed it, an agent tidies it every night, and everything stays plain Markdown in a repository you own.
date: 2026-10-10
author: René Cotton
lang: en
draft: true
---

Every day, my team and I explain things to AI assistants: how a server is set up, why a
project is configured the way it is, what we decided last week and why. The assistant helps,
the conversation ends, and that knowledge is gone. The next person, or the same person a month
later, starts again from zero.

The usual answer is a wiki. But a wiki only works if someone keeps it up to date, and in most
teams nobody does. Pages go stale, duplicates pile up, links break. People stop trusting it,
so they stop writing in it.

There are tools that promise to fix this with AI. Most of them want your team's knowledge in
their cloud, in their format, behind their interface. For something as central as the memory
of a team, I did not want that. I wanted the knowledge to stay ours, readable without any
particular tool, and easy to take elsewhere.

Synaptane is what I built to solve this. Its first public version, `v1.0.0-rc.1`, is open
source under the Apache 2.0 license.

## What Synaptane does

Synaptane is a self-hosted team second brain stored in Git. Your AI assistants search it and
drop what they learn into an inbox. Every night, an AI agent files those notes into a
plain-Markdown wiki and commits the result.

### Git is the source of truth

Each space is a Git repository, on GitHub, GitLab, Gitea or any other host. Its `content/`
folder is the wiki: plain Markdown that you can read, grep and clone without Synaptane. Every
change is a commit, authored by the person who made it.

Sync works both ways. If someone edits a page directly on the Git host, Synaptane fetches the
change. If the histories conflict, a person decides, file by file: Synaptane never
force-pushes and never lets an AI resolve a conflict. Apart from accounts, permissions,
secrets and logs, the database holds nothing that cannot be rebuilt from the repositories.

### Built for AI assistants

Synaptane is an MCP server. Claude.ai, Claude Desktop, Claude Code and ChatGPT connect to it
with OAuth or a personal token, and get 20 tools and 3 prompts: list spaces, search, read a
page or a single section, follow the history, drop notes, write pages. A connection can be
limited to read-only, or to some spaces. Every write tool is declared destructive, so the
assistant asks before using it.

### Drop first, file later

When you learn something in a conversation, you ask your assistant to save it. It drops a
note into the inbox of the right space, and it is told about pages and notes that already
cover the topic. Notes can also come from the web interface or the REST API, and pages edited
directly show up in the inbox too.

Every night, an AI agent goes through the inbox. It reads the purpose of the space, a short
page where the team says what the space is for and how it is organized. It searches the wiki,
completes existing pages rather than duplicating them, creates new ones where needed, fixes
links, and commits the whole pass as one commit. If a pass goes wrong, you undo it in one
click. Guardrails keep it in check: at most 10 deletions per pass, a cost cap per pass, and
an optional monthly budget.

### Routines

You can also schedule agent routines on a space. Two come ready to use: a consistency check
that looks for contradictions, outdated information and duplicates, and a weekly digest of
what the team learned and decided. A routine only writes to its outputs (a report page, inbox
items, an email or a webhook), so actual fixes still go through the inbox and the nightly
tidy-up.

### Search that finds things

Full-text search works out of the box, with accent folding and light stemming in English and
French. It covers the text of PDF and Office documents, and of images through OCR. With an
embedding model, search becomes hybrid: by words and by meaning. Each page also lists related
pages.

### Knowledge you can trust

Pages can have an owner, a verification date and a review cycle, and assistants see whether a
page is verified or due for review. A Health tab lists broken links, orphan pages and pages
nobody has touched for months. Probable secrets, such as passwords or API keys, are refused
before anything is committed.

You choose the AI provider: Anthropic, OpenAI, Mistral, Ollama or any OpenAI-compatible
endpoint. Without one, the wiki, search, the MCP server and the inbox still work; only the
tidy-up, routines and search by meaning need a model.

## Try it

You can look around [the online demo](/demo/) without installing anything. To run Synaptane
yourself, you need Linux (or WSL2 on Windows) and Docker with Docker Compose. The demo
instance starts in about two minutes:

```sh
git clone https://github.com/synaptane/synaptane.git && cd synaptane
printf 'PUBLIC_URL=http://localhost:8000\nPOSTGRES_PASSWORD=%s\nSYNAPTANE_VERSION=1.0.0-rc.1\n' \
  "$(openssl rand -hex 24)" > .env
echo 'COMPOSE_FILE=compose.yaml:examples/compose.demo.yaml' >> .env   # demo only
docker compose up -d
docker compose exec app synaptane demo
```

It loads the wiki of a fictional IT team: 50 pages, some verified and one due for review, and
six notes waiting in the inbox. Tidying them needs an AI provider. For a real installation,
read the [installation guide](/docs/admin/installation/), then
[connect your AI assistant](/docs/guide/mcp/).

## Where it stands

Synaptane is alpha software. It is provided as is and maintained on a best-effort basis by
one person: me. The REST API, the MCP tools and the configuration may still change; every
change is listed in the [release notes](/releases/), and you should back up before each
upgrade.

Some features are recent (routines, related pages, page verification) and will have rough
edges. Some are not there yet: two-factor authentication, restoring a single version of a
page from the interface (the Git history is there), a `/metrics` endpoint. macOS is not
tested.

## What comes next

Next on the list: account security (two-factor authentication, sessions that expire), easier
operations (monitoring, an arm64 image, simpler backups), more AI providers with automatic
cost estimates, and restoring a page version in one click. A hosted offer is being
considered, nothing more for now. The [roadmap](/roadmap/) has the details.

## Get involved

What helps most right now is feedback from people who try it. Questions, ideas and use cases
go to [GitHub Discussions](https://github.com/synaptane/synaptane/discussions); bugs go to
[issues](https://github.com/synaptane/synaptane/issues). If you want to contribute code,
documentation or translations, read
[CONTRIBUTING.md](https://github.com/synaptane/synaptane/blob/main/CONTRIBUTING.md) first:
commits are signed off under the Developer Certificate of Origin. Security issues are
reported privately, as described in
[SECURITY.md](https://github.com/synaptane/synaptane/blob/main/SECURITY.md).

A word on how it is made: Synaptane is developed with the help of AI coding assistants
(Claude), and I review every change.

If your team also loses what it explains to its assistants, I would like to know whether
Synaptane helps.
