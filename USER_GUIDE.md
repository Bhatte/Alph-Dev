# Alph - User Guide

## Table of Contents

1. [Who This Guide Is For](#who-this-guide-is-for)
2. [What Is Alph? (2-Minute Explanation)](#what-is-alph-2minute-explanation)
3. [Getting Started: Connect to askhuman (Step-by-Step)](#getting-started-connect-to-askhuman-step-by-step)

   * [Prerequisites](#prerequisites)
   * [Step 1 — One-liner setup](#step-1--one-liner-setup)
   * [Step 2 — Verify & test](#step-2--verify--test)
   * [Step 3 — Edit or remove safely](#step-3--edit-or-remove-safely)
4. [Recipes: Other Popular Agents](#recipes-other-popular-agents)

   * [Cursor](#cursor)
   * [Claude Code](#claude-code)
   * [Windsurf](#windsurf)
   * [Codex CLI](#codex-cli)
   * [Gemini CLI](#gemini-cli)
   * [Local STDIO servers](#local-stdio-servers)
5. [Advanced Usage](#advanced-usage)

   * [Transports: http, sse, stdio](#transports-http-sse-stdio)
   * [Auth: bearer vs custom headers](#auth-bearer-vs-custom-headers)
   * [Project-scoped configs (`--dir`)](#projectscoped-configs---dir)
   * [Atomic writes, backups, rollback](#atomic-writes-backups-rollback)
   * [Install managers for STDIO](#install-managers-for-stdio)
   * [Environment variables](#environment-variables)
6. [Troubleshooting](#troubleshooting)
7. [Command Cheatsheet](#command-cheatsheet)
8. [Glossary](#glossary)

---

## Who This Guide Is For

Everyone—from senior engineers to students and first-time CLI users. 

---

## What Is Alph? (2-Minute Explanation)

Alph is the **universal remote for agent configuration**. It discovers where your agent keeps its MCP config, writes updates **atomically** (with schema validation), keeps **timestamped backups**, and can **roll back** if anything looks off. Alph supports **HTTP**, **SSE**, and **STDIO** transports so you can point your agents at **any** MCP server—local or remote—without hand-editing fragile files.

Key ideas:

* **Local-first**: Alph modifies files on your machine; it doesn’t call out to the internet during configure/remove.
* **Interactive or scripted**: Run `alph` for the wizard or use precise flags for CI/automation.
* **Safety by default**: Atomic writes, backups, redacted previews, and validation.

---

## Getting Started: Connect to askhuman (Step-by-Step)

### Prerequisites

* An agent/host (e.g., **Cursor**, **Claude Code**, **Windsurf**, **Gemini CLI**, **Codex CLI**) installed on your machine.
* Your **askhuman MCP server URL** (e.g., `https://www.askhuman.net/mcp` or the server URL provided by your admin).
* If required by your server, a **bearer token** (askhuman key) or other header.

> **What’s MCP?** The Model Context Protocol defines how AI agents talk to tools (“servers”). Alph just wires the two together.

---

### Step 1 — One-liner setup

**Interactive (recommended)**

```bash
alph
```

You’ll be asked for:

* Which agent(s) to configure
* Transport (`http`, `sse`, or `stdio`)
* Your MCP server URL
* Optional auth (e.g., bearer token)

**Non-interactive (copy/paste) — Cursor example with askhuman**

```bash
alph configure cursor \
  --transport http \
  --url https://www.askhuman.net/mcp \
  --bearer YOUR_ASKHUMAN_KEY
```

**What each flag means**

* `configure cursor` — “Edit Cursor’s MCP config.”
* `--transport http` — “Talk over HTTP (great for remote servers).”
* `--url …/mcp` — “This is the MCP server endpoint.”
* `--bearer …` — “Send Authorization: Bearer … for this server.”

> No `--bearer`? Use headers instead:
> `--header "Authorization: Bearer YOUR_ASKHUMAN_KEY"`

---

### Step 2 — Verify & test

**Show what’s configured**

```bash
alph status
```

You should see your agent (e.g., Cursor) listed with transport `http` (or `sse`) and the askhuman URL.

**ASCII “success”**

```
+---------------------------------------------+
|  SUCCESS                                    |
|  Agent ↔ askhuman MCP server is connected   |
|  Try a real workflow next.                  |
+---------------------------------------------+
```

> Some agents cache config. If in doubt, restart the IDE/host once.

---

### Step 3 — Edit or remove safely

**Preview changes (no writes)**

```bash
alph configure cursor \
  --transport http \
  --url https://www.askhuman.net/mcp \
  --bearer YOUR_ASKHUMAN_KEY \
  --dry-run
```

**Remove configuration**

```bash
alph remove --agents cursor --server-name askhuman -y
```

**Project-scoped configs**
If your agent stores config inside a project directory, run remove against that scope:

```bash
alph remove --agents cursor --server-name askhuman --dir /path/to/your/project -y
```

---

## Recipes: Other Popular Agents

> All examples assume a **remote** server. Swap `http` for `sse` if your agent prefers streaming. Use `--header` instead of `--bearer` when you need custom headers.

### Cursor

```bash
# HTTP
alph configure cursor \
  --transport http \
  --url https://www.askhuman.net/mcp \
  --bearer YOUR_ASKHUMAN_KEY

# SSE
alph configure cursor \
  --transport sse \
  --url https://www.askhuman.net/mcp/sse \
  --bearer YOUR_ASKHUMAN_KEY
```

### Claude Code

```bash
# HTTP
alph configure claude \
  --transport http \
  --url https://www.askhuman.net/mcp \
  --header "Authorization: Bearer YOUR_ASKHUMAN_KEY"

# SSE
alph configure claude \
  --transport sse \
  --url https://www.askhuman.net/mcp/sse \
  --header "Authorization: Bearer YOUR_ASKHUMAN_KEY"
```

### Windsurf

```bash
alph configure windsurf \
  --transport http \
  --url https://www.askhuman.net/mcp \
  --bearer YOUR_ASKHUMAN_KEY
```

### Codex CLI

```bash
alph configure codex \
  --transport http \
  --url https://www.askhuman.net/mcp \
  --header "Authorization: Bearer YOUR_ASKHUMAN_KEY"
```

### Gemini CLI

```bash
alph configure gemini \
  --transport http \
  --url https://www.askhuman.net/mcp
```

> For Gemini, auth may be handled by the host. If your server requires headers, use `--header KEY=VALUE`.

### Local STDIO servers

If your MCP server runs locally as a process:

```bash
# Use a command as the STDIO transport (no network)
alph configure cursor \
  --transport stdio \
  --command "my-local-mcp" \
  --args "--flag1,--flag2" \
  --env "ENV1=VALUE1,ENV2=VALUE2"
```

* Prefer the **interactive wizard** for STDIO: it can discover, install, and health-check local tools for you.
* Opt out of auto-install with `--no-install`.

---

## Advanced Usage

### Transports: `http`, `sse`, `stdio`

* **HTTP**: Best for remote servers; simple request/response.
* **SSE**: Server-Sent Events (streaming over HTTP). Some agents prefer this for long-running calls.
* **STDIO**: Local child process; fastest path to local tools. Alph can bootstrap the executable and wire it up.

### Auth: `bearer` vs `custom headers`

* Quick path:

  ```bash
  --bearer YOUR_TOKEN
  ```

  (Sends `Authorization: Bearer YOUR_TOKEN`.)
* Custom path:

  ```bash
  --header "Authorization: Bearer YOUR_TOKEN" --header "X-My-Org: Aqualia"
  ```
* Multiple headers: repeat `--header KEY=VALUE` or comma-separate via `--headers`.

### Project-scoped configs (`--dir`)

Many agents support **project-level** config. Target it explicitly:

```bash
# Configure only for a specific project
alph configure cursor --dir /path/to/project --transport http --url https://www.askhuman.net/mcp

# Remove from that project only
alph remove --agents cursor --server-name askhuman --dir /path/to/project -y
```

### Atomic writes, backups, rollback

* Every change is written **atomically** (copy-then-swap or rename strategies).
* Alph maintains **timestamped backups** and can roll back if validation fails.
* Control strategy with:

  ```bash
  ALPH_ATOMIC_MODE=copy alph configure ...
  # or
  alph configure ... --atomic-mode copy
  ```

### Install managers for STDIO

When the wizard needs to install a local STDIO tool:

```bash
# Auto-pick a manager
alph configure ... --transport stdio

# Force a manager
alph configure ... --transport stdio --install-manager npm
# Options: npm | brew | pipx | cargo | auto
```

Skip any installs with `--no-install`.

### Environment variables

* Prefer environment variables for secrets:

  ```bash
  export ASKHUMAN_KEY="…"
  alph configure cursor --transport http --url https://www.askhuman.net/mcp --bearer "$ASKHUMAN_KEY"
  ```
* You can also pass env for STDIO processes via `--env KEY=VALUE`.

---

## Troubleshooting

**“It says configured, but my agent can’t reach the server.”**

* Check your URL (typos are common): `https://www.askhuman.net/mcp`
* Verify network/VPN requirements.
* Re-paste your bearer token; watch for trailing spaces.
* Try `alph status` to confirm what’s actually written.

**“Windsurf/Codex shows as installed but isn’t.”**

* Some hosts are detected via **config presence**. If a leftover config was created earlier, remove it with `alph remove` or delete the specific server entry, then run `alph status` again.

**“I removed a server, but it still appears in my agent.”**

* Some agents keep **global + project** configs. Remove in both scopes:

  ```bash
  alph remove --agents <agent> --server-name askhuman -y
  alph remove --agents <agent> --server-name askhuman --dir /path/to/project -y
  ```
* Restart the agent/IDE after removal (caches are a thing).

**“I don’t want my token in shell history.”**

* Use environment variables and avoid inline tokens:

  ```bash
  export ASKHUMAN_KEY="…"
  alph configure cursor --bearer "$ASKHUMAN_KEY"
  ```

**“I want to see what Alph will change before it writes.”**

* Add `--dry-run` to any `configure`/`remove` command.

---

## Command Cheatsheet

```bash
# Interactive wizard
alph

# Configure one agent (HTTP)
alph configure cursor --transport http --url https://www.askhuman.net/mcp --bearer YOUR_ASKHUMAN_KEY

# Configure one agent (SSE)
alph configure cursor --transport sse --url https://www.askhuman.net/mcp/sse --bearer YOUR_ASKHUMAN_KEY

# Configure multiple agents
alph configure --agents cursor,claude --transport http --url https://www.askhuman.net/mcp --bearer YOUR_ASKHUMAN_KEY

# STDIO (local process)
alph configure cursor --transport stdio --command "my-local-mcp" --args "--foo,--bar" --env "KEY=VALUE"

# Status
alph status

# Remove (global)
alph remove --agents cursor --server-name askhuman -y

# Remove (project)
alph remove --agents cursor --server-name askhuman --dir /path/to/project -y

# Dry-run any operation
alph configure ... --dry-run
alph remove ... --dry-run
```

---

## Glossary

* **Agent / Host**: The application (IDE/CLI) that connects to an MCP server (e.g., Cursor, Claude Code).
* **MCP Server**: A process (remote or local) exposing tools/data to agents via MCP (e.g., askhuman).
* **Transport**: How the agent talks to the server: `http`, `sse` (streaming), or `stdio` (local process I/O).
* **Bearer token**: A secret sent as `Authorization: Bearer …` to authenticate with a server.
* **Atomic write**: Safe file update technique (write new → swap), ensuring you never end up with a half-written config.
* **Backup / Rollback**: Alph snapshots your previous config so you can recover instantly if something fails.

---


