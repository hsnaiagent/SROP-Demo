# `zz srop probe` — the throwaway automation for Block 2

Same pattern as the `zz` probes in `GATES.md`. Build it, run the probes against it, then throw it away and
build the real `SROP Validator` knowing exactly what works.

**Why a throwaway:** probes 2.2–2.4 need *something* published to run against, and you don't want to
discover that structured output is broken after you've written the full four-rule prompt. This is one node
and about 15 minutes.

---

## 0. Get a token (no automation needed)

1. Go to `https://zhoom.democloud.cohere.com/developer`
2. Copy the value under **Retrieve your token**
3. Create `srop-app/.env.local`:

```
NORTH_HOST=zhoom.democloud.cohere.com
NORTH_TOKEN=<paste here>
```

`.env.local` is already gitignored by the Next scaffold. No probe prints the token, and `north.mjs`
redacts anything token-shaped out of error bodies.

```bash
npm run probe:auth
```

**Stop here if this fails.** See the script's own output — it distinguishes IAP from a bad token and tells
you what each means. An unsolved IAP 401 changes the architecture, so resolve it before building anything.

---

## 1. Library `srop-ref`

Libraries are **mandatory** — there is no attach-individual-file option at node level (GATES.md G7).

1. **My files → Upload:** `data/ref_limits.csv` and `data/history_baseline.csv`
2. Wait for status **`Ready`** (not `Enhanced` — that badge doesn't exist here)
3. **Libraries → Create** `srop-ref`, select both files, wait for **synced**

---

## 2. Automation `zz srop probe`

**Inputs panel** — the ids must match exactly, the probe sends these keys:

| Input id | Type | Setting |
|---|---|---|
| `submissions` | Files | **allow multiple** |
| `source_label` | Text | — |

**One LLM node**, named `validate`:

- Model `north-large-01-2026`
- **Data interpreter ON**
- **Sources → `srop-ref`**
- Advanced: Temperature **0** · Retries **3** · Default value on failure **on**, set to
  `{"flags":[],"clean_sources":[],"summary":""}`

**Instructions** — the real four rules. If they work here, paste them straight into the real build:

```
You are a data validation agent for a refinery Short Range Operating Plan (SROP).

You are given stakeholder submission files (@submissions) and two reference files in
your srop-ref library: ref_limits.csv (refinery min/max/capacity per product per bulk
plant) and history_baseline.csv (12 months of historical demand).

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

List in clean_sources any source whose file had no flags at all.
```

**Output → Structured → Edit JSON:** paste the schema from `demo-implementation-plan.md` §5 verbatim.
Keep the `enum`s — they are what stop the model inventing a fifth rule name and breaking the UI.

**Output template:** write anything non-empty. An empty template makes the run report "No output"
(GATES.md standing decision 7).

---

## 3. Publish

`/execute` only runs the **live published version**.

- Version type **Major** → v1.0.0
- Name ≥ 3 chars, description and visibility (`Private`) are all required
- Publish validation rejects disconnected nodes — remember new nodes are inserted **above** the selected
  node and are **never auto-connected**; you must drag connector-to-connector

Copy the automation id from the URL into `.env.local`:

```
NORTH_AUTOMATION_ID=<id>
```

---

## 4. Run the probes

```bash
npm run probe:auth       # 2.1
npm run probe:execute    # 2.2 + 2.3 + 2.4
npm run probe            # both
```

`probe:execute` writes the raw response to `scripts/out/last-execution.json`.

**That file is the most valuable output of Block 2.** Type `lib/types.ts` against what it actually
contains, not against the schema you asked for — the single most likely integration bug in this build is
North returning a slightly different structure than the schema promised.

---

## What each probe proves

| Probe | Question | Fail → do this |
|---|---|---|
| 2.1 | Does a bearer token work from a backend? | IAP header, or MOCK_MODE becomes the architecture |
| 2.2 | Does structured output arrive as a parsed object? | "return only JSON, no prose" + parse with repair pass |
| 2.3 | Can one node read uploads **and** the library? | Pre-parse CSVs with papaparse, pass as text in the prompt |
| 2.4 | Under 90 seconds? | Cut Node 2, hardcode the email templates |

2.3 is proven specifically by the `HISTORICAL_DEVIATION` evidence line containing **both** `41.2`
(from the upload) and `25.1` (from the library). If `25.1` is missing, the library never got read.

---

## Then throw it away

Rename to `SROP Validator`, add Node 2 (`draft_emails`), re-publish. Or delete it and build fresh — either
way you now know the platform's answers before you've written a line of UI.
