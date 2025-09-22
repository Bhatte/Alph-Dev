\# Kiro MCP — Integration Report for Alph



> Scope: essentials only for \*\*Alph Phase-1\*\* support of \*\*all platforms\*\* and \*\*both local \& remote\*\* MCP servers under Kiro.



\## 1) What Kiro supports (at a glance)



\* \*\*Config format \& keys (JSON)\*\* — top-level `"mcpServers"` map with per-server objects:



&nbsp; \* `command` (string, required), `args` (array, required), `env` (object, optional), `disabled` (bool), `autoApprove` (array of tool names). (\[Kiro]\[1])

\* \*\*Config locations \& precedence\*\*



&nbsp; \* \*\*User/global\*\*: `~/.kiro/settings/mcp.json`

&nbsp; \* \*\*Workspace/project\*\*: `.kiro/settings/mcp.json`

&nbsp; \* \*\*Merge rule\*\*: both are merged with \*\*workspace taking precedence\*\*. (\[Kiro]\[1])

\* \*\*Transports\*\*



&nbsp; \* \*\*Native\*\*: local \*\*STDIO\*\* (spawned via `command`/`args`). (\[Kiro]\[1])

&nbsp; \* \*\*Remote endpoints\*\*: supported \*\*indirectly\*\* via the `mcp-remote` wrapper (SSE). (\[Kiro]\[2])

&nbsp; \* (General MCP note: protocol defines \*\*STDIO\*\* and \*\*HTTP/SSE\*\* transports.) (\[Model Context Protocol]\[3])

\* \*\*Enablement \& UX\*\*



&nbsp; \* Toggle MCP in \*\*Settings\*\*, manage connections in \*\*MCP Servers\*\* tab, and view \*\*Kiro – MCP Logs\*\* in the Output pane. (\[Kiro]\[4])

\* \*\*Security\*\*



&nbsp; \* Treat tokens as secrets, prefer env vars, restrict file permissions, be conservative with `autoApprove`. (\[Kiro]\[5])



---



\## 2) File paths Alph must write



> Alph’s file writer should support both scopes and create parent directories.



| Scope                   | macOS/Linux                             | Windows (PowerShell)                    |

| ----------------------- | --------------------------------------- | --------------------------------------- |

| \*\*User (global)\*\*       | `~/.kiro/settings/mcp.json`             | `%USERPROFILE%\\.kiro\\settings\\mcp.json` |

| \*\*Workspace (project)\*\* | `<PROJECT\_DIR>/.kiro/settings/mcp.json` | `<PROJECT\_DIR>\\.kiro\\settings\\mcp.json` |



\* These paths and the \*\*workspace-overrides-user\*\* rule are defined by Kiro docs. (\[Kiro]\[1])



\*\*Permissions (recommended by Kiro):\*\*



```bash

\# Unix

chmod 600 ~/.kiro/settings/mcp.json

chmod 600 .kiro/settings/mcp.json

```



(\[Kiro]\[5])



---



\## 3) Kiro config object “shape” (canonical)



```json

{

&nbsp; "mcpServers": {

&nbsp;   "<server-name>": {

&nbsp;     "command": "<executable-or-launcher>",

&nbsp;     "args": \["<arg1>", "<arg2>"],

&nbsp;     "env": {

&nbsp;       "ENV\_VAR1": "value1",

&nbsp;       "ENV\_VAR2": "value2"

&nbsp;     },

&nbsp;     "disabled": false,

&nbsp;     "autoApprove": \["tool\_name1", "tool\_name2"]

&nbsp;   }

&nbsp; }

}

```



\* Keys/semantics match Kiro’s \*\*Configuration\*\* page. (\[Kiro]\[1])



---



\## 4) Local servers (STDIO) — ready-to-paste examples



\### 4.1 Python-based server via \*\*uv/uvx\*\*



\*\*macOS/Linux (user scope):\*\*



```json

{

&nbsp; "mcpServers": {

&nbsp;   "aws-docs": {

&nbsp;     "command": "uvx",

&nbsp;     "args": \["awslabs.aws-documentation-mcp-server@latest"],

&nbsp;     "env": { "FASTMCP\_LOG\_LEVEL": "ERROR" },

&nbsp;     "disabled": false,

&nbsp;     "autoApprove": \[]

&nbsp;   }

&nbsp; }

}

```



\*\*Windows (user scope):\*\*



```json

{

&nbsp; "mcpServers": {

&nbsp;   "aws-docs": {

&nbsp;     "command": "uv",

&nbsp;     "args": \[

&nbsp;       "tool","run","--from","awslabs.aws-documentation-mcp-server@latest",

&nbsp;       "awslabs.aws-documentation-mcp-server.exe"

&nbsp;     ],

&nbsp;     "env": { "FASTMCP\_LOG\_LEVEL": "ERROR" }

&nbsp;   }

&nbsp; }

}

```



\* These are taken from Kiro’s \*\*Servers\*\* guide. (\[Kiro]\[2])



\### 4.2 Node server via \*\*npx\*\*



```json

{

&nbsp; "mcpServers": {

&nbsp;   "web-search": {

&nbsp;     "command": "npx",

&nbsp;     "args": \["-y", "@modelcontextprotocol/server-bravesearch"],

&nbsp;     "env": { "BRAVE\_API\_KEY": "your-api-key" }

&nbsp;   }

&nbsp; }

}

```



\* From Kiro \*\*Configuration\*\*. (\[Kiro]\[1])



\### 4.3 Dockerized server



```json

{

&nbsp; "mcpServers": {

&nbsp;   "github": {

&nbsp;     "command": "docker",

&nbsp;     "args": \["run","-i","--rm","-e","GITHUB\_PERSONAL\_ACCESS\_TOKEN","ghcr.io/github/github-mcp-server"],

&nbsp;     "env": { "GITHUB\_PERSONAL\_ACCESS\_TOKEN": "your-token-here" },

&nbsp;     "disabled": false,

&nbsp;     "autoApprove": \[]

&nbsp;   }

&nbsp; }

}

```



\* From Kiro \*\*Servers\*\* (GitHub’s current recommendation). (\[Kiro]\[2])



> \*\*Alph note:\*\* All three patterns are \*\*STDIO\*\* from Kiro’s perspective because Kiro spawns a local process; your `command/args` choice determines the runtime (uvx, npx, docker).



---



\## 5) Remote servers (SSE) — supported via wrapper



Kiro’s docs state that while Kiro \*\*currently supports local STDIO\*\* natively, you can add \*\*remote\*\* MCP endpoints by launching `mcp-remote` (which bridges to an SSE endpoint) as the local command:



```json

{

&nbsp; "mcpServers": {

&nbsp;   "my-remote-mcp": {

&nbsp;     "command": "npx",

&nbsp;     "args": \["mcp-remote","https://<remote-mcp-endpoint>","--transport","sse"],

&nbsp;     "disabled": false

&nbsp;   }

&nbsp; }

}

```



\* Source: \*\*Remote MCP Servers\*\* section of Kiro \*\*Servers\*\*. (\[Kiro]\[2])

\* FYI (general protocol context): transports include \*\*STDIO\*\* and \*\*HTTP/SSE\*\*. (\[Model Context Protocol]\[3])



> \*\*Alph implication:\*\* when users pick “Remote (SSE)” in Alph’s interactive flow, you should generate the above wrapper entry instead of trying to write a non-existent `url/httpUrl` key (Kiro has no native `url` field in its schema). (\[Kiro]\[1])



---



\## 6) Approval \& security behaviors



\* \*\*`autoApprove`\*\* lets users pre-approve selected tools per server (array of tool names). Kiro’s guidance: only auto-approve low-risk tools; prefer manual approval otherwise. (\[Kiro]\[1])

\* \*\*Secrets\*\*: place API keys in `env` and \*\*do not\*\* commit config; use strict perms (`chmod 600`). (\[Kiro]\[5])

\* \*\*Workspace isolation\*\*: prefer workspace configs for project-specific servers to contain risk and token exposure. (\[Kiro]\[5])



---



\## 7) Enablement, troubleshooting \& logs



\* After writing config, users must \*\*enable MCP\*\* in Settings → search “MCP”. (\[Kiro]\[4])

\* \*\*Logs\*\*: Kiro panel → \*\*Output\*\* → “\*\*Kiro – MCP Logs\*\*”. (\[Kiro]\[4])

\* Troubleshooting checklist: validate JSON, verify `command` on `PATH`, validate env vars, and \*\*restart Kiro\*\* to apply changes. (\[Kiro]\[1])



---



\## 8) How Alph should integrate (Phase-1 alignment)



> The goal is to let Alph \*\*install\*\* (optional), \*\*add/remove\*\* entries, and \*\*toggle\*\* servers by writing/merging Kiro’s JSON at user/workspace scope.



\### 8.1 Mapping to Alph’s central model



\* Alph’s “agent/client” \*\*Kiro\*\* adapter should target:



&nbsp; \* \*\*User file\*\*: `~/.kiro/settings/mcp.json`

&nbsp; \* \*\*Workspace file\*\*: `<project>/.kiro/settings/mcp.json`

&nbsp; \* \*\*Merge strategy\*\*: preserve existing `"mcpServers"` and upsert by server key; do not drop unknown keys; honor \*\*workspace > user\*\* precedence (Kiro’s behavior). (\[Kiro]\[1])

\* \*\*Transports\*\*:



&nbsp; \* \*\*Local (STDIO)\*\*: generate `command`/`args` using `uvx`, `npx`, or `docker` per server template above. (\[Kiro]\[1])

&nbsp; \* \*\*Remote (SSE)\*\*: generate `npx mcp-remote <url> --transport sse`. (\[Kiro]\[2])



\### 8.2 Feature flags / CLI opts (Phase-1)



To keep behavior explicit and testable:



\* `--scope user|workspace` (default: `user`)

\* `--remote-url <https://…>` (switches to \*\*mcp-remote\*\* template)

\* `--no-install` (skip package/runtime installation; only writes config)

\* `--auto-approve <tool1,tool2>` (writes `autoApprove`)

\* `--disabled` (writes `"disabled": true`)

\* `--env KEY=VALUE` (repeatable; writes `env` entries)



\*(Flags reflect the Phase-1 plan you established across other clients and map cleanly to Kiro’s schema.)\*



\### 8.3 Install helpers Alph may invoke (opt-in via flags)



\* \*\*Python\*\*: ensure `uv` installed (or fall back to `pipx`) before using `uvx`.

\* \*\*Node\*\*: use `npx -y` path; optionally pre-install server packages.

\* \*\*Docker\*\*: verify daemon running if server uses Docker (GitHub MCP case).

&nbsp; (Install is optional; users can bring their own environment. Config writing works regardless.)



---



\## 9) Turn-key snippets Alph can generate



\### 9.1 Add \*\*Brave Search\*\* server (Node, local STDIO)



```json

{

&nbsp; "mcpServers": {

&nbsp;   "web-search": {

&nbsp;     "command": "npx",

&nbsp;     "args": \["-y","@modelcontextprotocol/server-bravesearch"],

&nbsp;     "env": { "BRAVE\_API\_KEY": "…"}

&nbsp;   }

&nbsp; }

}

```



(\[Kiro]\[1])



\### 9.2 Add \*\*AWS Docs\*\* server (Python via uvx, local STDIO)



```json

{

&nbsp; "mcpServers": {

&nbsp;   "aws-docs": {

&nbsp;     "command": "uvx",

&nbsp;     "args": \["awslabs.aws-documentation-mcp-server@latest"],

&nbsp;     "env": { "FASTMCP\_LOG\_LEVEL": "ERROR" }

&nbsp;   }

&nbsp; }

}

```



(\[Kiro]\[2])



\### 9.3 Add \*\*Remote\*\* server (SSE endpoint via `mcp-remote`)



```json

{

&nbsp; "mcpServers": {

&nbsp;   "my-remote-mcp": {

&nbsp;     "command": "npx",

&nbsp;     "args": \["mcp-remote","https://example.com/api/mcp/123","--transport","sse"]

&nbsp;   }

&nbsp; }

}

```



(\[Kiro]\[2])



---



\## 10) OS path templates Alph should display in UX



\* \*\*User/global\*\*



&nbsp; \* macOS/Linux: `~/.kiro/settings/mcp.json`

&nbsp; \* Windows: `%USERPROFILE%\\.kiro\\settings\\mcp.json`

\* \*\*Workspace/project\*\*



&nbsp; \* macOS/Linux: `<project>/.kiro/settings/mcp.json`

&nbsp; \* Windows: `<project>\\.kiro\\settings\\mcp.json`

&nbsp;   (Directly aligned with Kiro docs; Windows user path derived from `%USERPROFILE%`.) (\[Kiro]\[1])



---



\## 11) Gaps \& how to resolve them



1\. \*\*Native HTTP/URL keys\*\* — Kiro’s schema has \*\*no\*\* `url/httpUrl` field; remote endpoints require `mcp-remote`.



&nbsp;  \* \*\*Action\*\*: keep Alph’s generator strictly on `command/args`; do \*\*not\*\* emit URL fields for Kiro. (Verified by Kiro config page \& servers page.) (\[Kiro]\[1])



2\. \*\*Transport negotiation\*\* — Kiro does not expose per-server transport flags beyond what the \*\*spawned command\*\* supports.



&nbsp;  \* \*\*Action\*\*: encode transport choice in the \*\*template\*\*: native servers → STDIO; remote → `mcp-remote --transport sse`. (\[Kiro]\[2])



3\. \*\*Auto-approval policy\*\* — No central policy APIs; only JSON list.



&nbsp;  \* \*\*Action\*\*: Alph should default to \*\*empty\*\* `autoApprove` and surface a warning tooltip citing Kiro’s best-practices page. (\[Kiro]\[5])



4\. \*\*Restart semantics\*\* — Kiro requires restart to pick up changes.



&nbsp;  \* \*\*Action\*\*: after write, Alph prints “Restart Kiro to apply.” (Doc states restart needed.) (\[Kiro]\[1])



5\. \*\*Remote security\*\* — Kiro warns about remote MCP risk.



&nbsp;  \* \*\*Action\*\*: Alph shows a confirmation step when `--remote-url` is used (cite Kiro’s warning). (\[Kiro]\[2])



---



\## 12) Quick validation checklist (for Alph QA)



\* \*\*Writes to correct path\*\* per scope; preserves unknown keys; JSON remains valid.

\* \*\*Local STDIO\*\* server starts (user can see it in MCP tab; tools execute). (\[Kiro]\[4])

\* \*\*Remote\*\* server via `mcp-remote` connects to SSE endpoint.

\* \*\*Env injection\*\* functions (API keys present; secrets not logged).

\* \*\*`autoApprove` empty\*\* by default; toggling adds named tools only.

\* \*\*Restart prompt\*\* shown after write; \*\*logs pointer\*\* surfaced (“Kiro – MCP Logs”). (\[Kiro]\[4])



---



\### Final accuracy pass



\* Config \*\*shape/keys\*\*, \*\*file paths/merge precedence\*\*, \*\*enablement \& logs\*\*, \*\*local via command/args\*\*, and \*\*remote via `mcp-remote` SSE\*\* all pulled straight from Kiro docs and examples. Citations inline. (\[Kiro]\[1])

\* If additional client behaviors emerge (e.g., new native HTTP transport keys), we’ll detect them by re-checking the \*\*Configuration\*\* and \*\*Servers\*\* pages and release a small generator update.



\[1]: https://kiro.dev/docs/mcp/configuration/ "Configuration - Docs - Kiro"

\[2]: https://kiro.dev/docs/mcp/servers/ "Servers - Docs - Kiro"

\[3]: https://modelcontextprotocol.io/docs/concepts/transports?utm\_source=chatgpt.com "Transports - Model Context Protocol"

\[4]: https://kiro.dev/docs/mcp/ "Model Context Protocol (MCP) - Docs - Kiro"

\[5]: https://kiro.dev/docs/mcp/security/ "Best Practices - Docs - Kiro"



