<p align="center">
  <img src="assets/alph-banner.svg" alt="Alph banner" width="720" />
</p>

<p align="center">
  <b>Alph</b> — Configure MCP servers for your AI agents in one command. Local-first, atomic, and stress-free.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@aqualia/alph-cli"><img alt="npm" src="https://img.shields.io/npm/v/@aqualia/alph-cli"></a>
  <a href="https://www.npmjs.com/package/@aqualia/alph-cli"><img alt="downloads" src="https://img.shields.io/npm/dm/@aqualia/alph-cli"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
</p>



## Why Alph?

Modern AI agents speak **MCP (Model Context Protocol)**, but wiring them up still means hand-editing fragile local config files per tool and per OS. Alph makes that painless: it **detects** installed agents, **validates** changes, performs **atomic writes** with **timestamped backups**, and gives you **instant rollback** — all without sending any network traffic. &#x20;

> Think of Alph as the **universal remote for your AI developer tools**. Point it at your MCP server (local or remote), pick your agent(s), and you’re done.

---

## Demo

![Alph Demo](demo-alph.gif)

*A quick wizard run: detect agents → choose transport → write configs → validate → done.*&#x20;

## Installation

```bash
# Global install (recommended)
npm install -g @aqualia/alph-cli

# Or try without installing
npx @aqualia/alph-cli@latest
```

Then run `alph` to launch the interactive wizard.&#x20;

**Requirements**: Node.js ≥ 18.&#x20;

---

## Supported AI Agents

Alph detects and configures these agents out of the box:

* **Gemini CLI** (`~/.gemini/settings.json`)
* **Cursor**
* **Claude Code**
* **Windsurf**
* **Warp**
* **Codex CLI**&#x20;

**Compatibility Matrix (OS × Transport)**

| Agent       | macOS | Linux | Windows | HTTP | SSE | STDIO |   |
| ----------- | :---: | :---: | :-----: | :--: | :-: | :---: | - |
| Gemini CLI  |   ✅   |   ✅   |    ✅    |   ✅  |  ✅  |   ✅   |   |
| Cursor      |   ✅   |   ✅   |    ✅    |   ✅  |  ✅  |   ✅   |   |
| Claude Code |   ✅   |   ✅   |    ✅    |   ✅  |  ✅  |   ✅   |   |
| Windsurf    |   ✅   |   ✅   |    ✅    |   ✅  |  ✅  |   ✅   |   |
| Warp        |   ✅   |   ✅   |    ✅    |   ✅  |  ✅  |   ✅   |   |
| Codex CLI   |   ✅   |   ✅   |    ✅    |   ✅  |  ✅  |   ✅   |   |


> **MCP Transports 101** — Hosts/agents connect to servers via **STDIO** (local), **HTTP**, or **SSE** (streaming HTTP). Alph supports all three and lets you pick the best per agent. 

---

## Usage

### 1) Interactive (recommended)

```bash
# Detects agents, guides transport choice, writes configs atomically with backups
alph
# or
alph setup
```

* No flags needed: the wizard handles detection, preview, and safe writes.&#x20;

### 2) Non-interactive (one-liner)

```bash
alph setup \
  --mcp-server-endpoint https://www.askhuman.net/api/mcp/YOUR_SERVER_ID \
  --bearer YOUR_ASKHUMAN_ACCESS_KEY \
  --agents gemini,cursor
```

* Add `--dry-run` to preview changes without touching files.&#x20;

### 3) STDIO tools (local servers)

For STDIO, Alph can auto-install the local tool (opt-out with `--no-install`) and run health checks before writing any config.

```bash
# Use STDIO without auto-installing the tool
alph setup --transport stdio --no-install

# Prefer a specific installer (npm|brew|pipx|cargo|auto)
alph setup --transport stdio --install-manager npm

# Control the atomic write strategy via env
ALPH_ATOMIC_MODE=copy alph setup --mcp-server-endpoint https://... --agents gemini
```
## Quick Start (with **AskHuman** MCP server)

AskHuman is a remote MCP server. Use Alph to connect your local agents to your personal AskHuman endpoint in seconds.

```bash
# Configure AskHuman (remote MCP server) for multiple agents in one go
# Replace YOUR_SERVER_ID with the ID shown in AskHuman → Your MCP Server
alph setup \
  --mcp-server-endpoint https://www.askhuman.net/api/mcp/YOUR_SERVER_ID \
  --bearer YOUR_ASKHUMAN_ACCESS_KEY
```

* **Where to find these values**: In the AskHuman dashboard (Your MCP Server), copy your endpoint (`.../api/mcp/<your-id>`) and generate an access key if auth is enabled. &#x20;
* Works with **HTTP** and **SSE** transports; choose `--transport sse` and use the `.../api/mcp/<id>/sse` endpoint if your host/agent prefers streams. &#x20;

---

## Safety & Reliability by Default

* **Local-first**: Alph operates purely on local files; no network requests during configure/remove.&#x20;
* **Atomic writes** with **timestamped backups** and **validation**; fast **rollback** if anything looks off. &#x20;
* **Secrets redacted** in output (e.g., bearer tokens).&#x20;

---

## Command Reference (concise)

```text
alph setup [options]
  --mcp-server-endpoint <url>  MCP server endpoint URL
  --bearer [token]             Authorization bearer token (optional)
  --transport <type>           http | sse | stdio
  --command <cmd>              Command for stdio transports
  --cwd <path>                 Working directory for stdio command
  --args <list>                Comma-separated args for stdio command
  --env <list>                 Env vars (KEY=VALUE)
  --headers <list>             HTTP headers (KEY=VALUE)
  --timeout <ms>               Command timeout
  --install-manager <mgr>      npm | brew | pipx | cargo | auto
  --atomic-mode <mode>         auto | copy | rename
  --no-install                 Skip auto-install for STDIO tools
  --agents <list>              Filter (e.g. gemini,cursor)
  --dir <path>                 Custom config root
  --dry-run                    Preview changes (no writes)
  --name <id>                  Name/ID for the MCP server

alph status [options]          Show detected agents and configured servers
  --dir <path>                 Include project-level configs where applicable (e.g., Claude)

alph remove [options]
      --server-name <name>         MCP server name to remove
      --agents <list>              Filter agents to modify
      --dir <path>                 Custom config root
      --scope <auto|global|project|all>  Scope for removal where supported (e.g., Claude)
      --dry-run                    Preview removal (no writes)
      -y, --yes                    Skip confirmation
      -i, --interactive            Removal wizard
      --no-backup                  Do not back up before removal (advanced)
```

---

## Troubleshooting (quick hits)

* **Nothing seems to change** → Re-run with `--dry-run` to confirm detection and planned writes; then run without it.&#x20;
* **Agent not detected** → Ensure the agent is installed and its config is in the default location (see agent docs in `docs/agents`).&#x20;
* **STDIO tool missing** → Add `--install-manager npm` (or `brew|pipx|cargo`) or run with `--no-install` if you want to manage it yourself.&#x20;

---

## Documentation

* **User Guide** → `USER_GUIDE.md` (advanced setups, more recipes)
* **Architecture** → `ARCHITECTURE.md` (execution flows & structure)
* **Security** → `SECURITY.md` (secret handling, backups, rollback)
* **Troubleshooting** → `TROUBLESHOOTING.md`
* **Contributing** → `CONTRIBUTING.md`

---

## Community & Support

* Open issues: [https://github.com/Aqualia/Alph/issues](https://github.com/Aqualia/Alph/issues)
* Feature request: [https://github.com/Aqualia/Alph/issues/new?template=feature\_request.yml](https://github.com/Aqualia/Alph/issues/new?template=feature_request.yml)
* Bug report: [https://github.com/Aqualia/Alph/issues/new?template=bug\_report.yml](https://github.com/Aqualia/Alph/issues/new?template=bug_report.yml)
* Code of Conduct: Contributor Covenant v2.1. Contact: [hello@aqualia.ie](mailto:hello@aqualia.ie).&#x20;

---

## License

MIT — see [LICENSE](./LICENSE).&#x20;

---


