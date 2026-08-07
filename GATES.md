# P1 — Platform verification gates

Instance: `https://zhoom.democloud.cohere.com` · Account: Ahmed Alsuhaimi · Tested 2026-08-05 → 08-06

**Result: 7 pass, 1 fail.** G2 (cross-node Data Interpreter) is the only real loss and costs one merged
node. G4 failed as written but was solved by reordering — the Do While loop and the full
reject → re-run → approve cycle are confirmed working on this instance. **Nothing blocks the build.**

| # | Gate | Answer |
|---|---|---|
| G1 | `Can build automations` + custom agents creatable | **PASS** — build rights granted; standalone agents create and save |
| G2 | DI state / generated file survives across two nodes | **FAIL** — sandbox is reset per node execution. Merge nodes 6+7 |
| G3 | Human Review publishes and runs end-to-end | **PASS** — publish → run → pause → review URL → submit → Success |
| G4 | Feedback can travel backwards inside a Do While loop | **PASS via reordering** — `(previous)` never compiles; put Human Review **first** in the body |
| G5 | Loop max-iterations cap · Review-timeout cap | **PASS** — loop **2–1000**, review timeout **7d**. Neither binds |
| G6 | Models available · which carry Reasoning | **PASS** — `north-large-01-2026`, default, Reasoning + Vision |
| G7 | Data Interpreter reaches My Files | **PASS** — agent + DI + library read the real CSV, all seven figures exact |
| G8 | Retries cap · Default-on-failure available | **PASS** — retries capped at **3**; default-on-failure is a free-text box |

---

## Standing decisions

1. **Model:** `north-large-01-2026` for all nine agents. No cheap/strong split exists here, so ignore
   the plan's "Light model" designations (G6).
2. **File access:** everything through the **`srop-data` library**. Files uploaded, 18/18 synced,
   READY. Libraries are mandatory on this instance — the plan's "skip Libraries" is inverted (G7).
3. **Merge nodes 6+7 only.** Node 5 stays (flags only); node 8 stays (60 aggregate rows, re-reads
   `prior_forecast.csv` itself). Row-level data never crosses a node boundary; aggregates do (G2).
4. **Keep the Do While loop — one published automation.** Human Review A goes **first** in the loop
   body so agents read `@Human Review A.reason` same-iteration; Human Review B sits after the compute
   node to display the numbers and capture Approve/Reject. **Never use `(previous)` anywhere** (G4).
5. **Every node:** `Retries` = 3, `Default value on failure` = on, holding a valid empty-shaped value
   matching that node's schema (G8).
6. **Loop max iterations = 4**, review timeout in hours. Both caps are non-binding (G5).
7. **Output template is not optional.** A run with an empty template produces "No output". Write the
   planner-facing summary there, and have Human Review B's reviewer instructions reference the compute
   node so the numbers appear *in the review page* (G3, G4).

## Final node shape

```
Do While  (Human Review B decision != "Approve",  max iterations 4)
├─ [Human Review A]   "What should change?"  → free text; blank on the first pass
├─ 1 Intake · 2 Context · 3 Contracts · 4 Customer Signal · 5 Consistency (flags only)
├─ 6+7 MERGED Forecast & Allocate     ← reads @Human Review A.reason ; row-level work, one execution
├─ 8 Revision view                    ← receives 60 aggregate rows; re-reads prior_forecast.csv
├─ [Human Review B]   reviewer instructions reference the compute node's output
│                     → planner SEES this run's numbers; Single Select Approve / Reject
└─ 9 Rejection Classifier → Conditional   ← reads @Human Review B
```

Eight visible nodes plus two reviews. Only 6+7 merge, so the "nine named reusable agents" deliverable
survives intact. On stage: **see the numbers in B → Reject → next iteration A asks what should change →
type the pinned Ramadan sentence → watch February move → Approve.**

Cost: one extra review pause per iteration. Iteration 1's Review A is a "press go" step — word its
instructions accordingly, or seed it from the `customer_request` Input.

---

# G1 — Build permissions and custom agents · PASS

- Automations surface visible with all four tabs (Discovery / Runs / My builds / Monitor) →
  `Can build automations` is granted.
- Standalone **Agents** surface works: `+ New agent` creates, configures and saves. Confirmed by
  building `zz G7 data probe` end to end. The nine-reusable-agents deliverable is safe.
- Agent nodes available inside the automation builder; LLM nodes too.

# G2 — Data Interpreter state across nodes · FAIL

Test: `zz G2 gate test` — two LLM nodes, both with Data interpreter, connected in one flow, run via the
Control Panel **Test** button (a real run, not two isolated node tests).

**Node 1 (writer)** built a DataFrame, wrote `tmp_g2.csv`:

```
CWD=/home/earth
ABSPATH=/home/earth/tmp_g2.csv
FILES=['.matplotlib', 'NotoSansJP-VariableFont_wght.ttf', 'README.md', 'default.profraw',
       'matplotlibrc', 'notosanskr.ttf', 'tmp_g2.csv']
```

**Node 2 (reader, same run, seconds later)**, instructed explicitly not to create anything:

```
CWD=/home/earth
FILES=['.matplotlib', 'NotoSansJP-VariableFont_wght.ttf', 'README.md', 'default.profraw',
       'matplotlibrc', 'notosanskr.ttf']
RESULT=FILE_NOT_FOUND [Errno 44] No such file or directory: 'tmp_g2.csv'
```

Identical path, identical six stock files, our file gone. The sandbox is **freshly provisioned per node
execution**; in-memory DataFrames die the same way. Run status was **Success** — the pipeline does not
error, it silently loses the data. That is the dangerous version of this failure.

Full 2-node run: 39s, 1931 tokens.

### Vendor docs confirm it is by design, and the escape hatch is closed here

Cohere's docs: the Data Interpreter is *"isolated, session-based, no persistent storage… the virtual
file system is reset between executions to prevent state leakage."* They offer three fixes: pass data
through node output; use an **authorized file store / `s3_proxy`** *"if your deployment supports it"*;
or consolidate into one execution.

Probed the file store directly from inside the sandbox:

| Check | Result |
|---|---|
| Env vars matching `s3`/`PROXY`/`FILE`/`STORE`/`BUCKET`/`COHERE`/`NORTH` | only `__LLVM_PROFILE_RT_INIT_ONCE` — no file-store config |
| `boto3` / `s3fs` / `fsspec` importable | **False / False / False** |
| `requests` importable | **False** — no HTTP client at all |
| `/mnt`, `/data`, `/workspace`, `/var/data`, `/opt/files` exist | **all False** |
| `os.access('/mnt', os.W_OK)` | **False** |
| Writable directories | only `/tmp` and `/home/earth`, both ephemeral |

**No network egress, no shared mount, no object-store client** — and therefore no way to call the North
API from inside a code execution either. Option 2 is closed on this deployment.

### The operative rule: row-level data stays in one execution, aggregates cross

Passing data through node output is real but **bounded** — a node's output is the *model's own message*,
so anything sent that way is re-emitted token by token. Fine for tens of rows, fatal for hundreds.

| Data | Size | Crosses a node boundary? |
|---|---|---|
| Forecast rows, allocation rows | ~720 / ~240 | **No** — stays inside the merged compute node |
| (product, month) aggregates for the revision view | 15 × 4 = **60** | **Yes** — safe as structured output |
| Consistency flags, events, contract terms, signals, row counts | tens | **Yes** |
| Classifier route + rewritten instruction | 2 fields | **Yes** |

**This keeps node 8.** The revision view never needed row-level data — it needs `forecast_now` vs
`forecast_prior` at (product, month), 60 rows, and re-reads `prior_forecast.csv` from the library. Node
5 likewise stays as a validation-only node emitting flags. **Only 6+7 merge.**

Never pass the forecast table through an LLM structured output as a workaround — the model regenerates
the digits and corrupts them silently.

# G3 — Human Review end-to-end · PASS

Extended `zz G2 gate test` with a Human review node, published, and ran the whole path.

1. **Publish works** — Version type Major → **v1.0.0**. Dialog requires Version type, Version notes,
   Automation name (≥3 chars), Description and **Visibility** (`Private` available).
2. **Publish validation catches graph errors before runtime** — blocked the first attempt with
   *"Disconnected nodes — LLM 2 not connected to the main flow"* and the name-length rule. P4 cannot be
   published half-wired.
3. **Appears in Discovery** under *Your automations*, with **Run** and **Schedule** buttons (Schedule
   visible at run time — good for P6).
4. **Run pauses correctly** — `Running` → **`Action required`**, review task highlighted.
5. **Review page has its own URL:** `/automations/execution/<execution-id>?review=true`, showing
   **Action required** and **Due by Aug 12, 2026, 11:55 PM** (7d timeout computed from pause time).
6. **Submission resumes the run** — `Approve` → Submit → **Submitted**, annotated with reviewer and
   timestamp; run flipped to **Success**, execution time **56s**.

**Details worth keeping:**

- Human review field types are richer than the docs imply: Text, Files, **Single/Multi-select**,
  Boolean, Number, Date/time, List, Object. The decision field is a `Single/Multi-select` with
  `Dropdown options` — `Approve` / `Reject`, exact case.
- Review node **Advanced** tab: `Notifications → In-app` (on by default, notifies whoever ran it),
  `+ Add custom notification`, and `Review timeout` defaulting to **`7d`**.
- **Node execution order follows connections, not canvas position.**
- **The run's output panel showed "No output"** — the Output template is empty by default. See standing
  decision 7.

# G4 — Feedback inside a Do While loop · PASS via reordering

Test: `zz G4 loop test`.

### The rule

- ✅ `@<upstream node>` — same iteration, no wrapper → **works**
- ❌ `@<node> (previous)` — any node, any field, any surface → **never compiles**

### What fails, and how it was isolated

Inside a loop, `@` offers `Iteration number`, `<node> (previous)`, and for review nodes the sub-fields
(`reason (previous)`). Inserting any of them fails validation immediately:

> **Invalid expression: Ternary branches must have the same type, got 'string' and 'null'**

The node goes red, `Configure` shows an error badge, and **Test and Publish are both blocked** — a
build-time rejection, not a runtime empty value. Removing the reference → validates and runs
(**Success in 7s**, 1 iteration, clean exit). Re-inserting → the same error. So the reference itself is
the cause. The platform compiles `@X (previous)` into a ternary whose iteration-1 branch is `null` and
whose later branch is `string`, then rejects the mismatch.

**Confirmed on a typed field too:** `@reason (previous)` — a Text field on a Human review node, not a
raw string — throws the identical error. It is not about unstructured output.

**Three routes to coalesce the null, all closed:**

1. **Raw template expression.** The reviewer-instructions placeholder advertises `{{ variables }}`, but
   typing `{{` opens the same chip picker as `@`. It is a trigger alias, not an expression editor —
   nowhere to write `?? "NONE"` or a default filter.
2. **Edit the chip's expression.** The chip is a `contenteditable` span with no expression attributes;
   the mapping lives in app state.
3. **A laxer field.** The same reference in **Human review → Reviewer instructions** throws the
   identical error. Same engine, same type check, every field.

The null branch is generated by the platform's own compiled ternary, so there is no user-facing place
to intercept it.

### What works — proven end-to-end

Reorder the body to **Human review → LLM1**, and have LLM1 reference `@Human review` — a same-iteration,
upstream reference. No ternary, no null, validates cleanly.

**Run result: Status Success · 2 iterations · 15s execution · 1m57s in review · 519 tokens.**

Iteration 1 — reviewer typed `february jet fuel looks light`; the agent's rendered prompt shows the
value arrived, and its output changed accordingly:

```
{"input-FKCuS6Ud": "february jet fuel looks light"}  is the planner's objection from this same iteration...
→ GOT=february jet fuel looks light LOOP_AGAIN
```

Condition `LLM1.contains("LOOP_AGAIN")` → true → **iteration 2 opened a fresh review**. Reviewer typed
`done` → agent emitted `FINISHED` → condition false → **loop exited cleanly with Success**, no
max-iteration failure.

**The planner's typed feedback reached an agent inside the loop and changed its output.** The
reject → re-run → approve cycle is real. See standing decision 4 for the two-review shape that also
lets the reviewer see the numbers.

### Also confirmed here

- Referencing the **whole review node** yields a JSON object (`{"input-FKCuS6Ud": "…"}`). Reference the
  **specific field** (`reason`) to get a clean string.
- **Do While conditions** take `Input` (node outputs only — *no Iteration number*), `Operator`, `Value`.
  Operators: `Equal to`, `Not equal to`, `Contains`, `Starts with`, `Ends with`, `Is empty`, `Matches`.
  Renders as e.g. `LLM.contains("LOOP_AGAIN")`.
- **Do While evaluates body-first** — the body runs once, then the condition is checked. Iteration 1
  always executes before any review exists, which is why Review A needs a "press go" wording.
- A loop whose condition goes false **exits with Success**; the max-iteration failure only bites if the
  condition stays true.
- Node renaming works and references follow the rename. Reordering re-validates references immediately
  — a reference that becomes forward-looking turns red at once.

# G5 — Caps · PASS

- **Loop → Advanced settings → Max iterations:** helper text *"Enter a number between 2 and 1000"*.
  No tighter admin cap. Set the SROP loop to **4**.
- **Human review → Advanced → Review timeout:** default **`7d`**, accepted, and the review page rendered
  a real due date. No tighter admin cap. A review cannot time out mid-demo.
- **Loop type** offers exactly `For Each` and `Do While`. Do While requires a Condition before it
  validates. `For Each` exposes `Loop items`, `Enable parallel execution` (**on by default**) and
  `Max parallelism` — note the parallel default if you ever use it.

# G6 — Models · PASS

| Model | Tags | Use |
|---|---|---|
| `north-large-01-2026` | **Reasoning**, Vision, `cohere_platform` | **Default. Use for all nine agents** |
| `command-a-reasoning-08-2025` | offered in the chat picker | Alternative if north-large misbehaves |
| `c4-ltmq-…`, `gemma-4-31b-it-rl`, `gpt-oss-120b-for-rl`, `north-mini-code-1-0` | Reasoning | Experimental / third-party — do not use |
| `command-r7b-*`, `tiny-aya-*`, `translate-v2-*`, `vision-parser-*` | mixed | Not relevant |

`Reasoning` is also a **separately toggleable capability** on the agent (on by default), independent of
the model tag.

# G7 — Data Interpreter + My Files · PASS

**Mechanism (differs from the plan).** Agent creation → Add tools → **Capabilities (8):** Data
interpreter · Web search · Extract data from web · Search the web · Code sandbox `Alpha` · Reasoning ·
Document mode · Deep research. **Sources (1):** only `My files`, with exactly two states —
`Select libraries` or `Disabled`. **There is no attach-individual-file option at agent level**, so
libraries are mandatory. LLM nodes expose the same tools, so the agents → LLM nodes fallback is viable.

**1. Upload.** 18 files to My files in one batch (10 CSVs + 4 contracts + 3 requests +
`README_datamodel.md`, 590 KB). `_truth.json` and `_demand_horizon_truth.csv` deliberately excluded —
the agents must never see the answer key. All reached **Ready**; *"All files parsed successfully."*
Parsing took ~50s; `demand_history.csv` (419 KB) was last.

**2. Library.** `srop-data` created from My files, all 18 selected → **READY, 18 of 18 synced** within
seconds. Libraries are Alpha but worked without incident.

**3. Agent.** `zz G7 data probe` — `north-large-01-2026`, Data interpreter ON, Sources → `srop-data`,
Access Private.

**4. The test** — load `demand_history.csv` with pandas and compute, not estimate:

| Field | Returned | Expected |
|---|---|---|
| `ROWS` | **17280** | 17,280 |
| `DISTINCT_MONTHS` | **96** | 96 |
| `MIN_MONTH` | **2019-01** | 2019-01 |
| `MAX_MONTH` | **2026-12** | 2026-12 |
| `NULLS` | **0** | 0 |
| `DISTINCT_PRODUCTS` | **15** | 15 |
| `DISTINCT_CUSTOMERS` | **12** | 12 |

**Every number exact.** Trace showed *"Used Data interpreter · 4 resources read"* and two code
executions — real pandas, not a guess. **This closes G7 and Phase 2's gate G9 together.**

**Platform facts:** storage is **2.00 GB** (docs said 100 MB); per-file caps 50 MB for both document and
spreadsheet types; `.md` uploads and parses fine; **max 25 files per upload batch**; status wording is
**`Ready`**, not the `Enhanced` badge the docs describe; `My libraries` was empty at the start — the
pre-existing *Saudi Aramco Annual Results* library sits under **Company libraries**.

# G8 — Retries and failure defaults · PASS

LLM node → **Advanced**:

| Setting | Default | Notes |
|---|---|---|
| `Max tokens` | `Undefined` | leave alone |
| `Temperature` | **0.3** | slider Precise ↔ Balanced ↔ Creative. Editable on LLM nodes; read-only on agent nodes |
| `Retries on failure` | **2** | **capped at 3** — entering 99 clamps to 3 and toasts *"Maximum retries is 3"* |
| `Default value on failure` | off | toggle; reveals a free-text box: *"Enter the text to use when this node fails…"* |

Set retries to **3** everywhere and turn on `Default value on failure` with an empty-shaped value —
for structured nodes, hand-write the JSON skeleton. A node with no default blocks the entire run when
it fails. Leave temperature at 0.3; do **not** raise it for the classifier, where a low temperature is
what keeps the enum stable.

**Human review nodes have no retry settings** — Notifications and Review timeout only.

---

# Builder mechanics — things that cost time if you don't know them

- **New nodes are inserted ABOVE the selected node and are never auto-connected.** You must drag
  connector-to-connector. Publish/Test validation catches it, but it costs a cycle.
- **Nodes can only be placed inside a Loop by dragging them into the container** — there is no menu
  command. Budget manual time for this in P5.
- Automation names must be **≥ 3 characters**.
- Node-level **Testing** tab is fast and worth using: ~19s for a DI node, reports Success, duration and
  token count. Outputs are cached for the session and invalidated when an upstream node changes.
- **AI assistant ("Otto"): not checked.** Deliberately skipped — never depend on it.
