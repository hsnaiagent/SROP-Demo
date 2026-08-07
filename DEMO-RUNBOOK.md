# Demo runbook

Everything needed on the day. Print it or keep it on the second screen.

**This runbook covers the version 1 app — the one that runs today.** Every beat below
is against the three-pane build in `app/`. Version 2 replaces one of those beats and
moves another; the delta is in **When version 2 ships**, at the end. Do not mix the two
scripts. Until v2 is built, the script below is the demo.

---

## T-minus: pre-flight

Run in order. If any step fails, the fallback is in **Failure playbook** below.

```powershell
cd C:\Users\huawel\Desktop\Vibecoders\SROP-Demo

npm run data            # 1. regenerates + verifies the CSVs. Must say "PASS - exactly the four planted defects"
npm run check           # 2. typecheck + 16 tests. Must be 16/16
npm run probe:auth      # 3. token still valid?  ⚠️ EXPIRES 2026-08-11 10:47 UTC
npm run probe:execute   # 4. live run. Want: 4 flags, Yanbu clean, wall time under 90s
npm run mock            # 5. refresh the fixture from that run
```

⚠️ **Step 1 fails on this machine as written.** `npm run data` invokes `python3`, which
does not resolve here — Windows answers with the Microsoft Store shim and exit code
9009. The interpreter is on the path as `python` (3.13.5). Run the two scripts directly
instead:

```powershell
python scripts/generate_data.py
python scripts/check_data.py     # must say "PASS - exactly the four planted defects"
```

Or skip step 1 entirely. `data/` is committed, and `npm run check` proves the four
defects are intact without regenerating anything. Do not "fix" `package.json` on demo
day — verified 16/16 on 2026-08-07 with the data exactly as committed.

**Then start both servers and leave them running:**

```powershell
npm run dev             # terminal 1 — port 3000, LIVE. This is the demo.
npm run demo:backup     # terminal 2 — port 3001, MOCK_MODE. Never touched unless 3000 dies.
```

Open **both** in tabs before you present. Switching tabs mid-demo is one keystroke;
starting a server mid-demo is thirty seconds of silence.

**Last checks:**

- [ ] Browser zoom set so the evidence line is readable from the back of the room
- [ ] Notifications / Slack / email quit
- [ ] Backup recording open in a third tab, paused at 0:00
- [ ] `data/` untouched since the last `npm run data`

---

## The four minutes

Numbers in **bold** are said out loud. They come from `check_data.py` and
`scripts/plan.test.mjs`, both of which are green — if the screen disagrees with this
table, trust the screen and adjust, don't argue with it.

| Time | On screen | Say |
|---|---|---|
| **0:00** | Pane 1, four cards | "Four departments, four files, four different formats, arriving whenever they arrive. Today one person opens all of these in Excel and eyeballs them." |
| **0:20** | Point at the differing column headers | "Different columns, different shapes, no shared source of truth." |
| **0:25** | Click **Run Validation** | "This has already been run against these four files by a validation agent that has the 12-month history and every refinery's tank limits." |
| **0:45** | Four flags, three sources red, Yanbu green | "Yanbu is clean. Three sources have problems — and it doesn't just say *wrong*, it shows you both numbers." |
| **1:05** | Read flag #1's evidence line | "**41.2** against a 12-month mean of **25.1**. Plus **64%**. You can check that yourself in two seconds — that's the difference between a tool you trust and one you don't." |
| **1:30** | Hover between the two buttons | "Notice what it did *not* do: it didn't fix anything. Every flag goes through the planner — accept it, or ask the source." |
| **1:45** | Expand the email draft, edit a word, **Send** | "The planner doesn't write this. It's drafted with the numbers already in it." |
| **2:05** | **Simulate response** → **25.8** → Accept | "In production Jazan re-uploads. Here I'm triggering it. They came back with **25.8** — it was a transcription error." |
| **2:25** | Justify the other two with typed reasons | "Zero price is a real holiday shutdown. Accept, log the reason — and now it's in the record instead of in someone's head." |
| **2:45** | **Click Generate while a flag is still open** → it shakes | "It won't run. Not a warning — a gate. Bad data cannot reach the optimizer." Close the last flag; the button unlocks. |
| **3:05** | Two-column table | "Left column: the plan we'd have shipped on the data as submitted. Right: after validation. **15.4 kb** swing in October, **$66.50M** down to **$65.06M** — **$1.45 million** — from one flag." |
| **3:35** | — | "Today this is three weeks and one person's memory. The optimizer is stubbed — Aramco has one, it drops in behind the same interface. What we built is everything around it." |

**The 3:05 beat is the demo.** If you are running long, cut 1:45–2:25 down to a single
flag. Never cut the two-column table.

> In version 2 this beat moves to 2:05 and the two-column table is gone. See
> **When version 2 ships**. Nothing changes for the v1 demo.

### On the 0:25 line

Validation is fetched when the page loads, so **Run Validation** reveals a result that
already exists. The line above is written to be true. Do not say "it's running now"
while the 1.1s spinner turns. If a judge asks directly: *"it runs in about 25 seconds
against the live instance; I prefetch it so we're not watching a spinner."* That is a
better answer than a surprised one.

---

## Failure playbook

Rehearse the first two at least once — knowing the recovery is what stops the panic.

| What breaks | Tell | Do |
|---|---|---|
| **North is down / slow / 401** | Pane 1 shows an error, or Run Validation hangs | Switch to the **port 3001 tab**. Say nothing about it. Everything downstream is identical. |
| **Token expired** | Same as above; `probe:auth` would say 401 | Same fix — port 3001. Re-issuing a token mid-demo is not a thing you do on stage. |
| **Flags come back wrong** (not 4, wrong sources) | Pane 2 looks off | Port 3001. The fixture is a known-good real response. |
| **Gate won't unlock** | Counter stuck above 0 | A flag is in `responded` — it needs **Accept**, not just Simulate. Accept it. |
| **Plan table looks wrong** | Numbers don't match the table above | Don't debug live. Narrate the delta column and move to the close. |
| **Everything breaks** | — | Play the recording and narrate over it. Judges forgive that; they don't forgive silence. |

---

## Rehearsal log

Three full run-throughs, timed, no stopping to fix things.

| # | Date | Time | What went wrong | Fixed? |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

Target: **under 4:00** with the 3:05 beat landing on time. If a run goes long, cut
narration, not features — the build is finished and every cut costs less than a
half-explained pane.

---

## What we did not build — say this fast and unapologetically

Auth · stakeholder portal · real email delivery · draft-review loop · audit archive ·
the optimizer itself.

*A team that knows exactly what it didn't build reads as a team that made choices.*

---

## When version 2 ships

Everything above stays valid until the v2 build replaces `app/`. This section is the
delta, so the script can be rewritten in one sitting rather than rediscovered. The full
spec is [version2.md](version2.md).

### The 3:05 table is gone, and the number moves earlier

Version 1 ends on a two-column table comparing the plan as submitted against the plan
after validation. Across ~32 rows, one row differs. It was retired in v2 because it
answers a question the planner has already answered — he made every correction himself,
one at a time, and approved each one.

The arithmetic survives. It moves to the moment Y accepts a correction, where it is
shown as one line on the confirmation step (version2.md §7.4):

> Applying **25.8** changes October production at BP-JAZAN by **−15.4 kb** and plan
> revenue by **−$1.45M**.

**This is a better beat, not a lost one.** The money lands at the instant of the human
decision instead of forty seconds later in a table, and it makes a sharper point: the
platform tells the planner what a correction is worth *before* he commits it. The
numbers are unchanged and `scripts/plan.test.mjs` still asserts them — test 16, green.

Say it roughly like this, on the Accept click:

> "Watch the confirmation. It doesn't just apply the fix — it tells him the fix is worth
> **one and a half million dollars** before he clicks. That's the difference between
> correcting data and understanding it."

### What the plan screen shows instead

Two tabs, both against real references (version2.md §7.6):

- **Feasibility** — demand, production, capacity and utilization, closing inventory
  against the min–max band, and shortfall. Sorted worst-first.
- **Reasonableness** — planned against the 12-month baseline and against last cycle.

Plus a headline strip counting rows with a shortfall and rows outside their band. On a
healthy plan both read zero, which is itself the line to say: *"the check is that these
are zero, and you can see at a glance that they are."*

### New beats available

v2 makes the whole cycle demonstrable, so the four minutes get rebalanced. Candidates,
in rough priority:

| Beat | Why it earns its time |
|---|---|
| Role switcher → a refinery uploads its own file | Kills the "where does the data come from" question before it is asked |
| A silent stakeholder → reminder → escalation → assumed-data fallback | The escalation problem is the one Y described most vividly; nothing in v1 shows it |
| Correction confirmation with the $1.45M line | The money beat, relocated |
| Stakeholder rejects the draft with a comment → Y accepts → rerun → v2 issued | Closes the loop the v1 demo could only narrate |
| Feasibility tab with a shortfall row | Proves the plan is being checked, not just produced |

### What the closing line becomes

The "did not build" list shrinks to the things that are still genuinely fake: real
authentication, real file ingestion, real email delivery, SAP APIs, and the optimizer.
Portal, draft-review loop, escalation and audit all move from *narrated* to *shown*.

### Pre-flight changes

- `npm run data` regenerates a larger set — four refineries, six bulk plants, six
  products, eight planted defects. `check_data.py` must be updated to assert all eight.
- `npm run check` will report more than 16 tests; the count in the pre-flight block
  above needs updating to whatever the v2 suite lands on.
- A cycle-state reset step is needed, since v2 persists to `data/state/`. A demo that
  starts mid-cycle because the last rehearsal left state behind is the most likely new
  failure mode, and it belongs in the failure playbook.
