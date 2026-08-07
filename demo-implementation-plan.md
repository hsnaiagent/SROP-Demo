# SROP Demo — Implementation Plan (v2, minimal)

**Supersedes `simple-implementation-plan.md`.** That plan built 4 agents and 5 automation blocks. This one
builds **one automation with three nodes, one web app, and one deterministic planning function** — and tells
a tighter story.

| Decision | Locked |
|---|---|
| Stack | **Next.js (App Router, TypeScript/TSX)** → Route Handlers → North TS SDK → one published Automation. No Python in the app. |
| Star of the demo | **Validation.** AI catches bad data before it reaches the model. Everything else is supporting cast. |
| LP model | Stubbed. ~25 lines of TypeScript arithmetic in `lib/plan.ts`, not in North. |
| Build time | 2 days, ~14 working hours. Schedule in §9. |
| Emails | Drafted by AI, rendered in the UI. Never sent. |
| Auth / portal / SLA / audit | Not built. Narrated in one sentence each. |

---

## 1. The three claims (nothing gets built that doesn't serve one)

1. **Bad data gets caught before the model sees it.** Four messy stakeholder files go in; the Validator flags
   exactly four defects, each with a reason a human can check.
2. **The planner resolves flags in seconds, not days.** For each flag: accept-as-justified, or send the
   AI-drafted query email. One click each.
3. **A clean input produces a plan.** Zero open flags unlocks "Generate SROP", which returns a 4-month plan.

**Explicitly not proving:** optimizer quality, security, scale, real email delivery. Say this out loud on
stage — pre-empting it reads as confidence.

---

## 2. Cuts vs. the scope document

| Scope doc | Demo build | Why safe |
|---|---|---|
| 6 agent types | **2 LLM nodes + 1 code step** in one automation | Orchestrator = the web app. Intake/File-Recognition cut entirely. |
| Phases 0–8 | **Phases 2 → 5 only** | Phase 1 (request fan-out) is narrated with a screenshot. Phases 6–7 narrated. |
| All refineries, all products | 2 refineries × 4 products × 4 months | Fits one screen |
| Real LP | pandas stub in backend | Zero platform risk; still *responds* to input changes |
| SAP historical pull | `history_baseline.csv` | — |
| Stakeholder portal + auth | Planner-only UI; "submissions" are pre-staged files | Nobody logs in during a 4-min demo |
| Draft review loop | **Cut.** | It was the second-best beat. Validation is the best one. Don't split focus. |

---

## 3. Architecture

```
app/
├── page.tsx                    'use client' — owns ALL demo state
│   ├── components/SubmissionCard.tsx     pane 1
│   ├── components/FlagCard.tsx           pane 2  ← the money shot
│   └── components/PlanTable.tsx          pane 3  (two-column + Δ)
│
├── api/validate/route.ts       upload files → execute automation → poll → flags[]
├── api/generate/route.ts       pure: resolved rows in → { planRaw, planResolved, delta }
│
lib/
├── north.ts                    NorthClient wrapper + MOCK_MODE switch
├── plan.ts                     buildPlan(rows) — deterministic arithmetic
├── types.ts                    Flag, Submission, PlanRow, ResolveAction  ← single source of truth
└── mock/validate-response.json captured from a real North run on day 1
data/                           the six CSVs (read server-side)
```

```
   page.tsx  ──fetch──▶  route.ts  ──HTTPS Bearer──▶  Cohere North
  (all state)          (stateless)                   Node 1  LLM + Data Interpreter → flags[]
                                                     Node 2  LLM                    → query emails
```

**All state is React state in `page.tsx`.** No database, no server singleton, no polling loop — the route
handlers are pure functions. Refresh resets the demo cleanly between rehearsals, which is exactly the
behaviour you want.

**Why TSX earns its keep here:** put `Flag` in `lib/types.ts` and both the route handler that parses North's
JSON and the component that renders it are checked against the same shape. The single most likely
integration bug in this build is North returning a slightly different structure than the schema promised —
and this is the setup where the compiler tells you at the boundary instead of the UI silently rendering
`undefined` on stage. Type the North response explicitly; do not `any` it to move faster.

---

## 4. Mock data — build this first, it blocks everything

Six CSVs in `data/`. Keep every file under 60 rows so the whole thing is readable on screen.

```
ref_limits.csv        refinery, bulk_plant, product, min_level, max_level, capacity
history_baseline.csv  refinery, bulk_plant, product, month, demand_kb      (12 months, not 24)
sub_prices.csv        product, month, price_usd                    ← Demand Planning
sub_demand.csv        refinery, bulk_plant, product, month, demand_kb  ← OSPAS
sub_inv_yanbu.csv     bulk_plant, product, opening_inventory_kb     ← Refinery Yanbu
sub_inv_jazan.csv     bulk_plant, product, opening_inventory_kb     ← Refinery Jazan
```

Products: `DIESEL, GASOLINE-91, JET-A1, FUEL-OIL`. Refineries: `YANBU, JAZAN`. Months: `2026-09 … 2026-12`.

### Plant exactly four defects — no more, no fewer

| # | File | Planted defect | Rule that catches it | Severity |
|---|---|---|---|---|
| 1 | `sub_demand.csv` | JAZAN / DIESEL / 2026-10 demand is **+64%** vs. its 12-month mean | Historical deviation > 40% | High |
| 2 | `sub_inv_jazan.csv` | One tank's opening inventory **exceeds `max_level`** | Limit breach | High |
| 3 | `sub_prices.csv` | One product-month `price_usd` is **0** | Missing / zero value | Medium |
| 4 | `sub_demand.csv` | Contains product `LPG-95`, absent from `ref_limits.csv` | Unrecognized entity | Medium |

**Yanbu comes back clean.** That contrast — "three sources flagged, one clean" — is what makes the Validator
look like it's actually reading, not pattern-matching for effect.

**Verification step (do not skip):** before wiring anything to North, write `check_data.py` — 20 lines of
pandas that asserts all four defects exist and that no *fifth* anomaly slipped in. Run it after every data
edit. A stray outlier that the Validator legitimately catches will derail your demo narration.

---

## 5. The North build (~3 hours)

One automation, **`SROP Validator`**. Two nodes. Publish it — `/execute` only runs published versions.

### Inputs panel

| Input id | Type | Notes |
|---|---|---|
| `submissions` | Files | Documents, **allow multiple** |
| `source_label` | Text | e.g. `"OSPAS demand + Demand Planning prices + Yanbu/Jazan inventory"` |

`ref_limits.csv` and `history_baseline.csv` go in **My Files** and are attached to Node 1 directly — they're
reference data, not per-run input. Wait for the `Enhanced` badge before testing.

### Node 1 — `validate` (LLM node, Data Interpreter enabled)

Model: North Large. Temperature **0**. Retries: 2.

Instructions:

```
You are a data validation agent for a refinery Short Range Operating Plan (SROP).

You are given stakeholder submission files (@submissions) and two reference files attached
to you: ref_limits.csv (refinery min/max/capacity per product per bulk plant) and
history_baseline.csv (12 months of historical demand).

Use the data interpreter to load every file with pandas. Do not guess at values — read them.

Apply exactly these four rules, and only these:

R1 HISTORICAL_DEVIATION — a submitted demand_kb differs from that
   refinery+bulk_plant+product's mean in history_baseline.csv by more than 40%.  Severity: high
R2 LIMIT_BREACH — an opening_inventory_kb is above max_level or below min_level
   for that bulk_plant+product in ref_limits.csv.                              Severity: high
R3 ZERO_OR_MISSING — any price_usd or demand_kb that is 0, negative, blank or NaN. Severity: medium
R4 UNKNOWN_ENTITY — a product, refinery or bulk_plant that appears in a submission
   but does not exist in ref_limits.csv.                                        Severity: medium

Report one flag per offending row. Do not report the same row twice.
Do not invent rules. If a value is fine, say nothing about it.

For each flag, `evidence` must contain the submitted number AND the number it was
compared against, e.g. "submitted 41.2 kb vs 12-month mean 25.1 kb (+64%)".
```

Output: **Structured**, via `Edit JSON`:

```json
{
  "type": "object",
  "properties": {
    "flags": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id":        { "type": "string" },
          "source":    { "type": "string", "enum": ["OSPAS","Demand Planning","Refinery YANBU","Refinery JAZAN"] },
          "file":      { "type": "string" },
          "rule":      { "type": "string", "enum": ["HISTORICAL_DEVIATION","LIMIT_BREACH","ZERO_OR_MISSING","UNKNOWN_ENTITY"] },
          "severity":  { "type": "string", "enum": ["high","medium","low"] },
          "field":     { "type": "string" },
          "row_ref":   { "type": "string" },
          "submitted_value": { "type": "string" },
          "evidence":  { "type": "string" },
          "plain_english": { "type": "string" }
        },
        "required": ["id","source","file","rule","severity","field","row_ref","submitted_value","evidence","plain_english"]
      }
    },
    "clean_sources": { "type": "array", "items": { "type": "string" } },
    "summary": { "type": "string" }
  },
  "required": ["flags","clean_sources","summary"]
}
```

The `enum`s are doing real work here — they stop the model inventing a fifth rule name and breaking your UI.

### Node 2 — `draft_emails` (LLM node, no tools)

Instructions:

```
For each flag in @validate.flags, draft a short email from the SROP planner to the
submitting stakeholder asking them to confirm or correct that value.

Rules:
- Under 90 words. No greeting fluff, no "I hope this finds you well".
- State the value, what it was compared against, and the specific question.
- Never assert the value is wrong. Ask whether it is intentional.
- Sign off as "SROP Planning".
```

Output: structured — array of `{ flag_id, to, subject, body }`.

### Verify on the instance before you build the UI (30 min, day 1)

- [ ] Data Interpreter is enabled on your instance and reads a multi-file upload
- [ ] Structured output round-trips (run once in the builder, inspect the JSON)
- [ ] `/api/v1/automations/{id}/execute` returns a `NorthExecution` with your token
- [ ] Full run completes in **under 90 seconds** — if not, cut Node 2 and hardcode email templates

If any of these fails, you build the UI against `MOCK_MODE=1` and decide on day 2 whether North goes live.
That decision must not block frontend work.

---

## 6. Route handlers + lib (~2.5 hours)

`npx create-next-app@latest --typescript --app --tailwind`. Two route handlers, both **stateless**.

### `lib/types.ts` — write this file first

Everything else imports from it. Mirror the North JSON schema from §5 exactly.

```ts
export type Rule = 'HISTORICAL_DEVIATION' | 'LIMIT_BREACH' | 'ZERO_OR_MISSING' | 'UNKNOWN_ENTITY';
export type Severity = 'high' | 'medium' | 'low';
export type FlagStatus = 'open' | 'awaiting_response' | 'responded' | 'justified' | 'corrected';

export interface Flag {
  id: string; source: string; file: string;
  rule: Rule; severity: Severity;
  field: string; rowRef: string;
  submittedValue: string;
  evidence: string;          // both numbers — never optional
  plainEnglish: string;
  // client-side only, added on arrival:
  status: FlagStatus; note?: string; correctedValue?: string;
}

export interface ValidateResponse { flags: Flag[]; cleanSources: string[]; summary: string;
                                    emails: Record<string, { to: string; subject: string; body: string }>; }
export interface PlanRow { month: string; refinery: string; product: string;
                           production: number; closing: number; shortfall: number; revenue: number; }
export interface GenerateResponse { raw: PlanRow[]; resolved: PlanRow[]; deltaRevenue: number; }
```

North returns snake_case; map it to these camelCase types **at the route-handler boundary**, in one place.
Don't let snake_case leak into components.

### `POST /api/validate`

Reads the four `sub_*.csv` from `data/`, uploads via the North TS SDK (`client.files.create`), calls
`POST /v1/automations/{id}/execute`, then polls `GET /v1/automations/executions/{id}?include_nodes=true`
every 2s up to 120s. Parses node 1 → `flags[]`, node 2 → `emails`. Returns `ValidateResponse`.

> **Timeout gotcha:** a route handler awaiting a 90-second poll is fine under `next dev` (no limit) but would
> be killed on Vercel's default. **Demo locally with `next dev`.** Don't deploy this and don't discover the
> difference on stage. If you want a progress indicator rather than a 90s spinner, that's the one place
> streaming would help — skip it unless you're ahead of schedule.

### `POST /api/generate`

Pure function. Body: `{ rows: SubmissionRow[], corrections: Record<string, number> }`. Calls
`buildPlan()` twice — once on rows as submitted, once with corrections applied — and returns both plus the
delta. **No gate check here.** The gate is UI state (§7.2); the route stays a pure function you can unit-test.

### `lib/plan.ts` — the stub, ~25 lines

```ts
// per refinery / bulkPlant / product / month, months in order
const required   = row.demandKb;
const available  = isFirstMonth ? row.openingInventoryKb : closingPrev;
const safety     = 0.10 * limits.maxLevel;
let   production = Math.max(0, required + safety - available);
production       = Math.min(production, limits.capacity);
const closing    = available + production - required;
const shortfall  = Math.max(0, required - (available + production));
const revenue    = required * price;
```

Call the **same** `buildPlan()` for both datasets. Never write a second version — if the two plans differ for
any reason other than the corrected value, the demo's central claim is false. Being pure and typed, this is
also the one thing worth a five-minute unit test: same input twice → identical output.

### `lib/mock/validate-response.json` + the MOCK_MODE switch

```ts
if (process.env.NEXT_PUBLIC_MOCK === '1') return mockResponse as ValidateResponse;
```

Because it's typed as `ValidateResponse`, the compiler guarantees your mock and your live path have the same
shape — which is precisely the bug that would otherwise surface when you flip to live North at hour 11.

### State transitions (client-side, in `page.tsx`)

```
open ──send query──▶ awaiting_response ──simulate──▶ responded ──accept──▶ corrected
  └──justify (note required, empty rejected)──────────────────────────────▶ justified
```

`corrections.json` is a 4-entry file mapping flag id → the stakeholder's "reply". Only flag #1 (the +64%
demand) returns a materially different number — that's the one that moves the plan. The other two reply
"confirmed, intentional", resolving without changing data. That ratio is honest: most queries end in a
justification, not a correction.

---

## 7. Frontend (~4 hours)

### 7.0 What each pane has to make a judge *feel*

Build against these five jobs, not against the pixel spec. If a UI element doesn't serve one of them, cut it.

| # | Job | Fails if… |
|---|---|---|
| 1 | **Inputs are scattered and untrusted.** Four stakeholders, four formats, no shared source of truth. | Pane 1 reads as "a file uploader." Then the flags in Pane 2 look like arbitrary red badges, not caught problems. |
| 2 | **The AI catches what a human misses — with evidence.** Every flag names the rule and shows *both* numbers being compared. | The evidence field is missing or vague. Then it's a black box, which is a far weaker claim than a verifiable one. |
| 3 | **A human still decides. Nothing auto-corrects.** Accept-with-reason, or query the source. | The system looks like it overrides Y. This is the trust question — answer it before it's asked. |
| 4 | **A hard gate stands between messy data and the model.** | The locked button isn't visibly locked. This is the one place a *business rule* — not an AI capability — becomes undeniable. You point at it instead of explaining it. |
| 5 | **Clean data produces something that visibly changed.** | The plan looks identical regardless of what got fixed. Then validation feels consequence-free and the whole story deflates. |

### 7.1 Resolving the 3-vs-5 tension (read this before building)

Jobs 3 and 5 conflict: if the human only ever accepts or emails, **no number ever changes**, so the plan
can't move. Two mechanisms fix it, and you need both:

**(a) The stakeholder-response beat.** "Send query email" is not a dead end — it's the first half of the loop
Y actually runs today. After sending, the flag enters `awaiting response`, and a **`Simulate response`**
button (or a 4-second timer) returns a corrected value from the source. The planner accepts the correction;
the underlying data mutates. This is faithful to the business process *and* it moves a number. Label it
honestly on stage: "in production this is the stakeholder re-uploading; here I'm triggering it."

**(b) The counterfactual column.** The backend computes the plan **twice** — once on the raw submitted data,
once on the resolved data — and Pane 3 shows both:

```
                 Plan as submitted      Plan after validation      Δ
2026-10 JAZAN         41.2 kb                  25.8 kb          −15.4
Total revenue        $XX.XM                   $XX.XM           −$X.XM
```

This costs one extra call to the same pandas function and one extra table column. It is the cheapest,
highest-impact thing in this document: it converts "we caught an error" into **"here is the plan we would
have shipped."** Build it even if you cut something else to afford it.

### 7.2 Layout

`app/page.tsx` is `'use client'` and owns every piece of state:

```ts
const [flags, setFlags]       = useState<Flag[]>([]);
const [phase, setPhase]       = useState<'idle'|'validating'|'triage'|'planned'>('idle');
const [plan, setPlan]         = useState<GenerateResponse | null>(null);
const [refused, setRefused]   = useState(false);   // drives the gate's shake animation

const openCount = flags.filter(f => f.status === 'open' || f.status === 'awaiting_response').length;
const gateOpen  = flags.length > 0 && openCount === 0;
```

`openCount` is derived, never stored — the counter and the gate read from one source, so they cannot
disagree on stage. Three presentational components below, each taking props and holding no state of its own.
Tailwind for styling (it comes with the scaffold; don't add a component library — shadcn/ui and friends will
eat an hour you don't have and give you nothing a judge can see).

**Pane 1 — Submissions.** Four cards: OSPAS, Demand Planning, Refinery Yanbu, Refinery Jazan. Each shows
**the sending department, the filename, its own arrival timestamp, row count, and column headers** — the
headers should visibly differ between files. That heterogeneity *is* the point of the pane (job 1); four
identical-looking cards would undercut it. Status dot: grey → spinner → green check / red badge with flag
count. One button: **Run Validation**.

**Pane 2 — Flags (the money shot).** Grouped by source, per the scope doc's "grouped, not individual" rule.
Each flag card:

```
┌─────────────────────────────────────────────────────┐
│ ● HIGH   Historical deviation          OSPAS        │
│ JAZAN · DIESEL · 2026-10                            │
│ Submitted 41.2 kb  vs  12-month mean 25.1 kb (+64%) │
│ "Demand jumped 64% over the historical average for  │
│  this plant and product."                           │
│  [ Accept as justified ]  [ Send query email ▾ ]    │
└─────────────────────────────────────────────────────┘
```

Nothing on this card changes a value by itself — **the two buttons are the only paths forward, and both run
through a person** (job 3). Say that sentence on stage while the cursor hovers between them.

"Send query email" expands the AI-drafted body inline, editable, with a **Send** button → status becomes
`awaiting response` → a **`Simulate response`** control returns the corrected value from the source, which
the planner accepts. Only then does the underlying number change. "Accept as justified" requires a typed
reason before it will close — an empty reason is rejected, because the logged rationale is the audit trail.

A counter at the top: **`3 of 4 flags open`**.

**Pane 3 — SROP Plan.** Disabled, with the caption *"Resolve all 4 flags to generate — 3 still open"*, until
the counter hits zero. Make the locked state loud: greyed button, lock glyph, and **the click still
registers** — clicking it while flags are open shakes the button and surfaces the blocking rule. The disabled
button is the single most valuable element on screen (job 4), so let the judges watch it stay locked, get
refused once, and only then unlock.

Once unlocked: the **two-column plan table from §7.1(b)** — as-submitted vs. after-validation, with the delta
column — plus a headline revenue figure and its delta. Not a single-column table. The comparison is the
payoff.

### Visual rules

Dark background, one accent colour, monospace for numbers. Font size at least 16px — judges are 3 metres
away. Skip animations except the validation spinner.

---

## 8. Demo script — 4 minutes

| Time | Job | On screen | Say |
|---|---|---|---|
| 0:00 | 1 | Pane 1, four cards — different senders, times, columns | "Four departments, four files, four different formats, arriving whenever they arrive. Today one person opens all of these in Excel and eyeballs them." |
| 0:25 | 2 | Click **Run Validation**, spinners | "Instead they go to a validation agent that already has the 12-month history and every refinery's tank limits." |
| 0:45 | 2 | Flags appear, 3 red / 1 green | "Yanbu is clean. Three sources have problems — and it doesn't just say *wrong*, it shows you both numbers." |
| 1:05 | 2 | Read flag #1's evidence line aloud | "41.2 against a 12-month mean of 25.1. Plus 64%. You can check that yourself in two seconds — that's the difference between a tool you trust and one you don't." |
| 1:30 | 3 | Hover between the two buttons | "Notice what it did *not* do: it didn't fix anything. Every flag goes through the planner — accept it, or ask the source." |
| 1:45 | 3 | Expand email draft, edit a word, **Send** | "The planner doesn't write this. It's drafted with the numbers already in it." |
| 2:05 | 3 | **Simulate response** → corrected value → accept | "In production Jazan re-uploads. Here I'm triggering it. They came back with 25.8 — it was a typo." |
| 2:25 | 3 | Accept flags 3 and 4 with typed reasons | "Zero price is a real holiday shutdown. Accept, log the reason — and now it's in the record instead of in someone's head." |
| 2:45 | 4 | **Click Generate while flags are open** → refused | "It won't run. Not a warning — a gate. Bad data cannot reach the optimizer." Close the last flag; button unlocks. |
| 3:05 | 5 | Click **Generate SROP** — two-column table | "Left column: the plan we'd have shipped on the data as submitted. Right: after validation. That's a 15.4 kb swing in October and $X.XM in revenue — from one flag." |
| 3:35 | — | — | "Today this is three weeks and one person's memory. And the optimizer is stubbed — Aramco has one, it drops in behind the same interface. What we built is everything around it." |

**The 3:05 line is the demo.** Everything before it is setup for that comparison. If you're running long, cut
from the middle — never from the payoff.

Rehearse this **three times end to end.** Most hackathon losses are narration, not code.

---

## 9. Schedule — 2 days, 14 hours

**Day 1 (7h)**

| Block | Task | Done when |
|---|---|---|
| 1h | Mock data + `check_data.py` | Script asserts exactly 4 defects, exits 0 |
| 0.5h | North instance verification checklist (§5) | All four boxes ticked, or MOCK_MODE decided |
| 1.5h | Node 1 built and tested **in the North builder UI** | Structured JSON with 4 flags, run twice, same result |
| 1h | Node 2 + publish automation | `/execute` returns an execution id from curl |
| 0.5h | `create-next-app` scaffold + `lib/types.ts` written first | `npm run dev` serves a blank page; types compile |
| 1.5h | `lib/north.ts` + `/api/validate` + MOCK_MODE switch | `curl localhost:3000/api/validate` returns real flags |
| 1h | Capture `lib/mock/validate-response.json` from a real run | Frontend buildable with North switched off |

**Day 2 (7h)**

| Block | Task | Done when |
|---|---|---|
| 2.5h | `page.tsx` state machine + `SubmissionCard` + `FlagCard`, incl. query→response→correction | Full click-through works with `NEXT_PUBLIC_MOCK=1` |
| 1.5h | `lib/plan.ts` + `/api/generate` calling it **twice** + `PlanTable` | Δ column shows a real, non-zero swing on flag #1 |
| 1h | Wire to live North, fix the shape mismatches | Real run drives the real UI |
| 1h | Locked-button state (refuse-on-click), font sizes, polish | Readable from 3m; the gate is unmissable |
| 1h | **Three full rehearsals** | No stumbles, under 4:00 |

Anything not on this table is not being built.

---

## 10. Risks and kill switches

| Risk | Kill switch |
|---|---|
| North instance flaky or slow on demo day | `NEXT_PUBLIC_MOCK=1`, canned `validate-response.json` captured on day 1. **Run a second `next dev` on port 3001 in mock mode, in another tab, during the demo.** Non-negotiable. |
| Data Interpreter refuses a file / times out | Pre-parse the CSVs in the route handler (`papaparse`) into a compact JSON blob and pass it as *text* in the prompt. 60 rows fits comfortably in context. Drops the "it reads real files" line — keeps the demo. |
| Route handler dies mid-poll | Demo with `next dev`, never a deployed build. Serverless timeouts do not apply locally. |
| Next.js scope creep — auth, routing, a component library, dark-mode toggle | One route, one page, three components. If you're adding a dependency after hour 4, you're building the wrong thing. |
| Model invents a fifth flag or drops one | Temperature 0, enum-constrained output, and the backend **filters `flags[]` to the four known rule names** and caps at 6. Ugly, but it's a demo. |
| Structured output not honoured | Fall back to "return only JSON, no prose" + `json.loads` with a repair pass. |
| Run takes >90s and dead-airs the stage | Cut Node 2; hardcode email templates with `.format()` on the flag fields. Nobody can tell. |
| Live-typing an edit fails on stage | Pre-fill the edited email text; only *pretend* to type the last word. |

**Record a 4-minute screen capture of a successful run the night before.** If everything breaks, you play the
video and narrate over it. Judges have seen worse and forgiven it; they have not forgiven silence.

---

## 11. Answers to the questions judges will ask

**"Isn't this just rules in a script?"** — The rules are, and deliberately so; deterministic checks should be
deterministic. The model does three things a script can't: reads heterogeneous files without a fixed schema,
explains the flag in language the stakeholder understands, and drafts the correspondence. Point at the
`plain_english` field.

**"What about the optimizer?"** — Stubbed on purpose. Aramco has one. Everything in the scope document that
*surrounds* the optimizer is the manual part, and that's what we automated.

**"How do you know it won't hallucinate a flag?"** — Constrained enum output plus the evidence field, which
forces both numbers into the open where a human can check them in two seconds. And a backend filter.

**"Does it scale to all refineries?"** — The validation runs per submission, so it fans out horizontally.
Two refineries and twenty are the same code path; twenty just doesn't fit on a slide.

**"What's not built?"** — Auth, the stakeholder portal, real email delivery, the draft-review loop, the audit
archive. Say the list fast and unapologetically. A team that knows exactly what it didn't build reads as a
team that made choices.

**"Does the AI change the data?"** — No. It flags and it drafts; a person accepts or queries. Every mutation
in the system traces to a click and a typed reason. Point at the two buttons on a flag card — there is no
third one.

**"You simulated the stakeholder's reply — isn't that cheating?"** — Name it before they do, at 2:05. The
real version is the stakeholder re-uploading through the portal we didn't build; the mechanism that consumes
their correction is the same either way. Volunteering this costs nothing and buys credibility for everything
else you claim.
