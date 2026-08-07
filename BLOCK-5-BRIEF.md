# Block 5 — Frontend brief

Everything a fresh session needs to build the UI. Blocks 1, 2 and 4 are done; the backend is finished and
tested. **This block is `app/page.tsx` plus three presentational components. Nothing else.**

---

## Read first, in this order

1. **`../demo-implementation-plan.md` §7 and §8** — §7.0's five jobs are the spec, §8 is the narration.
   The narration *is* the acceptance criteria: if you can't perform §8 against the UI, it isn't done.
2. **`lib/types.ts`** — the contract. Everything imports from here. Don't redefine these shapes.
3. **`lib/mock/validate-response.json`** — the exact payload you'll render.
4. **`CHECKLIST.md` Block 5** — the tick list, plus the visual rules.

Don't re-derive any of this. It's all been checked against the live instance.

---

## Run it in mock mode

```bash
MOCK_MODE=1 npm run dev     # no North calls, instant responses
npm run check               # typecheck + 14 tests — must stay green
```

`next dev` **only**. Never a deployed build: `/api/validate` awaits a ~27s poll that a serverless platform
would kill.

> ⚠️ `next dev` has not yet been run by anyone. If it fails to boot, that's environmental, not your code —
> most likely `npm install` needs re-running for this machine's architecture.

---

## The contract

### `POST /api/validate` → `ValidateResponse & { meta }`

Takes no body. In `MOCK_MODE=1` it returns the fixture instantly; otherwise ~27s.

```jsonc
{
  "flags": [ /* 4 of these */ {
    "id": "R1_JAZAN_BP-JAZAN_DIESEL_2026-10",
    "source": "OSPAS",                    // one of the 4 stakeholder names
    "file": "sub_demand.csv",
    "rule": "HISTORICAL_DEVIATION",       // 4 possible values, see types.ts
    "severity": "high",                   // high | medium | low
    "field": "demand_kb",
    "rowRef": "refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10",
    "submittedValue": "41.2",
    "evidence": "submitted 41.2 kb vs 12-month mean 25.1 kb (+64%)",
    "plainEnglish": "Submitted demand for DIESEL at JAZAN refinery in October 2026 is 41.2 kb, …",
    "status": "open"                      // always "open" on arrival
  }],
  "cleanSources": ["Refinery YANBU"],
  "summary": "Found 4 validation flags …",
  "emails": {},                           // EMPTY — Node 2 doesn't exist yet, see below
  "meta": {
    "mock": true,
    "elapsedMs": 3,
    "submissions": [                      // ← Pane 1 renders from this
      { "file": "sub_demand.csv", "source": "OSPAS", "columns": ["refinery","bulk_plant","product","month","demand_kb"], "rowCount": 33 }
    ]
  }
}
```

**`evidence` is the 1:05 line.** It already contains both numbers. Render it verbatim, monospace, and do
not truncate it.

**`meta.submissions` gives you Pane 1's row counts and column headers.** The headers differ between files
on purpose — that heterogeneity is job 1. Four identical-looking cards undercut the whole pane.
Arrival timestamps aren't in the payload; fake them client-side as fixed offsets (they only need to look
like four different arrival times).

### `POST /api/generate` → `GenerateResponse`

Body is optional — `{}` works, the CSVs live on the server. Send corrections when you have them:

```jsonc
{ "corrections": { "HISTORICAL_DEVIATION": 25.8 } }
```

```jsonc
{
  "raw":      [ { "month": "2026-09", "refinery": "JAZAN", "product": "DIESEL",
                  "production": 12.9, "closing": 2.0, "shortfall": 0, "revenue": 2336800 } ],
  "resolved": [ /* same shape */ ],
  "excluded": ["JAZAN|BP-JAZAN|LPG-95"],
  "rawRevenue": 66504556,
  "resolvedRevenue": 65059420,
  "deltaRevenue": -1445136
}
```

`raw` and `resolved` are **row-aligned** — same length, same order — so a two-column table is a direct
zip. Revenue is in dollars; format as `$66.50M`.

---

## Three things that are easy to get wrong

**1. Corrections are keyed by `Rule`, not by flag id.** `data/corrections.json` maps rule name → the
stakeholder's reply. Flag ids are model-generated and would break the moment North rephrases one.

```jsonc
{ "HISTORICAL_DEVIATION": { "from": "OSPAS", "reply": "…transcription error…",
                            "correctedValue": 25.8, "movesThePlan": true },
  "LIMIT_BREACH":  { "correctedValue": null, "movesThePlan": false },
  "ZERO_OR_MISSING": { "correctedValue": null, "movesThePlan": false },
  "UNKNOWN_ENTITY":  { "correctedValue": null, "movesThePlan": false } }
```

Only `HISTORICAL_DEVIATION` returns a number. **The other three resolve without changing data** — that
ratio is deliberate and honest: most queries end in a justification, not a correction. `Simulate response`
should read `reply` and `correctedValue` straight out of this file.

**2. `emails` is `{}` — Node 2 doesn't exist yet.** Build the email draft with a client-side template
from the flag's own fields, and read `emails[flag.id]` first if present. That way wiring Node 2 later
changes nothing in the UI. Keep drafts under 90 words, no greeting fluff, sign off "SROP Planning".

**3. `excluded` contains LPG-95** (`JAZAN|BP-JAZAN|LPG-95`). It gets *justified*, not removed, so it
survives into the resolved dataset with no limits and no price and cannot be planned. Show it as an
explicit **"excluded — no reference limits"** row in Pane 3 rather than dropping it silently.

---

## Hard constraints

| Thing | Rule |
|---|---|
| State | **All** of it in `page.tsx` (`'use client'`). Three child components take props and hold none |
| `openCount` | **Derived, never stored.** Counter and gate must read one source or they'll disagree on stage |
| Styling | **Tailwind only.** No shadcn, no component library — an hour spent, nothing a judge can see |
| Dependencies | **None new.** Everything needed is installed |
| Persistence | No localStorage, no DB, no auth, no real email. All state is React state |
| Font size | **≥16px** — judges are 3 metres away. Dark bg, one accent colour, monospace numbers |
| Animation | Only the validation spinner, and the gate's refusal shake |
| Don't touch | `lib/`, `scripts/`, `data/`, `app/api/` — all done and tested. If you think you need a backend change, say so first |

---

## The gate is the most important element on screen

Pane 3's button stays disabled until `openCount === 0`, captioned *"Resolve all 4 flags to generate — 3
still open"*. **The click must still register while locked** — it shakes and surfaces the blocking rule.
At 2:45 the presenter clicks it deliberately, gets refused, closes the last flag, and it unlocks. A button
that silently does nothing kills that beat.

State machine:

```
open ──send query──▶ awaiting_response ──simulate──▶ responded ──accept──▶ corrected
  └──justify (typed reason REQUIRED, empty rejected)───────────────────────▶ justified
```

`openCount` counts `open` + `awaiting_response` + `responded`. "Accept as justified" **must reject an
empty reason** — the logged rationale is the audit trail, and that's job 3.

---

## Definition of done

Perform §8 end to end without touching anything outside the browser:

- [ ] Pane 1 shows four visibly different cards, then **Run Validation**
- [ ] Four flags appear grouped by source; Yanbu shows clean
- [ ] Flag #1's evidence line reads `41.2 … 25.1 … +64%` and is legible from across the room
- [ ] Email draft expands inline, is editable, sends → `awaiting response`
- [ ] **Simulate response** returns 25.8 → accept → data mutates
- [ ] Two flags accepted with typed reasons; empty reason is refused
- [ ] Counter counts down to `0 of 4 flags open`
- [ ] **Generate clicked while locked → visible refusal**, then unlocks
- [ ] Two-column table: as-submitted vs after-validation, Δ column, **−15.4 kb** on October JAZAN DIESEL
- [ ] Headline revenue `$66.50M → $65.06M`, delta **−$1.45M**
- [ ] LPG-95 shown as excluded, not silently missing
- [ ] `npm run check` still green

**The 3:05 two-column table is the demo.** If time runs short, cut from the middle — never from that.
