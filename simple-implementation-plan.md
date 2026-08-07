# SROP Automation — Simplified Implementation Plan
### Hackathon demo build · Cohere North · Derived from `SROP_Automation_Business_Logic_Scope.md`

This is the *doable* version of the scope document. The scope describes a production platform with 8 phases,
6 agent types, a portal, auth, SLAs and an audit archive. This plan builds **one automation and four agents**
that tell the same story in a 4-minute demo.

**Guiding rule:** every element exists to make one point on stage. If a feature doesn't appear in the demo
script in §8, it does not get built. Not "built later" — not built.

**Decisions already locked (do not re-litigate mid-build):**

| Question | Locked answer |
|---|---|
| Platform | Cohere North — agents + one Automation. Per hackathon brief. |
| LP model | **Stubbed.** A deterministic ~30-line pandas calculation in Data Interpreter. Judges will not audit the optimizer. |
| Scope | Scope Phases 1→5 in full, plus a **thin Phase 6** (one stakeholder comment → one rerun). Phases 0, 7, 8 are narrated, not built. |
| Emails | **Drafted and displayed, not sent.** Unless a mail connector already works on the instance — see §6 Gate 4. |
| Auth / portal | Not built. Stakeholder "submissions" are files uploaded to the automation. |

> ⚠️ One assumption to confirm: I included the thin Phase 6 draft-review loop because North's Human Review +
> Do-While nodes make it nearly free, and "the plan re-runs when a refinery objects" is the single most
> impressive beat available. If you'd rather stop at the Draft, delete Block 5 and the demo is 3 minutes.

---

## 1. What the demo proves

Three claims, in order. Everything below serves these.

1. **The planner stops chasing files.** One natural-language instruction fans out into structured requests.
2. **Bad data gets caught before it reaches the model.** Parallel validation flags anomalies against history
   and refinery limits, and drafts the query email itself.
3. **The loop closes.** A stakeholder objects to the draft; the plan regenerates without the planner
   re-doing any of the work.

What we are explicitly **not** proving: optimizer quality, forecast accuracy, security, scale.
Say this out loud in the demo — pre-empting it reads as confidence, not weakness.

---

## 2. Radical scope cuts vs. the scope document

| Scope doc says | We build | Why it's safe |
|---|---|---|
| 6 agent types | **4 agents** (Validator, Correspondence, Intake, Planning Engine) | Orchestrator *is* the Automation; File-Recognition is genuinely cut (see §9) |
| Every stakeholder, every refinery | **4 submissions**: Prices, Demand, Refinery-Yanbu inventory, Refinery-Jazan inventory | 2 refineries is the minimum that makes "parallel validation" visible |
| 4-month horizon, all products | **4 months × 4 products × 2 refineries** | Small enough to read on screen, big enough to look real |
| Real LP model | Deterministic pandas stub | Zero risk; still *responds* to input changes, which is what matters |
| Email + SLA + auto-escalation | Drafted email text rendered in output; escalation narrated | Nobody can see an SLA timer in a 4-min demo |
| Auth, versioning, audit archive | Automation run history *is* the audit trail — show it | Free, and genuinely true |
| Historical bulk-load from SAP | One `history_baseline.csv` | — |

---

## 3. Mock data (build this first — it blocks everything)

Six small CSVs. Hand-write or generate; either is fine at this size. Upload all to **My Files**, wait for the
`Enhanced` badge.

```
data/
├── ref_limits.csv          refinery, bulk_plant, product, min_level, max_level, capacity
├── history_baseline.csv    refinery, bulk_plant, product, month, demand_kb, price_usd   (24 months)
├── sub_prices.csv          product, month, price_usd                    ← Demand Planning
├── sub_demand.csv          refinery, bulk_plant, product, month, demand_kb  ← OSPAS
├── sub_inv_yanbu.csv       bulk_plant, product, opening_inventory_kb     ← Refinery Yanbu
└── sub_inv_jazan.csv       bulk_plant, product, opening_inventory_kb     ← Refinery Jazan
```

**Plant the anomalies deliberately.** The demo depends on the Validator finding exactly these and nothing else:

| # | File | Planted defect | Rule that must catch it |
|---|---|---|---|
| 1 | `sub_demand.csv` | Jazan / Diesel / month 2 demand is **+64%** vs. the 24-month mean | Historical deviation > 40% |
| 2 | `sub_inv_jazan.csv` | One tank opening inventory **exceeds `max_level`** in `ref_limits.csv` | Limit breach |
| 3 | `sub_prices.csv` | One product-month price is **0** | Missing / zero value |
| 4 | `sub_demand.csv` | Contains product `LPG-95` which is **not** in `ref_limits.csv` | Unrecognized new entity |

Four flags across three sources; Yanbu comes back clean. That contrast — "three flagged, one clean, all in
parallel" — is the visual. Run the rule logic locally in pandas before touching North and confirm it produces
**exactly 4 flags**. A validator that finds 7 flags on stage is a broken validator.

Also pre-generate `expected_draft_srop.xlsx` locally with the same stub math. This is your Gate-5 fallback.

---

## 4. The four agents

Build each in North's agent builder, attach the relevant My Files, and **verify each in a plain chat window
before wiring any automation**. An agent that fails alone will fail worse inside a graph.

### 4.1 Validator Agent
- **Tools:** Data Interpreter only.
- **Sources:** `ref_limits.csv`, `history_baseline.csv`.
- **Instruction shape:** *"You validate one monthly SROP submission. Load the attached submission with
  pandas. Apply exactly these four rules — [list them with thresholds]. Do not invent additional rules. For
  every violation emit one flag object. If there are no violations return an empty list."*
- **Structured output** (this is non-negotiable — downstream nodes depend on it):

```json
{
  "source": "OSPAS",
  "state": "Submitted | Validating | Flagged | Emailed | Clean",
  "status": "flagged | clean",
  "flag_count": 2,
  "flags": [
    { "id": "F1", "field": "Jazan/BP2/Diesel/2027-03/demand_kb",
      "submitted_value": "412", "expected_range": "230–280",
      "rule": "historical_deviation", "severity": "high",
      "explanation": "64% above the 24-month mean for this plant-product." }
  ]
}
```

- Keep temperature low. The *numbers* come from pandas, not from the model — the model only narrates them.
- **`state` maps to the scope document's per-submission state model (§6):**
  `Requested → Submitted → Validating → (Flagged → Emailed → Re-validated) → Clean → Included in Intake`.
  Render it as a colour-coded column in the triage table. It costs one extra field and makes the
  "this is a real workflow engine, not a chatbot" point without you having to say it.

### 4.2 Correspondence Agent
One agent, two jobs, chosen by the instruction passed at the node:
- **Mode A (Phase 1):** turn Y's natural-language instruction into per-stakeholder request emails +
  a structured request log.
- **Mode B (Phase 3):** turn one flag into a polite query email to that source, quoting the value, the
  expected range and the reason.

Output both a `subject` and `body` as structured fields so the final template can render them as real emails.

### 4.3 Intake Agent
- **Tools:** Data Interpreter.
- Merges the four submissions into `master_input.xlsx` — one sheet per source plus a `summary` sheet.
- Must apply any value corrections Y made during flag resolution. Pass those in as a JSON patch list;
  do not ask the model to remember them.

### 4.4 Planning Engine Agent (LP stub)
- **Tools:** Data Interpreter.
- Deterministic arithmetic, stated plainly in the instruction so the generated code is stable:

```
required_production = demand + target_closing_inventory − opening_inventory
target_closing_inventory = min_level × 1.15
clamp required_production to [0, capacity]
utilization = required_production / capacity
flag any month where demand cannot be met → "infeasible"
```

- Outputs `draft_srop.xlsx` (one sheet per month) and a short structured summary: total production per
  refinery, utilization %, and any infeasible cells.
- **On stage, call it "the planning engine."** Do not claim it is an optimizer. If a judge asks, the honest
  answer lands well: *"the real LP is an existing internal model — we treat it as a black box and built
  everything around it."*

---

## 5. The automation graph

One automation, ~12 nodes. Inputs: `planner_instruction` (Text), `submissions` (Files, multiple).

```
[1] LLM — Parse request
      Y's instruction → structured list of {stakeholder, items[]}
        │
[2] Agent — Correspondence (Mode A)  → drafted request emails
        │
[3] Human review — "Send these requests?"   [Approve / Edit]
        │
[4] Loop (For Each, PARALLEL) over the 4 submissions
      └── [4a] Agent — Validator  → flags JSON
        │
[5] LLM — Merge flags into one triage table (grouped by source)
        │
[6] Conditional — any flags?
      ├── yes → [7] Human review — Flag triage
      │            Single Select: Email source / Edit value / Accept as justified
      │            Text: correction or justification
      │         [8] Agent — Correspondence (Mode B) → drafted query emails
      └── no ──┐
        │      │
[8b] Conditional — RUN GATE: open_blocking_flags == 0 ?
       false → back to [7]  ·  true → proceed
        │
[9] Agent — Intake  → master_input.xlsx
        │
[10] Agent — Planning Engine  → draft_srop.xlsx + summary
        │
[11] Human review — Draft review (plays the refinery stakeholder)
       Single Select: Approve / Comment ;  Text: the objection
        │
[12] Conditional — Comment? → loop back to [9] with the revised value
                   Approve? → Final output template
```

**Node-by-node notes that will save you an hour each:**

- **[4] parallel loop.** Turn on `Enable parallel execution` — iterations are independent. This is where the
  "four validators at once" claim comes from, and the run log visibly shows it.
- **[6] conditional.** Branch on `flag_count > 0` from node [5]'s structured output, not on free text.
- **[8b] the run gate.** This is business rule §5 *"LP run requires zero open blocking flags"* — the one rule
  in the scope document that is a hard constraint rather than a workflow step. Every flag from [5] must end in
  `resolved` or `justified`; anything still `open` sends Y back to triage. It costs one Conditional and it is
  the single most defensible thing in the build: **the system will not let a plan be generated from
  unvalidated data.** Say exactly that sentence on stage.
- **[7] HITL.** Follow North's documented pattern: Single Select for the decision → Text for detail. Every
  field needs a label or the automation won't run. Set review timeout generously (7d) so a stalled demo
  doesn't fail the run.
- **[12] loop-back.** North does back-edges via a **Do While** wrapper around [9]–[11], condition
  `decision == "Comment"`, `Max iterations = 3`. ⚠️ If the condition is still true at the limit the whole
  run **fails** — so cap at 3 and only ever demo one revision round.
- **Structured outputs everywhere.** Any node handing data to a Conditional must emit structured fields.
  Free-text hand-offs are the #1 source of flaky automation runs.
- **Advanced tab on every Agent node:** set `Retries on failure = 2` and enable `Default value on failure`
  with a sane fallback. A single API hiccup should not kill a live demo.
- **Final output template:** render the drafted emails, the flag table, and links to both generated files.
  This screen is the last thing judges see — spend real time on it.

---

## 6. Build order and gates

Work in this order. Each block ends with a gate: if the gate fails, take the named fallback **immediately**
and move on. Do not debug past a gate.

| Block | Do | Gate | Fallback if gate fails |
|---|---|---|---|
| **1. Data** | Write the 6 CSVs; verify the 4 rules find exactly 4 flags in local pandas | Local run prints 4 flags, 0 false positives | Loosen/tighten thresholds until it does — change the data, not the rules |
| **2. Upload + verify North** | Upload to My Files; confirm `Enhanced`; in a chat, ask Data Interpreter to read one CSV and compute a mean | DI returns a correct number from an actual cell | If DI is unavailable, paste CSV contents into agent instructions — small enough to work |
| **3. Agents** | Build and chat-test all 4 agents individually | Validator returns valid JSON with exactly 4 flags across the 3 dirty files; Planning Engine produces a plausible xlsx | Move the failing agent's logic into an LLM node with inline instructions instead of a reusable agent |
| **4. Linear automation** | Wire nodes [1]–[10]. No conditional, no loop-back yet | One end-to-end test run produces `master_input.xlsx` and `draft_srop.xlsx` | Drop node [2]/[3]; start the automation at the validation loop |
| **5. HITL + loop** | Add [7], [11], the conditionals and the Do-While | Comment → rerun → approve completes **twice in a row** | Cut the loop. Show two pre-generated drafts side by side and narrate the change |
| **6. Rehearse** | Polish the final output template; **record a clean run**; rehearse 3× | Recording in hand | The recording *is* the fallback — never demo live without one |

**Gate 4 (emails):** check once, early, whether a mail connector is live on the instance. If yes, wire exactly
**one** real send — the flag-query email — and let it land in a visible inbox. That single beat is worth more
than any slide. If no, render the drafted emails in the output and say "drafted here, sent via your mail
system in production." Do **not** spend more than 30 minutes on this either way.

---

## 7. Descope ladder (pre-decided, so you never scope while tired)

Cut from the bottom up, in this order:

1. Node [2]/[3] request-email drafting → start the demo at "submissions have arrived"
2. The Do-While revision loop → two static drafts, narrated
3. The Conditional → always route through flag triage
4. Parallel loop → sequential validation (looks slower, works identically)
5. Intake Agent → have the Planning Engine read the four CSVs directly

Anything below line 5 means you're demoing the recording. That is an acceptable outcome; a failed live run is not.

---

## 8. Demo script (4 minutes)

| Time | On screen | What you say |
|---|---|---|
| 0:00 | The scope diagram, briefly | "Today one planner spends the first two weeks of every month chasing spreadsheets from four departments, eyeballing them for errors, and re-typing them into one file." |
| 0:20 | Type the instruction, run node [1]–[3] | "She types what she needs, once, in plain language." → show the drafted emails |
| 0:50 | Upload the 4 submissions; parallel loop runs | "Four submissions land. Four validators run at once — against 24 months of history and each refinery's own tank limits." |
| 1:30 | The flag table | "Yanbu is clean. Three sources aren't: a 64% demand jump, a tank above its maximum, and a product nobody's heard of." |
| 2:00 | Flag triage HITL | "She fixes one inline, accepts one as justified — and for this one, the system has already written the email." *(send it if Gate 4 passed)* |
| 2:30 | Run gate clears → intake + draft generation | "The engine won't run until every flag is closed. Now it will — everything validated consolidates into one input file, and the plan comes back." |
| 3:00 | Draft review HITL — post the objection | "Jazan objects to their March allocation." |
| 3:20 | The rerun; new draft appears | "One comment. The plan regenerates. She re-did nothing." |
| 3:45 | Run history | "And every version, every flag, every decision is on the record. Two weeks of coordination, in four minutes." |

**Rehearse the transitions, not the content.** The dead air while a node runs is where demos die — have a
sentence ready for each wait.

---

## 9. Deliberately not built (say so before you're asked)

Mapped to the scope document so nothing is silently missing:

| Scope reference | Not built | Why it's safe to cut |
|---|---|---|
| §2, §4.16 — **File-Recognition Agent** | Stakeholders can Approve or Comment on the Draft, but cannot re-upload a modified file | The field-level authority check (§5) only matters once real accounts exist. The Comment path carries the same story in one node. |
| §4.9 — **Validation dashboard** | No free-form filter/compare view over submissions vs. history | The flag triage table shows the same comparison for the values that actually matter. A dashboard is a week of UI for zero additional narrative. |
| §4.5, §5 — **SLA timers, reminders, auto-escalation** | Narrated only | Invisible in a 4-minute demo |
| §4.15, §7.19 — **Final SROP artifact + acknowledgment round** | Run ends at Draft approval | Cut by choice — see the note below |
| §3 — Outage / min-max ad-hoc updates, Cycle Request Log reuse | Not modelled | Additional file types, no new capability shown |
| §4 Phase 0 — SAP integration, historical bulk-load | One static `history_baseline.csv` | — |
| §4.21 — False-positive learning from justified flags | Not built | Requires cycles of data we don't have |
| §5 — Auth model, per-stakeholder accounts | Not built | — |

Each of these is a known, scoped item in the business logic document — which is the point. The demo shows the
shape of the system; the scope document shows we know what the rest of it costs.

**If a judge pushes on an edge case** — non-responsive stakeholder, conflicting updates, infeasible LP run,
new entity mid-cycle — the answer is §7 and §8 of the business logic document. Those are open *business*
decisions awaiting the client, not gaps in the design. Have that document open in a second tab.
