# Cohere North — Platform Reference

> **Source:** `https://private.docs.cohere.com` (gated enterprise docs), read directly via browser.
> **Captured:** 2026-08-05
> **Purpose:** Working reference for the Aramco SROP / Goal Optimizer demand-forecasting POC.
> **Trust rule:** everything below is transcribed from the docs. Anything marked `[UNVERIFIED]` is inference,
> not documentation. Anything marked `[GAP]` is a page not yet read.

---

## 1. Platform at a glance

North is Cohere's agentic AI platform — enterprise-deployed, connects to internal systems, respects
existing source-system permissions (delegated access, no new permission layer).

**Core surfaces:** Chat · Document Mode · Table Mode · Deep Research · Agents · Automations · Tables · My Files / Libraries · Admin · API

### Feature maturity (matters for a 2-day build)

| State | Meaning |
|---|---|
| **Alpha** | Incomplete, unstable, no SLO, minimal UX polish. Optional toggle in Admin UI. |
| **Beta** | Feature-complete for user stories, backwards compat NOT guaranteed, best-effort recovery SLO. |
| **GA** | Production-ready, stable API/UX, defined SLOs, enabled by default. |

### State of the things we care about

| Feature | State | Note |
|---|---|---|
| Chat | GA | |
| Custom agents | Beta | |
| Document creation | Beta | |
| **Automations** | **Alpha** (user guide) / **Beta** (AI-assistant page) | Docs are inconsistent — treat as pre-GA either way |
| **AI assistant in builder ("Otto")** | **Alpha** | Admin must enable |
| Tables | Alpha | |
| **Data interpreter** | **GA** | ← safest compute path |
| **Code sandbox** | **Alpha** | More powerful, less stable |
| My files | GA | |
| Libraries | Alpha | |
| Web search | GA | |
| Compass search | GA | |
| RBAC | GA | |
| **North API** | **Alpha** | |
| 3rd-party model support | Alpha | OSS / OpenAI-compatible |

### Release calendar (as documented)

| Version | Quarter | Release date |
|---|---|---|
| v1.13.0 | Q3 '26 | July 24, 2026 |
| v1.14.0 | Q3 '26 | August 21, 2026 |
| v1.15.0 | Q3 '26 | September 18, 2026 |

Third-party licence North recommends buying: **Tavily** (powers the web search tool).

---

## 2. Agents

Two kinds:

- **Default agent** — one per user, private, cannot be shared, has access to all connected data sources.
  Customizable only by model choice + custom instructions.
- **Custom agent** — user-created, built for a specific workflow. Can be private, shared with named users,
  or shared org-wide. Requires the `can create agents` permission.

### Creating a custom agent (UI flow)

1. **Agents → New Agent**
2. **Agent name**
3. **Description**
4. **Select model** — look for the `Vision` tag (image interpretation) and `Reasoning` tag (step-by-step decomposition)
5. **Custom instructions** — Markdown. This is where persona, domain rules, and output format go.
6. *(Advanced, admin-gated)* **Disregard platform instructions** toggle — replaces North's default agent
   preamble with yours entirely. **Use this for strict-JSON parser agents.**
7. **Conversation starters** — up to 4 example prompts, shown in the chat view on a new conversation
8. **Capabilities tab** — toggle built-in abilities (see §4)
9. **Sources tab** — connect data (My Files, Google Drive, OneDrive, Gmail, Slack, Salesforce, SharePoint, Exchange, Outlook, Jira)
10. **Custom** — MCP-based org-specific tools
11. **Sharing** — type user/email into *People with access*, or select **Company** for org-wide
12. **Live preview panel** on the right — test the agent as you build, before saving
13. **Create agent**

### The docs' own example instruction shape (worth copying)

Their legal-review example uses this skeleton, which is a good template for our parser agents:

```markdown
You are a <role> performing <task> for <audience>.

## Your job
<scope, and an explicit statement of what the agent is NOT doing>

## What to flag        (or: What to extract)
- <explicit enumerated rules>

## What to ignore
<explicit negative scope — keeps output clean>

## Output format
For each item:
- **Field**: [value]
...
End with <summary requirement>.
```

Takeaway: North's own house style is **explicit positive scope + explicit negative scope + literal output template.**

### Agent data-access permission models (important for demos + sharing)

| Source type | Rule |
|---|---|
| **Google Drive / SharePoint** | Effective access = agent scope ∩ *the asking user's* native permissions. Sharing an agent never expands anyone's data access. If User B lacks folder Y, the agent refuses for User B even though User A gets answers from Y. |
| **My Files** | **No per-user ACL once attached.** Anyone the agent is shared with can read the agent's attached My Files. (But only the file owner can download the original.) |
| **Exchange / Outlook** | Agents with these attached **cannot be shared at all** — they stay private. |
| **Model access** | Runs against the **agent owner's** model permissions, not the user's. If admin revokes the owner's model access, the agent breaks immediately for everyone with `Agent owner does not have access to this model`. A user can override with their own model, which is then checked against *their* permissions. |
| **Jira** | The only source with both **read and write** access. |

---

## 3. Automations

Graph-based multi-step workflow builder. Nodes are connected on a canvas; agents can be used as nodes.

### Page structure

| Tab | Purpose |
|---|---|
| **Discovery** | Browse + run automations (yours and shared-with-you). Two sections: *Your automations*, *Shared with you*. |
| **Runs** | Your run history — Active / Scheduled / Completed |
| **My builds** | The builder. Drafts, published versions, duplicate, import/export |
| **Monitor** | Builders review runs on automations they built, including other users' runs |

Tabs are permission-gated and may not all be visible.

### Permissions (set in North Admin → Permissions)

- `Can build automations` → My builds, Monitor
- `Can view automations` → Discovery, Runs
- `Can administer automations` → both

Automations require the **Inngest** workflow engine (on by default in most deployments).

---

### 3.1 Node types — the definitive table

Added via the **+** button. Menu is split into **Components** (LLM, Agent) and **Behaviors** (Conditional, Human review, Loop).

| Node | Configure tab | Advanced tab |
|---|---|---|
| **LLM** | Instructions · attach My files & libraries · choose allowed Tools · select Model · Output (unstructured text or structured fields) | Max output tokens · **Temperature** · Retries on failure · Default value on failure |
| **Agent** | Select one pre-existing agent (personal / shared-with-you / company) · Instructions · Output (unstructured or structured) | Max tokens · Custom instructions · Retries on failure · Default value on failure. **Temperature read-only.** Tools & model NOT editable. |
| **Conditional** | Up to **6 branches** (If / Else if…) with And/Or condition groups. Always includes a default **Else** path. | N/A |
| **Human review** | Reviewer instructions · one or more review fields (**Text / Files / Single-select**) | Notifications (in-app + tool-call) · **Review timeout** |
| **Loop** | **For Each** or **Do While** | N/A |

**LLM vs Agent node — when to use which:**
- **LLM node** = write behaviour from scratch in the builder. Full control incl. temperature. Attach files per node.
- **Agent node** = reuse a pre-built agent with curated sources/tools. Reusable building block across automations.
  Docs explicitly frame this as the "Architect builds foundational agents as drag-and-drop template blocks" pattern.

**Code sandbox in nodes:** toggle on for LLM and Agent nodes. Each automation node gets its **own sandbox
session**, isolated from any triggering conversation's sandbox. Files and state do **not** carry over.

**Failure handling:** on failure North retries up to `Retries on failure`. If it still fails and
`Default value on failure` is enabled, that value becomes the node output so downstream nodes can continue.
Without a default, the node is marked failed and the run blocks. Upper retry limits are admin-capped.

**Model unavailability:** importing an automation from another instance with a missing model raises a warning;
replacing the model replaces it across all nodes using it at once.

---

### 3.2 Inputs

Defined in the **Inputs** panel (top-right Control panel). Referenced with `@` in any Configure-tab text field,
or `{{inputs.name}}` in expressions.

| Type | Extra settings |
|---|---|
| Text | — |
| Files | File type(s): Documents and/or Images · Allow multiple uploads |
| Single/Multi-select | Allow multiple selections |
| Boolean | Display type: Dropdown or Checkbox |
| Number | Whole number or Decimal |
| Date / time | Date & time, Date only, or Time only |

- **Input type cannot be changed after creation.** Other settings can.
- `Mark as optional` reveals a **Default value** field. Optional + no default = blank at run time.

---

### 3.3 Referencing data between nodes

- **`@` notation** in any Configure-tab text field opens a menu of: upstream node outputs, automation inputs,
  attached files/libraries. You can also define new inputs from that menu.
- A node can reference **multiple** upstream nodes, not just its immediate predecessor.
- Expression form: `{{inputs.name}}` and `{{results.node_name.output.text}}`
- Nodes must be connected (directly or indirectly) for referencing to work.

---

### 3.4 Structured outputs — the key to reliable hand-offs

On **LLM and Agent** nodes, `Output` can be:

- **Unstructured** — plain text (default)
- **Structured** — defined fields that downstream nodes reference individually

Build the schema two ways:

**Visual (`+ Add field`)** — per field: Field name · Description · Field type (Text/Number/Boolean) ·
Required · **Pattern (regex)** · **Format** (None/Date/UUID) · **Allowed values** (fixed enum)

**`Edit JSON`** — paste a JSON schema, then Apply:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age":  { "type": "integer" }
  },
  "required": ["name", "age"]
}
```

> **This is the single most important feature for our POC.** Every parser/extraction agent
> (Contracts, Customer Signal, Context, Rejection Classifier) should use structured output with
> `Allowed values` enums rather than free text.

---

### 3.5 Conditional nodes

Up to 6 branches. Each branch has 1+ conditions combined with **And** / **Or**.
Per condition: **Input** (an automation input or upstream node output) · **Operator** · **Value**
(typed literal, or `@` to pick a field). **Text comparisons are case-sensitive.**

Only the first satisfied branch executes. Branches can be merged downstream.

**Operators by input type:**

| Type | Operators |
|---|---|
| Text | Equal to · Not equal to · Contains · Starts with · Ends with · Is empty · Matches |
| Number | Equal to · Not equal to · Less than · Less than or equal to · Greater than · Greater than or equal to · Is empty |
| Boolean | Equal to · Not equal to · Is empty |
| Date/time | Is exactly on · Is not exactly on · Is before · Is before or on · Is after · Is after or on · Is empty |
| Single/Multi-select | Equal to · Not equal to · Contains · Starts with · Ends with · Is empty · Matches |

---

### 3.6 Loop nodes

Add nodes *inside* a loop node; they repeat each iteration. You choose which interior node's last value the
loop exposes downstream as its output.

**For Each** — iterate a list (automation input, prior node output, or custom values).
`Enable parallel execution` runs iterations concurrently — only if iterations are independent.
Inside the loop, `@` exposes: **Current item**, **Iteration number**, and the last iteration's value of an output.

**Do While** — repeat until a condition is false (docs' own example: *"revise an email until it receives a
human's approval"* — exactly our rejection loop).
`Max iterations` under Advanced settings; **default 100**, must be between **2 and 1000**, admin-configurable
at Admin → Configuration → Automation Settings → Loop Node Settings.
**If the condition is still true at the limit, the workflow FAILS** rather than continuing.
Inside the loop, `@` exposes: **Iteration number** and the last iteration's output value.

---

### 3.7 Human-in-the-loop (HITL)

The **Human Review** node (under *Behaviors*) pauses the run and waits for human input.

**Configure tab:** Reviewer instructions + `+ Add field` (each needs a **Field label** — required for the
automation to run). Field types:

- **Text** — free text input
- **Files** — Documents (PDF/CSV/DOCX) and/or Images (PNG/JPEG); `Allow multiple uploads` toggle
- **Single Select** — dropdown, populated with `+ Add item`

Multiple fields in one node = a chained review step. Docs' recommended pattern:
**Single Select for the decision → Text for detailed feedback → Files for optional supporting docs.**

**Advanced tab:**
- **Notifications** — *In-app* (goes to whoever ran the automation, links to the review page) and
  *tool-call / custom* notifications that fire immediately before the pause (e.g. via an MCP server;
  can include a **Review Page URL** field).
- **Review timeout** — how long the run waits before failing. Presets (15m, 1h, 7d) or custom
  Days/Hours/Minutes. Admin-capped.

**Who can review:** each HITL node execution generates a **unique review page URL**. Only users who have that
URL *and* **View permission** on the automation can access it and submit.

**Behaviour:** execution pauses; the reviewer must complete all required fields and click **Update task**;
that finalizes the review and resumes execution. Timeout → run status **Failed**. Run summary shows
**Time in review**. In the test interface the node shows an **Action required** tag and a **Review** button.

**HITL + Conditional = the approval workflow.** Reviewer input becomes an output referenceable by downstream
nodes. Documented patterns:
- **Basic approval** — Single Select captures Approve / Do not approve → Conditional routes
- **Multi-stage review** — HITL → Conditional gate → second HITL, so only approved items reach stage 2
- **Text-feedback routing** — Conditional `Contains` on the reviewer's free text (e.g. "urgent") to pick a path
- **File-based routing** — route on uploaded file metadata/type

---

### 3.8 Testing

- Every node has a **Testing** tab — test nodes individually, debug as you build.
- Node outputs are **cached for your building session**. Testing a downstream node reuses saved upstream
  outputs, so you don't re-run the whole chain each time.
- Cached outputs appear on the Testing tab as `Run of <upstream node name>` rows.
- Caches are **cleared when you leave the builder**, and **invalidated when you change an upstream node's
  config** (upstream nodes then auto-re-run to propagate). You can clear one manually.
- If admin enabled `Configuration > Chat Stream Settings`, test output streams live.
- Test results report success/failure, duration, and token count.
- End-to-end: the **Test** button in the Control Panel.

---

### 3.9 Saving, versioning, publishing

- Drafts **auto-save** as you work. Header shows *Unsaved changes* until the save completes.
- Drafts are **not usable until published.**
- Version label in the header (e.g. `v2.1.0`) → click to open **Automation history**: read-only views of past
  versions, green badge on the live one, **Restore** button (discards unpublished draft changes).
- Publish with a **Version type**: Major / Minor / Patch, plus **Version notes**.
- Publish from the builder's **Publish changes** button, or the three-dots menu in My builds.

**Changes column statuses:** `Draft` (never published) · `Up-to-date` · `Modified` (unpublished draft changes)

**Visibility:** `Public` (all users, appears in Discovery) · `Limited` (configured set of users) ·
`Private` (only you — use this to effectively unlist a shared automation)

**Publish-blocking validation errors:**

| Level | Error |
|---|---|
| Automation | At least one node must exist |
| Automation | Nodes must be connected in a single flow |
| Automation | Automation must have a name |
| Node | Missing prompts, models, or system prompts |
| Node | Incomplete node configuration |
| Node | Deleted or inaccessible file/library attachments |

Deleted/inaccessible references also **block testing**. If the AI assistant is enabled, an **auto-fix** option
sends the validation errors to the assistant in Build mode.

---

### 3.10 Running, scheduling, monitoring

**Running (Discovery tab):** open an automation → details panel shows Name, Description, Owner, Tools,
**Required connections** (may prompt to authenticate), Inputs, **Tasks** (nodes in execution order),
Previous runs, **Version** (number, publish date, version notes). Fill required inputs → **Run**.
Three-dots → **Duplicate** to copy it into your own builds as a template.

**Action-taking MCP tools:** connectors capable of taking action are tagged **Action-taking**; launching such
an automation shows an approval modal. Tool actions may be irreversible.

**Model gate:** running an automation whose underlying model you lack access to is blocked with an error.

**Cancel:** click the in-progress run → **Cancel** (top right).

**Schedule:** in the same section — hourly / daily at a time / weekly, or a **manual cron expression**.
Scheduling requires all *required* inputs to be filled first.

**Run viewer:** nodes appear under **Tasks** as they complete; click a task to inspect Inputs and Outputs;
final results in the **Output** panel. In-app notification on completion/failure if you navigate away.
- **Succeeded after retry** — green arrow on LLM/Agent task rows that failed then succeeded
- **Review timed out** — HITL exceeding Review timeout → run **Failed**

**Runs tab sections:** Active (queued/in progress) · Scheduled (plans; status = Set/Disabled, with a next-run
Schedule column) · Completed (Success / Failed / Canceled, with a Ran timestamp). Search, sort by Ran,
filter by status, filter by trigger (Manual / Scheduled).

**Monitor tab fields:** Automation name · Status (Queued/Running/Completed/Failed) · Started · Ran by ·
Run time · Input tokens · Output tokens

**Document Mode:** an automation's output can be opened in Document Mode to iterate on the draft.

---

### 3.11 Final output template

Every automation ends with a **text output**. Configure via the **gear icon** in the Inputs panel (top-right) →
Settings modal → **Output template**.

- **No LLM is involved at this stage** — it's pure templating.
- Respects **markdown** formatting.
- Can reference **any** input and **any** node output, regardless of position in the execution graph.
- Referencing a conditional node filters it out of the input.

---

### 3.12 Import / export

Export from **My builds → three-dots → Export build** (JSON). Import via **+ New automation → Import from computer**.

**Included:** schema version · export timestamp · metadata (name, description, visibility, publication status) ·
complete graph spec (nodes, edges, inputs) · output template · dependency manifest (models, tools, providers) ·
node configurations · display positions. *The latest published version is what gets exported.*

**Excluded:** automation IDs · creator info · execution history · **schedules** · timestamps

Use case: moving automations between North instances (e.g. dev → customer deployment).

---

### 3.13 AI assistant ("Otto")

Alpha. Admin enables at **Admin → Configuration → Automation Settings → Assistant Settings** (custom display
name configurable; defaults to *Otto*).

On a new empty automation the builder opens with a centre chat input. `Create from scratch` skips it.
You can attach files for reference and change the assistant's model.

**Modes:**

| Mode | Behaviour |
|---|---|
| **Build** | Edits the canvas directly — adds/updates nodes as you describe |
| **Plan** | Proposes edits for approval; returns a plan you can review and critique before anything is built |
| **Ask** | Answers questions only; never touches the canvas |

Closing the panel does not cancel in-flight work. Reopen with **Edit with Otto** (bottom-left).
Chat history icon (top right of the panel) resumes previous conversations for that automation.

---

## 4. Tools

Three categories:

| Category | Description |
|---|---|
| **Capabilities** | Built-in North features (document mode, table mode, deep research, data interpreter, code sandbox, libraries, my files, web search) |
| **Sources** | Connectors to external systems (Slack, Google Drive, Salesforce, Outlook, …) |
| **Custom** | Org-specific tools via **MCP** |

**Delegated access model:** North does not create new permission structures. API-only tools enforce
platform-native permissions; Compass-indexed tools additionally do real-time permission validation on retrieval.

### Full tool table

| Tool | Type | State | Notes |
|---|---|---|---|
| **Data interpreter** | Capability | **GA** | Server-side Python console for tabular data |
| **Code sandbox** | Capability | Alpha | Python REPL + bash shell, package install |
| My files | Capability | GA | |
| Libraries | Capability | Alpha | Admin-gated |
| Web search | Capability | GA | Cannot access authenticated pages |
| Exchange | Connector | GA | |
| Gmail | Connector | Alpha | Attachments not supported |
| Google Drive | Connector | Alpha | |
| OneDrive | Connector | GA | |
| Outlook | Connector | GA | |
| SharePoint | Connector | GA | Powered by Atlas |
| Salesforce | Connector | Alpha | SOQL, no data sync |
| Jira | MCP source | Beta | **Read + write** (only source with write) |
| Jira (legacy) | Connector | Deprecated | |
| Linear | MCP source | Beta | Dynamic client registration |
| Notion | MCP source | Beta | Dynamic client registration |
| Slack | MCP source | Beta | |
| Slack (legacy) | Connector | Deprecated | |

### Data Interpreter (GA) — our workhorse

- Reads **full contents** of CSV / XLSX / XLS — not just a preview — at cell level
- Sources: My Files, Google Drive, SharePoint, OneDrive, Outlook/Exchange attachments
- Filters, looks up, calculates, analyses; produces **charts inline**; generates new/modified downloadable files
- **Does NOT run on Word, PDF, or PowerPoint** — those go through standard document search
- **Isolated environment, no external network access**
- **Libraries available are fixed and pre-approved: `pandas`, `numpy`, `openpyxl`, `matplotlib`, `seaborn`,
  and the Python standard library.** ← no `statsmodels`, no `scipy`, no `prophet`, no `sklearn`
- All generated code is visible to the user
- Session-based, runtime-only, destroyed after use
- Enabled by default; admin can disable at Tools & MCP → Tools → *Analyze and visualize data*
- The model chooses whether to invoke it; Cohere's models "reliably" do

### Code sandbox (Alpha) — more power, less stability

- **Persistent Python REPL** — variables, imports, installed packages carry over between calls in the same conversation
- **Interactive bash shell** — install packages, move files, run scripts
- Can **download files from the internet if policy permits**
- Attach sandbox files to the conversation for viewing/download
- Read-only inputs: current-chat attachments, My Drive files, connected local libraries, MCP-fetched files.
  The model copies files if it needs to modify them.
- Generates GIF/JPEG/PNG/WEBP via matplotlib inline; CSV and XLSX for download
- **Sandbox files panel** (top-right icon): *Attached by Me* and *Created by Agent* tabs, with search, size, last-updated
- Activity line above the response (e.g. `Used sandbox_run_python • 1 resource read`) expands to show actual commands
- `[source]` citation links for sandbox-derived answers
- Enabling **Skills** auto-enables and locks the Code sandbox toggle
- Requires admin deployment + enablement + user grant

> **Trade-off for the POC:** Data interpreter is GA but library-locked. Code sandbox is Alpha but can
> `pip install statsmodels`. If the forecast method needs anything beyond pandas/numpy, we need the sandbox —
> and should verify it's deployed on the hackathon instance on day 1, not day 2.

---

## 5. Files, My Files, Libraries

### Supported upload formats (My Files, frontend)

`CSV` `TXT` `MD` `HTML` `HTM` `DOC` `DOCX` `PPTX` `PDF` `XLSX` `XLS` `HWP`

### Limits

- **Max 50 MB per file** (subject to org config)
- **MyDrive total: 100 MB across all files** (Compass sync processing limit)
- SharePoint / OneDrive: 500 MB
- Files that are entirely images (e.g. scanned PDF with no text layer) are **not supported**
- File name encoding: **Latin alphabet only**
- Tabular row data is **not searchable** — Data interpreter must be enabled for CSV/Excel questions

### My Files behaviour

- Upload from the My Files page or the chat `+` button (chat uploads persist to My Files)
- **Smart Search status badges:** `Enhanced` (indexed, ready) · `Enhancing` (in progress, file still usable
  directly) · `Enhancing failed` (click badge to retry)
- **Preview** (if admin-enabled): hover for a text snippet; expand for a full viewer.
  PDF, DOCX, PPTX, MD, TXT, HTML/HTM, CSV, XLSX, XLS render natively (spreadsheet tabs, slide browsing, zoom).
  Files > 2 MB don't render in-browser.
- **Default agent** + My Files with no selection = searches **all** your indexed files.
  **Custom agents must select specific files.** Wait for sync (lightning-bolt icon) before use.
- `@` in the chat input highlights/prioritizes a specific file without pre-connecting it to the agent
- Only the **owner** can download or delete. Deleting warns which agents are affected.

### Libraries (Alpha)

Named groups of files from local uploads, My Files, or SharePoint/Exchange/Outlook/OneDrive.
Attach to agents (Sources tab → *Select libraries*) or to chats (composer `+` → Libraries, admin-gated).

**Sharing:** only **My Files libraries** can be shared directly (Private / Limited with Reader-or-Editor /
Company). Local-file and Microsoft-connector libraries can only be shared indirectly via a shared agent.
When library sharing is **on**, sharing an agent that uses a My Files library **fails** unless every recipient
already has ≥ Reader access to that library.

Removing a file from a library disassociates it — it does not delete it from My Files.
Outlook/Exchange libraries have an admin-set **Sync window** (e.g. "Last 60 days").

---

## 6. Table Mode (Alpha)

AI-powered spreadsheet — a grid where each column has a prompt and the agent fills the cells.

- New tables start with two columns: `Company` (Short Text), `Company URL` (URL)
- **Column types:** Single line text · Long Text · Single Select · Multi-Select · URL · File · Number · Date
- **Column properties:** Title · Type · `ENABLE AI` toggle · **Prompt** · `@Add Context` · **Tools**
- Reference other columns in a prompt with `@ColumnName`
- Attach files to a column (from My Files or direct upload) — **every attached file grounds every cell in that
  column**; reference explicitly with `@filename` or leave it implicit; citations render
- Tools per column: **Data interpreter**, **Web search**, My Files
- **Run granularity:** single cell · selected range · whole column (header dropdown → Run Column) · row(s)
- `Stop Queued Cells` (bottom-left) halts queued work
- **Must click Save** after configuring a column
- Requires the Tables feature flag in North Admin

> Potentially useful for our POC as the **batch-parse-many-contracts** surface, as an alternative to a
> For Each loop over contract documents. `[UNVERIFIED]` whether Tables can be invoked from an Automation.

---

## 7. Models

### North Large 01-2026 (`north-large-01-2026`)

| Property | Value |
|---|---|
| Architecture | 218B-parameter Mixture of Experts, 25B active per forward pass |
| Succeeds | Command A Reasoning |
| Quantization / serving | FP8 for H100, vLLM |
| Modalities | **Input:** text + images · **Output:** text only |
| Input max context | **256K tokens** |
| Output max context | **32K tokens** |
| Languages | 48, incl. all 24 official EU languages |
| Availability | Exclusively through North partnerships |

Strong at: chat, generation, summarization, RAG over large corpora, Q&A, **agentic tool calling**, maths,
reasoning, code, multilingual, **tabular data manipulation**, vision input.

**Documented limitations:**

| Limitation | Workaround |
|---|---|
| Max **20 images per request** | Upload PDFs and use North's visual document processing |
| Citations can be absent in long multi-turn conversations | — |
| Citations tend to be absent in **Document Mode** | — |

**Benchmarks vs Command A Reasoning** (higher is better):

| Benchmark | North Large 01-2026 | Command A Reasoning |
|---|---|---|
| North Q&A English (LTMQ) | .68 | .45 |
| North Q&A Multilingual | .61 | .29 |
| DeepResearchBench | .49 | .479 |
| Image Q&A (MDR-v2) | .80 | (not multimodal) |
| EverydayEval v2 | .55 | .43 |
| Tau2Telecom (agentic) | .81 | .37 |
| IFEval (instruction following) | .64 | .49 |
| Scale MultiChallenge | .40 | .25 |
| Mercor Consulting | .18 | .02 |
| GDPVal | .34 | .25 |

**Safety:** agentic safety 71.1% without guardrail, **79.3% with** Cohere's first-party Safety Guardrail
(vs Command A chat-only 72.7%). Localized safety 88.6% vs Command A 72.6%. Optimized for 9 non-English
languages incl. **Arabic**, with deep cultural localization for Modern Standard Arabic, Korean, Japanese, French.

**Latency:** ~20% lower than Command A Reasoning at similar throughput; ~20% higher at high concurrency.
Deployment configs: 4× H100 80GiB (TP4, FP8) or 2–4× B200 192GiB.

---

## 8. North API (developer guide) — Alpha

**Base URL:** `https://{your-north-instance}/api`

### Auth

| Header | Value |
|---|---|
| `Authorization` | `Bearer <your-token>` |
| `Content-Type` | `application/json` |

**Get a token:** append **`/developer`** to your North instance URL in the browser
(e.g. `https://north.cohere.com/developer`) and copy the value under *Retrieve your token*.

**Machine-to-machine:** `POST /v1/token/exchange` for federated identity (GitHub OIDC, Microsoft Entra);
OAuth applications + MCP for actor-token + per-request subject-token exchange; OAuth 2.0 flows via the SDKs
(authorization code w/ PKCE, client credentials, device code).

**IAP deployments:** a `401` with `Invalid IAP credentials: JWT signature is invalid` means you're behind an
Identity-Aware Proxy and need an extra header (e.g. `__Host-GCP_IAP_AUTH_TOKEN_xxx`), passed via
`request_options.additional_headers`.

### First call

```bash
export MY_TOKEN=<paste-your-token-here>
export MY_NORTH="north.cohere.com"

curl -sS "https://$MY_NORTH/api/v1/chat" \
  -H "Authorization: Bearer $MY_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "messages": [{"role": "user", "content": "Hello, North"}],
    "stream": false,
    "thinking": {"type": "disabled"}
  }'
```

Response shape: `{ conversation_id, finish_reason, messages[], usage{ billed_units, tokens, cached_tokens } }`

### SDKs — Python, TypeScript, Go

```bash
python -m pip install "https://$MY_NORTH/api/v1/sdk/python-latest.tar.gz"
```

Air-gapped: OCI artifacts via `oras pull registry.cohere.com/proxy/<app>/cohere/north-sdk-python:<version>`
authenticated with `$REPLICATED_LICENSE_ID`.

```python
from north import NorthClient

client = NorthClient(
    auth_token="YOUR_TOKEN",
    base_url="https://your-north-instance.com/api",
    timeout=120.0,
)

# streaming
for event in client.chat_stream(messages=[{"role": "user", "content": "..."}]):
    if event.type == "content-delta":
        print(event.delta.message.content, end="", flush=True)

# file upload + reference
file = client.files.create(file=open("report.pdf", "rb"))
response = client.chat(
    messages=[{"role": "user", "content": "Summarize this document"}],
    file_ids=[file.id],
)
```

OAuth env fallbacks: `NORTH_CLIENT_ID`, `NORTH_CLIENT_SECRET`, `NORTH_TOKEN_ENDPOINT`.
Token storage defaults to in-memory; use `FileTokenStorage("/path/to/token-cache.json")` to persist.

### Endpoint map

**Chat / Responses:** `/reference/chat` · `/reference/chat-stream` · `/reference/responses/create` ·
`/reference/responses/create-stream` · `/reference/open-responses-compatibility`

**Agents:** `list` · `create` · `get` · `update` · `delete`

**Automations:** `list` · `get` · **`execute`**

**Executions:** `list` · `get` · `cancel` · `get-node` · `get-file` · **`get-review-task`** · **`submit-review`**

**Files:** `list` · `create` · `batch-create` · `retrieve` · `delete` · `content`

**Libraries:** `list` · `create` · `get` · `update` · `delete` · `create-job` · `get-job`

**Other:** `models/list` · `conversations/{list,get,delete}` · `users/{get-me,update,delete}` ·
`auth/{signup,signin,token-exchange}` · `oauth/{authorize,token,revoke}` · `admin/permissions/*` ·
`guardrails-api` · `mcp-servers` · `permissions` · `errors` · `model-containers`

**MCP development:** `overview` · `quickstart` · `fastmcp` · `interacting-with-north` · `citations` · `observability`

### Key endpoint shapes

**Execute an automation**

```
POST /v1/automations/{automation_id}/execute
Body: { "inputs": { "<input_id>": <typed value>, ... } }
Query: app_id (optional, defaults to "north-api")
```

Runs the **live published version**. The automation must have ≥1 version and be published.
Input values must match the defined input parameters (text, file, or select types).

Returns a `NorthExecution`:

```json
{
  "id": "exec-...", "automation_id": "auto-...", "automation_name": "...",
  "automation_version_id": "v1.3.0",
  "status": "running", "run_origin": "manual",
  "awaiting_human_review": false,
  "tools": [...], "initiator_id": "...", "initiator_name": "...",
  "queued_at": "...", "started_at": "...", "ended_at": "",
  "run_time_seconds": 120, "wait_time_seconds": 0,
  "input_tokens": 350, "output_tokens": 420,
  "inputs": {}, "output": "",
  "usage": { "billed_units": {...}, "tokens": {...}, "cached_tokens": 0 },
  "nodes": [ { "node_id": "...", "status": "...", "output": {}, "error": {},
               "started_at": "...", "ended_at": "", "duration_seconds": 60.5, "usage": {...} } ],
  "output_files": [ { "document_id": "...", "filename": "...", "size_bytes": 245760 } ]
}
```

**Poll an execution**

```
GET /v1/automations/executions/{execution_id}?include_nodes=true
```

`nodes[]` is **only** returned when `include_nodes=true`.
`awaiting_human_review` is **only** available when fetching a single execution with full details.
`run_origin` ∈ `manual | scheduled`.

**Submit a human review (resume a paused run)**

```
POST /v1/automations/executions/{execution_id}/nodes/{node_selector}/review
Body: { "inputs": { "<input_id>": <typed value>, ... } }   // required
→ { "event_id": "evt_..." }
```

The node must be in a waiting state. Once submitted, execution continues with the provided values.

> **This is the programmatic hook for our rejection loop.** A script (or a demo UI) can poll
> `GET /executions/{id}` for `awaiting_human_review: true`, present Output 1/2/3, then POST the planner's
> approve/reject decision + free-text reason back into the paused run.

**Create an agent**

```
POST /v1/agents
```

| Field | Required | Notes |
|---|---|---|
| `name` | ✅ | |
| `visibility` | ✅ | `public` \| `private` |
| `description` | | |
| `preamble` | | ← the custom instructions |
| `temperature` | | ≥ 0 |
| `tools[]` | | function-tool objects |
| `icebreakers[]` | | ← the conversation starters |
| `model` | | |
| `reasoning_options` | | `{ "type": "enabled", "token_budget": 1000 }` |

Response adds `id`, `created_at`, `updated_at`, `use_system_default_model` (default `false`).

**Standard error codes across endpoints:** 400, 401, 403, 404, 422, 429, 500, 503

---

## 9. Admin knobs that constrain a build

**Admin → Configuration → Automations Settings** (`Edit Settings`):

- Graph limits
- String length limits
- Chat API request timeout
- **Cap on `Retries on failure`** for LLM and Agent nodes
- **Cap on `Review timeout`** for Human review nodes
- **Loop Node Settings → Max iterations** (default 100, range 2–1000)
- **Assistant Settings** — enable the AI assistant, set its display name

**Admin → Permissions:** `Can build automations` · `Can view automations` · `Can administer automations`
(attach users or AD groups)

**Other admin-gated things:** Tables feature flag · Libraries + library sharing · file preview · My Files
storage/count limits · Data interpreter (Tools & MCP → Tools → *Analyze and visualize data*) · Code sandbox
deployment · chat stream setting · MCP servers (can be forced always-on for specific users, overriding agent config)

---

## 10. Implications for the SROP / Goal Optimizer POC

### Corrections to `goal-optimizer-poc-scope.md`

| Scope doc said | Reality | Impact |
|---|---|---|
| "Approval checkpoint = Level 5 human-in-the-loop, natively supported" | ✅ **Confirmed.** Dedicated **Human Review** node with Text/Files/Single-select fields, notifications, timeout, and unique review URL. | Build as designed. |
| "Branching/loops = North Automations' branching primitive… shouldn't need to hand-roll orchestration" | ✅ **Confirmed.** Conditional (6 branches, And/Or) **and** Loop (For Each + **Do While**) nodes exist. Docs' own Do-While example is literally *"revise until it receives a human's approval."* | The reject → re-run loop maps 1:1 onto **Do While { … Human Review … } until approved**. |
| "Per-step model selection" | ✅ Confirmed on **LLM** nodes (model + temperature). **Agent** nodes inherit the agent's model and expose temperature read-only. | Use LLM nodes where we need cheap-model-for-parsing. |
| "Plan mode to lay out and review the sequence before wiring it live" | ✅ Exists — but it's the **AI assistant's** Plan mode, which is **Alpha and admin-gated**. | Don't depend on it. Have a manual canvas fallback. |
| "Mock data sources get connected as files/tables in the workspace" | ✅ My Files / Libraries. **But: 50 MB/file and 100 MB total across MyDrive.** | 30 years × monthly × 8 factories × 15 products × 12 customers could blow the 100 MB budget. **Size the generator against this.** |
| Forecast Agent runs "as a tool/code step the agent calls" | ✅ Both Data interpreter (GA) and Code sandbox (Alpha) can. **But Data interpreter is locked to pandas/numpy/openpyxl/matplotlib/seaborn + stdlib.** | Seasonal decomposition / exponential smoothing must be **hand-written in numpy/pandas**, or we must use the Alpha Code sandbox. Decide day 1. |
| Rejection classifier routes free text to the right agent | ✅ Feasible: HITL Text field → LLM node with **structured output + `Allowed values` enum** → Conditional. | **Fits exactly.** A Conditional allows up to **6** If/Else-if branches **plus** an always-present **Else** = 7 paths. Our routing table has 7 rows, and row 7 ("Unclassifiable / low confidence → safe fallback") maps naturally onto the **Else**. Zero headroom, though — adding an 8th category means chaining a second Conditional. |

### Recommended architecture given what North actually offers

```
Inputs: quarter, mock data files, optional customer free-text request

Do While (not approved, max_iterations ~5)
├─ [Agent/LLM] Intake        → structured output
├─ [Agent/LLM] Context       → structured output
├─ [Agent/LLM] Contracts     → structured output   (For Each over contract docs)
├─ [Agent/LLM] Customer Signal → structured output (skipped if input blank)
├─ [LLM + Data interpreter] Integration   → merged quarterly table
├─ [LLM + Data interpreter] Forecast      → draft Output 1 & 2
├─ [LLM + Data interpreter] Constraint Check → clipped + tagged rows
├─ [LLM + Data interpreter] Visualization → Output 3 chart
├─ [Human Review] Planner
│     ├─ Single Select: Approve / Reject
│     └─ Text: rejection reason (free text)
└─ [LLM, structured output, enum] Rejection Classifier → route category
   └─ [Conditional ≤6 branches] → route back into the loop
```

**Notes on this shape:**
- The loop's exit condition reads the Human Review Single-Select = `Approve`.
- `Max iterations` must be ≥ 2. Set it to something small (3–5) so a demo can't hang.
- **Review timeout** must be long enough to survive a live demo — set it generously (hours, not 15m).
  A timed-out review **fails the run**, which would be an ugly thing to happen on stage.
- Structured outputs with `Allowed values` on the classifier make the Conditional reliable —
  don't route on `Contains` over raw free text if you can route on an enum.
- **Text comparisons in Conditionals are case-sensitive.** Enum values must match exactly.
- Every node needs `Retries on failure` + `Default value on failure` set, or one flaky call kills the demo.

### Day-1 verification checklist (do these before building anything)

1. Confirm `Can build automations` permission on our accounts
2. Confirm **Code sandbox is deployed and enabled** — if not, the forecast is pandas/numpy-only
3. Confirm the **AI assistant** is enabled (nice-to-have, speeds up scaffolding)
4. Check **Loop Node Settings → max iterations** and the **Review timeout cap** in Admin
5. Check the **My Files storage limit** on our user, then size the mock data generator to fit
6. Confirm which **models** are available and which carry the `Reasoning` tag
7. Grab a dev token from `<instance>/developer` and smoke-test `POST /v1/chat`
8. Build one throwaway 2-node automation with a Human Review node and **publish it** — proves the
   whole publish → Discovery → run → review path works before we depend on it

---

## 11. Doc URL index

**Base:** `https://private.docs.cohere.com`

### Get started
| Page | Path |
|---|---|
| North Platform User Guide | `/docs/get-started/north-user-guide` |
| Chat | `/docs/get-started/north-chat` |
| Chat capabilities | `/docs/get-started/north-chat-capabilies` |
| Document Mode | `/docs/get-started/north-document-mode` |
| Table Mode | `/docs/get-started/north-table-mode` |
| Deep Research | `/docs/get-started/deep-research` |
| Multimodality | `/docs/get-started/north-automations/building-automations/north-multimodality` |
| Prompting best practices | `/docs/get-started/prompting-best-practices` |
| Citations | `/docs/get-started/using-citations` |
| Sharing & collaborating in chat | `/docs/get-started/sharing-collaborating-chat` |
| Chat history | `/docs/get-started/chat-history` |
| Notifications | `/docs/get-started/notifications` |
| Memory | `/docs/get-started/memory` |
| Supported files | `/docs/get-started/supported-files` |

### Agents & Automations
| Page | Path |
|---|---|
| Agents overview | `/docs/get-started/agents` |
| Creating custom agents | `/docs/get-started/agents/creating-custom-agents` |
| Browsing agents | `/docs/get-started/agents/agent-library` |
| Customizing your default agent | `/docs/get-started/agents/customizing-private-agents` |
| Automations overview | `/docs/get-started/north-automations` |
| Setting up Automations (admin) | `/docs/get-started/north-automations/setting-up-automations` |
| Building Automations | `/docs/get-started/north-automations/building-automations` |
| **Configuring automation nodes** | `/docs/get-started/north-automations/building-automations/configuring-automation-nodes` |
| **Human in the loop** | `/docs/get-started/north-automations/building-automations/human-in-the-loop-automations` |
| Building with the AI assistant | `/docs/get-started/north-automations/building-automations/building-with-the-ai-assistant` |
| Testing automations | `/docs/get-started/north-automations/building-automations/testing-automations` |
| Saving, publishing, monitoring | `/docs/get-started/north-automations/building-automations/saving-publishing-monitoring-automations` |
| Consuming Automations | `/docs/get-started/north-automations/consuming-automations` |

### Tools
| Page | Path |
|---|---|
| Tools overview | `/docs/get-started/tools-overview` |
| Code sandbox | `/docs/get-started/tools/code-sandbox/home` |
| Data Interpreter | `/docs/get-started/tools/data-interpreter/home` |
| My Files | `/docs/get-started/tools/my-files/home` |
| Libraries | `/docs/get-started/tools/libraries` |
| Library upload jobs | `/docs/get-started/tools/libraries/library-upload-jobs` |
| Batch upload to libraries | `/docs/get-started/tools/libraries/batch-upload` |
| Web search | `/docs/get-started/tools/websearch/home` |
| MCP overview | `/docs/get-started/tools/mcp-servers/mcp-overview` |
| North MCP connectors | `/docs/get-started/tools/mcp-servers/north-mcp-connectors` |
| MCP apps | `/docs/get-started/tools/mcp-servers/mcp-apps` |
| MCP elicitation | `/docs/get-started/tools/mcp-servers/mcp-elicitation` |
| MCP prompts | `/docs/get-started/tools/mcp-servers/using-mcp-prompts` |
| MCP resources | `/docs/get-started/tools/mcp-servers/mcp-resources` |
| Gmail / Drive / Jira / Linear / Notion / Salesforce / Slack | `/docs/get-started/tools/<name>/home` |
| Microsoft connectors | `/docs/get-started/tools/microsoft-connectors/*` |

### Models
| Page | Path |
|---|---|
| North Large 01-2026 | `/docs/north-large-01-2026` |
| Evaluating North models (A/B) | `/docs/evaluating-north-models` |

### Security
`/docs/security` · `/data-encryption-at-rest` · `/tool-authentication` · `/mcp-server-authentication` ·
`/tool-authorization` · `/tool-action-approvals` · `/data-syncing` · `/data-sharing` · `/data-deletion` ·
`/python-interpreter-controls`

### API reference
| Page | Path |
|---|---|
| About the North API | `/reference/overview` |
| Quickstart | `/reference/quickstart` |
| Client SDKs | `/reference/client-sdks` |
| IAP auth | `/reference/iap-auth` |
| OAuth public client | `/reference/auth-oauth-public-client` |
| Permissions | `/reference/permissions` |
| MCP servers | `/reference/mcp-servers` |
| Guardrails API | `/reference/guardrails-api` |
| Errors | `/reference/errors` |
| Model containers | `/reference/model-containers` |
| Open Responses compatibility | `/reference/open-responses-compatibility` |
| MCP development | `/reference/mcp-development/{overview,quickstart,fastmcp,interacting-with-north,citations,observability}` |
| Agents | `/reference/agents/{list,create,get,update,delete}` |
| Automations | `/reference/automations/{list,get,execute}` |
| Executions | `/reference/executions/{list,get,cancel,get-node,get-file,get-review-task,submit-review}` |
| Files | `/reference/files/{list,create,batch-create,retrieve,delete,content}` |
| Libraries | `/reference/libraries/{list,create,get,update,delete,create-job,get-job}` |
| Chat | `/reference/chat` · `/reference/chat-stream` |
| Responses | `/reference/responses/{create,create-stream}` |
| Models | `/reference/models/list` |
| Conversations | `/reference/conversations/{list,get,delete}` |
| Users | `/reference/users/{get-me,update,delete}` |
| Auth | `/reference/auth/{signup,signin,token-exchange}` · `/reference/oauth/{authorize,token,revoke}` |
| Admin | `/reference/admin/permissions/*` |

### Other top-level
Deployment `/docs/deployment-overview` · Admin identity `/docs/admin/identity/overview` ·
Changelog `/changelog` · Troubleshooting `/docs/troubleshooting/get-help` ·
Compass architecture `/docs/compass/architecture` · Finance agent guide `/pages/verticals-guides/building-a-finance-agent`

---

## 12. `[GAP]` — not yet read

Pages that exist and may matter, but haven't been captured:

- `Configuring Automation Settings` (admin) — the **full list** of graph limits, string-length limits, and timeout caps
- `Building a finance agent` vertical guide — likely the closest published analogue to our use case
- `Deep Research` page
- `Document Mode` page
- `Memory` page
- `Notifications` page
- `Multimodality in North`
- MCP development pages (`fastmcp`, `interacting-with-north`, `citations`, `observability`) — relevant only if
  we build a custom MCP connector for real ERP data (out of POC scope, in scope for §10 "Beyond the POC")
- `Library upload jobs` / `Batch upload to libraries` — relevant for programmatically loading mock data
- `Guardrails API`, `Permissions`, `Errors` reference pages
- Changelog

---

## 13. Open questions to resolve on the instance, not in the docs

1. Can a **Table** be invoked from inside an Automation, or only from the UI?
2. Does the Data interpreter persist state **across nodes** in one automation run, or is each node isolated?
   (Code sandbox is documented as per-node isolated; Data interpreter isn't stated.)
3. What is the actual `Retries on failure` cap on our instance?
4. Are there per-node or whole-automation execution timeouts beyond the Chat API request timeout?
5. Can a For Each loop iterate over **files** (e.g. a Files-type input with multiple uploads)?
6. Does `submit-review` via API work while the same run is visible in the UI review page?
