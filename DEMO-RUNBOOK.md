# Demo runbook

Everything needed on the day. Print it or keep it on the second screen.

---

## T-minus: pre-flight

Run in order. If any step fails, the fallback is in **Failure playbook** below.

```bash
cd ~/Desktop/"new hackathon"/srop-app

npm run data            # 1. regenerates + verifies the CSVs. Must say "PASS - exactly the four planted defects"
npm run check           # 2. typecheck + 16 tests. Must be 16/16
npm run probe:auth      # 3. token still valid?  ⚠️ EXPIRES 2026-08-11 10:47 UTC
npm run probe:execute   # 4. live run. Want: 4 flags, Yanbu clean, wall time under 90s
npm run mock            # 5. refresh the fixture from that run
```

**Then start both servers and leave them running:**

```bash
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
