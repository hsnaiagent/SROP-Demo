# SROP Demo — Implementation Checklist

Working companion to `../demo-implementation-plan.md`. Tick as you go.

> **Starting a fresh session? Read `HANDOFF.md` first.**

**Sources folded in:** `../demo-implementation-plan.md` (the plan) · `../GATES.md` (P1 platform gates,
tested 2026-08-05/06 on `zhoom.democloud.cohere.com`) · Cohere North private docs
(`private.docs.cohere.com`, read 2026-08-07).

**Instance:** `https://zhoom.democloud.cohere.com` · **API base:** `https://zhoom.democloud.cohere.com/api/v1`

**Project root is `srop-app/`.** The Next app, `data/`, `scripts/` and this file all live here. (The
earlier `srop-demo/` folder was merged in — delete the empty leftover in Finder if it's still there.)

### Status at a glance

| Block | State |
|---|---|
| 0 — Plan corrections | ✅ all 6 applied (3 in code, 3 in the North build) |
| 1 — Mock data | ✅ done, `check_data.py` green |
| 2 — Platform probes | ✅ **ALL PROBES PASSED** on v2.0.0 — 27.6s, 4 correct flags |
| 3 — North build | ✅ **done** — `SROP Validator` v2.1.0, both nodes wired. Needs one verification run |
| 4 — Backend | ✅ **done** — types · csv · plan · north · both routes |
| 5 — Frontend | ✅ **done** — 3 panes, gate, two-column table. **16 tests green** |
| 6 — Wire live + rehearse | code side ✅ · **rehearsals + recording are yours** — see `DEMO-RUNBOOK.md` |

> **Blocks 2 and 4 are closed.** `npm run check` is green: typecheck plus **14 tests**, with the plan
> arithmetic hitting −15.4 kb / −$1.45M / $66.50M exactly and the mapping layer tested against a real
> North response. Block 5 runs against `lib/mock/validate-response.json` with `MOCK_MODE=1`.

### The passing run (v2.0.0, 2026-08-07, execution `ad8dc141`)

**27.6s server-side · 4 flags · all four rules · Yanbu clean.** Every flag matches `check_data.py`
row-for-row, and every `source` matches the `from` field in `corrections.json`:

| Rule | Source | Row | Evidence |
|---|---|---|---|
| HISTORICAL_DEVIATION | OSPAS | JAZAN·BP-JAZAN·DIESEL·2026-10 | submitted 41.2 kb vs 12-month mean 25.1 kb (+64%) |
| UNKNOWN_ENTITY | OSPAS | JAZAN·BP-JAZAN·LPG-95·2026-11 | LPG-95 not found in reference limits |
| ZERO_OR_MISSING | Demand Planning | JET-A1·2026-11 | price 0.0 |
| LIMIT_BREACH | Refinery JAZAN | BP-JAZAN·GASOLINE-91 | 31.4 kb exceeds max level 27.0 kb |

`clean_sources: ["Refinery YANBU"]` — the "three flagged, one clean" contrast holds.

**2.4 verdict: keep Node 2.** 27.6s leaves ~60s of headroom against the 90s target, so `draft_emails`
does not need to be cut and the email templates do not need hardcoding.

> ⚠️ **One passing run is not yet proof of determinism** — nondeterminism was the original problem.
> Run `npm run probe:execute` a second time and confirm 4 flags again before building the UI on it.

> The docs site's **Ask AI assistant is broken** on this instance — it returns
> *"I'm not able to help with that request"* to every question, including plain-English ones. Read the
> reference pages directly; they work.

---

## Block 0 — Corrections to the plan (read once, before you build anything)

Seven places where `../demo-implementation-plan.md` is wrong for this instance. Each one costs 20+ minutes
if you find it at the keyboard.

**Applied already** (in `scripts/`, and proven by probe 2.1):

- [x] **§6 `/v1/automations/...` — the real prefix is `/api/v1/`.** Confirmed live by the 200 from 2.1.
- [x] **§6 inputs are typed wrappers, not raw values.** Implemented in `probe-2-execute.mjs`; the exact
      payload is in Block 4.
- [x] **§2 vs §6 contradict each other on `lib/plan.ts`** (pandas vs TypeScript). **TypeScript wins** —
      the plan's own §1 locks "no Python in the app".

**Applied in the North build (2026-08-07):**

- [x] **§5 "attach ref files to Node 1 directly" — impossible.** Created library **`srop-ref`**
      (`ref_limits.csv` + `history_baseline.csv`), 2 of 2 synced, `READY`.
- [x] **§5 "wait for the `Enhanced` badge" — that badge doesn't exist here.** Confirmed again: the status
      word is **`Ready`** on files and **`READY`** on libraries.
- [x] **§5 "Retries: 2" — cap is 3.** Set **3**; `Default value on failure` is **on**.

> ⚠️ **One deliberate deviation.** The plan's skeleton is `{"flags":[],"clean_sources":[],"summary":""}`.
> The builder renders the default-on-failure value as a *form* derived from the schema, and `summary` is a
> required string. `flags` and `clean_sources` are empty arrays as specified, but `summary` is set to
> **`"Validator node failed; no results returned."`** rather than `""` — an empty required field risked
> tripping publish validation, and a recognisable string makes a silent node failure obvious on stage.

### New gates found while building (worth folding into GATES.md)

- **G-new-1 — Sources are attached by `@`-mention in the Instructions box, not from the Tools menu.**
  The Tools menu's *Sources* section offers only **My files** (all 20 of them, indiscriminately). Typing
  `@srop-ref` in Instructions attaches the library to the node properly and adds a folder chip to the tool
  row. The plan's "Sources → `srop-ref`" is right about the destination, wrong about the route.
- **G-new-2 — The builder does not persist a draft until the first node exists.** A draft with a name and
  two fully configured inputs but no node vanished completely on navigation and never appeared under
  *My builds*. **Add the node first, then everything else.** The URL gains the automation id at that moment.
- **G-new-4 — `inputs` is keyed by `input_id`, and `input_id` is NOT the name you typed.** ⚠️ **This one
  bit us.** North generates the id; the docs' own example pairs `input_id: "param-001"` with
  `name: "Ticket Text"`. Sending `{"submissions": …, "source_label": …}` returns
  **`400 AUTOMATION_MISSING_REQUIRED_INPUTS`** with `missing_inputs: ["source_label"]` — which reads
  exactly like the input doesn't exist, sending you back to the builder to fix an input that is perfectly
  fine. **Resolve first:** `GET /api/v1/automations/{id}` → `input_parameters[]`, each carrying
  `input_id` · `name` · `input_type` · `required`. `probe-2-execute.mjs` now does this and prints the
  mapping. **`lib/north.ts` must do the same** — do not hardcode input ids.
- **G-new-5 — node output arrives in an agent envelope, even from an LLM node.** `nodes[].output` is
  `{ kind: 'agent', conversation_id, rendered_prompt, text, data, chat_response, error }`. **The structured
  payload is at `output.data`**, and the same JSON is duplicated as a raw string at `output.text`. Nothing
  lands at `output.flags`. `probe-2-execute.mjs` now unwraps `output.data` → `output.flags` →
  `JSON.parse(output.text)` in that order; `lib/north.ts` must do the same.
- **G-new-3 — `Edit JSON` needs its `Apply` button**, which sits below the fold of the panel. Closing the
  panel with the `X` silently discards the pasted schema. Confirm by watching `Fields (0)` become
  `Fields (3)`.

**Open decision — do you need the North TS SDK at all?**

- [ ] The plan §6 says use it. It is **not on npm**; it installs from your own instance:
      `npm install https://zhoom.democloud.cohere.com/api/v1/sdk/typescript-latest.tar.gz`
      (client `base_url` ends in **`/api`** — the SDK appends `/v1`).
      **Recommendation: skip it.** The probes already do upload → execute → poll with plain `fetch`, and
      probe 2.1 returned 200. You need exactly three endpoints. Adding a tarball dependency buys you
      types you'd hand-write anyway, and risks a Next 16 bundling problem at hour 11. Port the probe code
      into `lib/north.ts` instead. Revisit only if raw multipart upload misbehaves in a route handler.

**Next.js 16 caveat** — `AGENTS.md` in this repo warns this version has breaking changes vs. older
conventions, and points at `node_modules/next/dist/docs/`. Relevant from Block 4 onward (route handler
signatures, async params). Not relevant to the probes, which are plain Node scripts.

**Keep from the plan, confirmed:** LLM nodes (not agent nodes — temperature is read-only on agent nodes,
G8, and you need **0**). Model `north-large-01-2026` (G6). Publish before `/execute` (G3).

---

## Block 1 — Mock data ✅ DONE

- [x] `scripts/generate_data.py` — deterministic, re-runnable
- [x] Six CSVs + `corrections.json` in `data/`
- [x] Exactly four defects planted, Yanbu clean
- [x] `scripts/check_data.py` passes (exit 0)
- [x] Plan arithmetic verified: one row moves, **−15.4 kb**, **−$1.45M** on $66.50M

**Re-run after every data edit:**

```bash
python3 scripts/generate_data.py && python3 scripts/check_data.py
```

### Numbers you say out loud — do not let these drift

| Figure | Value | Where it comes from |
|---|---|---|
| JAZAN·DIESEL 12-month mean | **25.1 kb** | pinned exactly; history sums to 301.2 |
| Submitted (bad) | **41.2 kb** | `+64%` |
| Corrected | **25.8 kb** | `corrections.json` |
| October production swing | **−15.4 kb** | needs JAZAN DIESEL capacity **45.0**, not 40 |
| Revenue delta | **−$1.45M** on $66.50M | |
| Flags | **4** — 3 sources flagged, Yanbu clean | |

> JAZAN DIESEL `capacity` is **45.0** on purpose. At 40.0 the cap clips the bad 41.2 figure and the swing
> becomes 14.2, not 15.4. Don't "tidy" it.

---

## Block 2 — Platform probes

GATES.md answered most of the platform through the browser UI but never touched the REST API. These four
probes cover what it left open.

**Harness built and self-tested** (against a fake North mimicking the documented shapes — happy path,
structured-output-as-string, and library-not-read all behave correctly):

- [x] `scripts/north.mjs` — config, `.env.local` loader, token redaction
- [x] `scripts/probe-1-auth.mjs` — 2.1
- [x] `scripts/probe-2-execute.mjs` — 2.2 + 2.3 + 2.4 in one run
- [x] `PROBE-AUTOMATION.md` — the throwaway automation to run them against
- [x] `package.json` scripts: `probe:auth` · `probe:execute` · `probe` · `data` · `typecheck`

```bash
npm run probe:auth       # 2.1
npm run probe:execute    # 2.2 + 2.3 + 2.4
```

Config in `.env.local` (gitignored; no probe ever prints the token).

### 2.1 Auth / IAP — the go/no-go ✅ PASS (2026-08-06)

**HTTP 200 in 3528ms, `finish_reason=COMPLETE`. No IAP.** A bearer token works against
`/api/v1/chat` from a backend. **MOCK_MODE stays a fallback, not the architecture** — the live North path
is viable and `/api/validate` can call the real thing.

> ⚠️ **Your developer token expires 2026-08-11 10:47 UTC** (7-day token, issued 08-04). That is ~4.5 days
> out. If the demo lands after that, re-issue from `/developer` **and re-run `npm run probe:auth`** the
> morning of. A silently expired token looks exactly like the instance being down.

<details>
<summary>Original 2.1 procedure (kept for reference)</summary>

The quickstart warns that IAP-fronted deployments return
`401 Invalid IAP credentials: JWT signature is invalid`. A `*.democloud.cohere.com` host is a likely
candidate, and GATES.md never touched the API.

- [ ] Grab token from `https://zhoom.democloud.cohere.com/developer` → "Retrieve your token"

```bash
export MY_TOKEN=<paste>
export MY_NORTH=zhoom.democloud.cohere.com

curl -sS "https://$MY_NORTH/api/v1/chat" \
  -H "Authorization: Bearer $MY_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"messages":[{"role":"user","content":"ping"}],"stream":false,"thinking":{"type":"disabled"}}'
```

- [ ] **200** → proceed
- [ ] **401 IAP** → read `/reference/iap-authentication`; the SDK workaround is an extra
      `__Host-GCP_IAP_AUTH_TOKEN_xxx` header via `request_options.additional_headers`
- [ ] **If IAP can't be solved in 30 min: stop.** `MOCK_MODE` becomes the architecture, not the fallback.
      Build the North automation anyway (it demos in the builder), capture its JSON by hand, and drive the
      UI from `lib/mock/validate-response.json`. Decide this on Day 1, not Day 2 hour 11.

</details>

### 2.2 · 2.3 · 2.4 ⬅ YOU ARE HERE — one command away

The automation exists and is live. **Everything below is ticked except the run itself.**

```bash
npm run probe:execute
```

- [x] Build the `srop-ref` library (`ref_limits.csv` + `history_baseline.csv`) → **`Ready`** → 2 of 2 synced
- [x] Build + **publish** `zz srop probe` — **v1.0.0**, Private, published 2026-08-07
- [x] `NORTH_AUTOMATION_ID=a7223642-811b-4b21-82f9-db65baab06c9` filled in `.env.local`
- [x] **First real run 2026-08-07** — execution `ad20719a`, completed in 128s
- [ ] `npm run probe:execute` exits 0 ⬅ **re-run against v1.0.1**

### Results of run 1 (v1.0.0) — read this before touching the prompt again

| Gate | Result |
|---|---|
| **2.3 library + uploads** | ✅ **PASS** — evidence read `submitted demand_kb 41.2 kb vs 12-month mean 25.1 kb (+64.1%)`. Both numbers present. `srop-ref` **is** being read alongside the uploads. This was the risky unknown; it works. |
| **2.2 structured output** | ✅ **PASS in reality**, reported FAIL by a probe bug — see G-new-5. Schema was honoured; payload was at `output.data`. |
| **flag count** | ❌ **6 flags, expected 4** |
| **2.4 wall time** | ❌ **128s** vs 90s target. 122s of it in the one node; 172,531 input tokens (68,576 cached) across the agentic DI loop. |

**The two spurious flags were a merge artifact, not a hallucination in the loose sense.** Both were
`ZERO_OR_MISSING` with `row_ref: "month"`, claiming `demand_kb is NaN` and `price_usd is NaN`. There are no
blank or NaN cells anywhere in `sub_demand.csv` or `sub_prices.csv` — verified row by row. LPG-95 exists in
demand and not in prices, so joining the two frames produces NaN on both sides, and the model flagged its
own join output as submitted data.

**Source attribution was also wrong.** `HISTORICAL_DEVIATION` and `UNKNOWN_ENTITY` came back as
`Demand Planning`; `corrections.json` says both are OSPAS. Nothing in the prompt mapped filename → source
name, so the model guessed. `clean_sources` returned `["sub_inv_yanbu.csv"]` — a filename, not a source
name. Both break Pane 2 grouping and the `corrections.json` lookup, which keys off source.

**Fixed in v1.0.1** (published 2026-08-07): appended a `SOURCE ATTRIBUTION` table
(`sub_demand.csv → OSPAS`, `sub_prices.csv → Demand Planning`, `sub_inv_yanbu.csv → Refinery YANBU`,
`sub_inv_jazan.csv → Refinery JAZAN`), a rule that `clean_sources` uses source names not filenames, and an
`R3 SCOPE` rule forbidding flags on join/merge/reindex-derived values.

> **Do not "fix" the flag count by editing `data/`.** The data is correct — `check_data.py` is green and
> there are exactly four planted defects.

### Run 2 (v1.0.1) — and why the data interpreter is now gone

The v1.0.1 prompt fix made it **worse**: 266s, **1 flag**, and that flag was wrong. It reported
`FUEL-OIL 11.2 kb vs limits 2.5-10.0` — those are **Yanbu's** FUEL-OIL limits. Jazan's are `4.0-16.0`, so
11.2 is well inside them. The model joined on `product` alone and validated Jazan's inventory against
Yanbu's row. It also declared OSPAS and Demand Planning clean when both carry real defects.

| Version | Time | Flags | Failure |
|---|---|---|---|
| v1.0.0 | 128s | 6 | 2 fabricated from a join artifact; sources mislabelled |
| v1.0.1 | 266s | 1 | missed 3 of 4; survivor used the wrong plant's limits |

**Temperature was 0 for all of it.** This is not sampling noise — the DI loop wrote different pandas each
run and went wrong somewhere new each time. A demo whose entire claim is "validation caught exactly these
four things" cannot rest on that.

### v2.0.0 — data interpreter removed (2026-08-07)

The plan's own kill switch, taken deliberately rather than at hour 11.

- **Inputs are now three text fields:** `submissions_text`, `reference_text`, `source_label`.
  The `submissions` Files input is **deleted**.
- **No tools at all.** Data interpreter off, no library source, `Selected 0`. `@srop-ref` is gone from the
  instructions — the reference CSVs are inlined instead, so retrieval can't miss them either.
- **The instructions lead with a MATCHING RULE:** a submitted row matches a reference row only when
  refinery AND bulk_plant AND product all match; never compare against a different plant's row; an
  unmatched row is R4, not a limit breach. That is the v1.0.1 bug written as a rule.
- **`probe-2-execute.mjs` no longer uploads anything.** It reads the six CSVs from `data/`, wraps each in a
  `=== FILE: name ===` marker, and sends them as text.

**Size: 2.0 KB submissions + 4.0 KB reference ≈ 1,550 tokens**, against the 172,531 the loop was burning.

> `srop-ref` and the uploaded files still exist on the instance. Harmless, and worth keeping until the
> demo is recorded in case this decision gets revisited.

> Kept deliberately separate from the pre-existing **`srop-data`** library (18 files). The prompt promises
> the node exactly *two* reference files; pointing it at `srop-data` would have handed it eighteen.

**What was actually built** — `zz srop probe`, one **LLM** node named `validate`:

| Setting | Value |
|---|---|
| Model | `north-large-01-2026` |
| Tools | Data interpreter **on** |
| Sources | `srop-ref`, via `@`-mention in Instructions (see G-new-1) |
| Temperature · Retries | **0** · **3** |
| Default on failure | on — `flags: []`, `clean_sources: []`, `summary:` see Block 0 note |
| Output | Structured, `Fields (3)`, enums intact |
| Output template | `@validate` (non-empty — an empty one yields "No output") |
| Inputs | `submissions` (Files, **allow multiple** on) · `source_label` (Text) |

**2.2 — structured output.** `nodes[].output` is typed *"map from strings to any"* — a parsed object, not a
JSON string. The docs confirm the shape; what's unconfirmed is that an `Edit JSON` schema actually
populates it. The probe reports the real type per node and names the `node_id` values you key on.

**2.3 — `@submissions` + library together.** G7 proved DI reads *library* files. Untested: uploads **and**
library in one node. Proven by the `HISTORICAL_DEVIATION` evidence containing **both `41.2`** (upload)
**and `25.1`** (library). Missing 25.1 → `srop-ref` was never read.

**2.4 — wall time.** G2's 39s was a toy DI probe, not 4-file pandas. Under 90s keeps Node 2; over it,
cut Node 2 and hardcode the email templates.

`probe:execute` writes `scripts/out/last-execution.json`. **Type `lib/types.ts` against that file**, not
against the schema you asked for.

---

## Block 3 — The North build (~3h, Day 1)

> **Most of this is already done if you built `zz srop probe` for Block 2.** The probe automation *is*
> Node 1 with the real prompt and the real schema. Rename it to `SROP Validator`, add Node 2, re-publish.
> Steps already covered there are marked ↺.

- [x] ↺ Upload `ref_limits.csv` + `history_baseline.csv` to My files → **`Ready`**
- [x] ↺ Create library **`srop-ref`** from them → 2 of 2 synced, `READY`
- [x] ↺ Automation inputs: `submissions` (Files, allow multiple), `source_label` (Text) — ids match
      exactly; the probe sends these keys
- [x] ↺ **Node 1 `validate`** — LLM node, Data interpreter ON, `srop-ref` attached,
      model `north-large-01-2026`, **temperature 0**, retries **3**, default-on-failure on
- [x] ↺ Instructions = §5's four rules, "do not invent rules", evidence carries both numbers
- [x] ↺ Structured output via `Edit JSON` = §5 schema, **enums intact**, `Fields (3)` confirmed
- [x] **Output template filled** (`@validate`) — an empty one yields "No output"
- [x] **Published** Major → **v1.0.0**, Private, notes + description supplied
- [x] Renamed `zz srop probe` → **`SROP Validator`**. `NORTH_AUTOMATION_ID` is unchanged — the id survives
      a rename, so `.env.local` needed no edit
- [x] **Node 2 `draft_emails`** — LLM node, **no tools**, temperature 0, retries 3, default-on-failure
      `emails: []`. Structured output `{ emails: [{ flag_id, to, subject, body }] }`
- [x] Wired **`validate` → `draft_emails`**
- [x] Output template covers both nodes (`@validate @draft_emails`)
- [x] **Published v2.1.0** (Minor — output gains `emails`, inputs unchanged)
- [ ] `npm run probe:execute` against v2.1.0 ⬅ **not yet run; see below**

### Wiring: two things that will waste your time

- **The builder infers edge direction from vertical position, not from drag direction.** Dragging from
  `validate`'s *bottom* connector up to `draft_emails`' *top* connector produced an edge pointing
  **`draft_emails → validate`** — i.e. emails would have been drafted before any flags existed. The fix is
  to move the downstream node physically below, then connect. **Check the arrowhead before publishing.**
- **Dragging a node by its header renames it** instead of moving it, if the node is selected. Click empty
  canvas to deselect first, then drag from an empty part of the card body.
- New nodes are still inserted **above** the selected node and never auto-connected (as GATES said).

### Node 2's prompt earns its keep in one line

`Set flag_id to that flag's id exactly as it appears. The planner's UI keys every draft by flag_id; a
wrong or missing id silently drops the draft.` — `lib/north.ts` builds `emails` as a map keyed by
`flag_id`, and `page.tsx` reads `serverEmails[flagId]` with a client-side template fallback. A missing id
therefore fails *invisibly*: the UI just quietly uses its own draft.

---

## Block 4 — Route handlers + lib (~2.5h, Day 1)

- [x] Next app scaffolded — **Next 16.3 · React 19.2 · Tailwind 4 · TS**, at `srop-app/`
- [x] **`lib/types.ts`** — typed against `scripts/out/last-execution.json`. Includes the `Raw*` wire types
      (snake_case) so the mapping boundary is explicit and one-way
- [x] **`lib/plan.ts`** — `buildPlan()`, `totalRevenue()`, `applyCorrection()`. Pure, no I/O
- [x] **`POST /api/generate`** — calls `buildPlan()` twice, returns raw + resolved + delta. No gate check
- [x] **`scripts/plan.test.mjs`** — 5 tests, all green (`npm run test:plan`)
- [x] **`lib/mock/validate-response.json`** — derived from the real execution by `npm run mock`,
      never hand-written ⬅ **frontend is now unblocked**
- [x] `npm run check` = typecheck + tests. Both clean

### Two units/parsing landmines found while building this

- **`data/*.csv` are CRLF.** A naive `split('\n')` leaves a trailing `\r` on the **last column of every
  row** — which is exactly `demand_kb`, `price_usd` and `opening_inventory_kb`. `Number('30.3\r')` is
  `NaN`, so every quantity silently becomes 0 and the plan comes out empty without throwing. Split on
  `/\r?\n/`. papaparse handles this natively; hand-rolled parsers do not.
- **`demand_kb` is thousands of barrels; `price_usd` is dollars per barrel.** Revenue needs the ×1000.
  Without it the plan totals **$0.07M instead of $66.50M** — and it looks like working code, because
  every row is wrong by the same factor and the delta still has the right sign.

- [x] **`lib/csv.ts`** — CRLF-safe parser, `loadPlanInput()`, the `=== FILE: ===` text bundles, and
      `loadSubmissionMeta()` for Pane 1's headers/row counts. Hand-rolled, no papaparse
- [x] **`lib/north.ts`** — resolve → execute → poll → unwrap → map, plus `MOCK_MODE`. Ported from the
      probe, not rewritten
- [x] **`POST /api/validate`** — returns `ValidateResponse` + `meta { mock, elapsedMs, submissions }`
- [x] **`scripts/north.test.mjs`** — 9 more tests covering the envelope, CRLF and the mapping boundary

**Block 4 is done. `npm run check` → typecheck clean, 14/14 tests passing.**

```bash
npm run check       # typecheck + all tests — run before every commit
npm run test        # 14 tests across plan + north
npm run mock        # regenerate lib/mock/validate-response.json
MOCK_MODE=1 npm run dev   # UI with no North calls
```

### Three build-environment gotchas

- **`node --experimental-strip-types` rejects TypeScript parameter properties.**
  `constructor(readonly status?: number)` throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. `NorthError`
  declares its fields explicitly for this reason — don't "tidy" it back.
- **Raw Node ESM will not follow extensionless relative imports** the way Next's bundler does.
  `scripts/ts-resolve.mjs` registers a resolve hook that appends `.ts`, so app code keeps its normal
  `import './csv'` style and `allowImportingTsExtensions` stays off. Test-only; nothing in `app/` or
  `lib/` knows it exists.
- **`server-only` is not installed** and Block 4's scope rule forbids adding it. `lib/north.ts` reads
  `fs` and `NORTH_TOKEN`, so it must only ever be imported from a route handler or server component —
  enforced by a comment, not the compiler. Never import it from a `'use client'` file.

> ⚠️ **Untested here: `next dev` itself.** The agent sandbox is linux/arm64 while `node_modules` was
> installed on macOS, so the SWC binary won't load and the routes could not be exercised end to end.
> Typecheck and unit tests pass. **First thing to do on your machine:**
> `MOCK_MODE=1 npm run dev`, then `curl -X POST localhost:3000/api/validate` and `/api/generate`.

### Exact API shapes — as of v2.0.0

> **There is no upload step.** `POST /api/v1/files` and the `file` input variant are no longer used;
> the CSVs go in as text. Ignore any older instructions that say otherwise.

**1 — Resolve input ids** (`GET /api/v1/automations/{id}`) — **required, not optional**:

```
→ { "input_parameters": [ { "input_id": "...", "name": "...", "input_type": "text", "required": true }, ... ] }
```

`input_id` is generated and does **not** equal `name`. On this automation they happen to be
`submissions` → `submissions`, `source_label` → **`sourceLabel`**, `submissions_text` →
**`submissionsText`**, `reference_text` → **`referenceText`** — i.e. camelCased, but do not rely on that
rule. Resolve at runtime. See G-new-4.

**2 — Execute** (`POST /api/v1/automations/{id}/execute`), all three inputs are `text`:

```json
{ "inputs": {
    "<input_id of submissions_text>": { "type": "text", "value": "=== FILE: sub_demand.csv ===\n..." },
    "<input_id of reference_text>":   { "type": "text", "value": "=== FILE: ref_limits.csv ===\n..." },
    "<input_id of source_label>":     { "type": "text", "value": "OSPAS demand + Demand Planning prices + Yanbu/Jazan inventory" }
}}
```

Each file is wrapped in a `=== FILE: name ===` marker — that marker is what the source-attribution table
in the prompt keys off. Variants confirmed against the live docs 2026-08-07:
`file` · `text` · `select` · `list` · `object`, each `{type, value}`; `text.value` is a plain string.

**3 — Poll** (`GET /api/v1/automations/executions/{id}?include_nodes=true`, every 2s):

```
status: pending | queued | running | completed | failed | cancelled
```

Poll until it leaves the first three. A completed run takes **~27s**, so a 120s ceiling is ample —
but keep the timeout overridable; a 180s ceiling was hit on the old DI build and cost a blind re-run.
`nodes[].output` is the **agent envelope**, not the bare schema object — unwrap `.data` (G-new-5).

- [ ] Map snake_case → camelCase **once**, at the route-handler boundary. Never let snake_case reach a component
- [ ] Backend filters `flags[]` to the four known rule names and caps at 6

> **Demo with `next dev`, never a deployed build.** A route handler awaiting a 90s poll is fine locally and
> killed on Vercel's default timeout.

---

## Block 5 — Frontend (~4h, Day 2)

Built against the five jobs in §7.0. Runs on `MOCK_MODE=1` until Block 6. Full brief: `BLOCK-5-BRIEF.md`.

- [x] `page.tsx` `'use client'` owns **all** state. `openCount` **derived, never stored** — and it counts
      `open` + `awaiting_response` + `responded`, so a flag that has replied but not been accepted still
      holds the gate shut
- [x] **Pane 1 — Submissions** (`app/components/SubmissionsPane.tsx`). Four cards: sender, filename,
      arrival time, row count, column headers. Headers come from `meta.submissions` and visibly differ
- [x] **Pane 2 — Flags** (`FlagsPane.tsx`). Grouped by source, clean sources listed separately.
      Evidence rendered verbatim in monospace. Exactly two buttons per card
- [x] Send query email → `awaiting_response` → **Simulate response** → accept → `corrected`
- [x] "Accept as justified" rejects an empty reason
- [x] Counter: `N of 4 flags open`
- [x] **Pane 3 — SROP Plan** (`PlanPane.tsx`). Locked until `openCount === 0`; the click still registers
      and fires `animate-shake` (hand-written keyframes in `globals.css` — Tailwind ships no shake)
- [x] Two-column table: Submitted · Validated · **Δ**, changed row highlighted amber, headline
      `$66.50M → $65.06M` with `-$1.45M`
- [x] **LPG-95** renders as an explicit *"excluded — no reference limits"* row, placed first so it's
      visible without scrolling

**Verified against the definition of done:** no new dependencies, `lib/` `scripts/` `data/` `app/api/`
untouched, `npm run check` green. Arithmetic re-checked end to end through the real route logic —
`raw`/`resolved` are row-aligned, exactly one row moves, October JAZAN DIESEL swings **41.2 → 25.8
(−15.4 kb)**, revenue **$66.50M → $65.06M (−$1.45M)**.

### Added after review

- [x] **`scripts/demo-data.test.mjs`** — `app/demo-data.ts` hand-copies `data/corrections.json` (it has to:
      `data/` is server-only). That duplication can drift silently, and the failure mode is nasty —
      `Simulate response` returns a stale corrected value and the −15.4 kb swing quietly stops matching.
      Two tests now pin them together. `data/corrections.json` is authoritative.
- [x] `scripts/ts-resolve.mjs` also resolves the `@/*` alias, so tests can import from `app/`

**Visual rules:** dark background, one accent colour, monospace numbers, **≥16px** (judges are 3m away),
no animations except the validation spinner. **No component library** — shadcn will eat an hour and give
judges nothing.

---

## Block 6 — Wire live + rehearse (~2h, Day 2)

**Run from `DEMO-RUNBOOK.md` on the day** — pre-flight commands, the minute-by-minute script with the
exact spoken numbers, the failure playbook, and the rehearsal log.

- [x] **Prefetch decision made: keep it, narrate honestly.** `page.tsx` fetches `/api/validate` on page
      load, so **Run Validation** reveals a result that already exists behind a 1.1s spinner. The 0:25 line
      in the runbook is written to be true — *"this has already been run against these four files"*.
      **Do not say "it's running now."** If asked directly: *"it runs in about 25 seconds against the live
      instance; I prefetch it so we're not watching a spinner."*
- [x] **Font sizes fixed for 3m legibility.** `text-sm` (14px) was on things judges need to read. Now
      `text-base` or larger: source group headers, severity badges, the `rowRef` line, the plan table
      header, and Pane 1's row counts **and column headers** — that last one matters most, since job 1
      rests on the judges *seeing* the headers differ, and they were 14px grey and truncated.
      The **evidence line is now `text-lg`**, the largest thing on a flag card. It's the 1:05 claim.
      Remaining `text-sm` is secondary chrome (field labels inside an expanded draft) read by the
      presenter up close, not from the back of the room.
- [x] **Backup server scripted:** `npm run demo:backup` → port 3001, `MOCK_MODE=1`.
      `npm run dev:mock` added for rehearsal without burning North executions.
- [ ] Flip off `MOCK_MODE`, run once live, fix shape mismatches
- [ ] **Both servers running in tabs before you present** — 3000 live, 3001 mock. Non-negotiable
- [ ] **Record a 4-minute screen capture of a successful run the night before**
- [ ] **Three full rehearsals**, under 4:00 — log them in the runbook
- [ ] Rehearse the *failure* path at least once: kill 3000, switch to 3001 mid-sentence

> Most hackathon losses are narration, not code. If you're running long, cut from the middle — never the payoff.

---

## Kill switches

| Risk | Switch |
|---|---|
| ~~IAP blocks the API~~ | ✅ **Ruled out** by probe 2.1 — 200, no proxy |
| **Developer token expires 2026-08-11 10:47 UTC** | Re-issue at `/developer`, re-run `npm run probe:auth` the morning of the demo. An expired token looks exactly like the instance being down |
| North flaky on the day | Canned `validate-response.json`; port 3001 already running |
| DI refuses a file / times out | Pre-parse CSVs with `papaparse` into JSON, pass as **text** in the prompt. 60 rows fits in context. Drops the "reads real files" line, keeps the demo |
| Run >90s | Cut Node 2, hardcode email templates |
| Model invents a fifth flag | Temperature 0 + enums + backend filter to the four rule names, cap 6 |
| Structured output not honoured | "Return only JSON, no prose" + parse with a repair pass |
| Live typing fails on stage | Pre-fill the edited email; only *pretend* to type the last word |
| Everything breaks | Play the recording and narrate over it. Judges forgive that; they don't forgive silence |

---

## Not being built — say this fast and unapologetically

Auth · stakeholder portal · real email delivery · draft-review loop · audit archive · the optimizer itself.

*A team that knows exactly what it didn't build reads as a team that made choices.*
