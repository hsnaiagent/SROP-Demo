# Demo runbook — version 2

Everything needed on the day. Print it or keep it on the second screen.

**This runbook covers the version 2 platform** — eleven screens, seven identities, the
full monthly cycle. The version 1 three-pane build and its script live on `main`.

---

## T-minus: pre-flight

```powershell
cd C:\Users\huawel\Desktop\Vibecoders\SROP-Demo

npm run data      # 1. regenerate + verify the fixtures.
                  #    Must say "PASS - exactly the eight planted defects"
npm run check     # 2. typecheck + 20 unit tests. Must be 20/20
npm run dev       # 3. leave running on port 3000
npm run smoke     # 4. in a second terminal. Must be 50/50
```

`npm run smoke` drives the entire cycle through the API and asserts every gate, every
agent and every pinned number. If it is 50/50 the demo works. It finishes with the
cycle archived, so **reset before presenting**: Cycle Home → Demo controls → Reset
cycle.

**Nothing here touches the network.** There is no token, no external service and no
expiry. The rules engine is deterministic TypeScript and the language layer is
templates, so the platform behaves identically offline.

**Last checks:**

- [ ] Reset the cycle so you start on "Start new cycle"
- [ ] Role switcher set to `Y — SROP Planner`
- [ ] Browser zoom so the evidence line is readable from the back of the room
- [ ] Notifications / Slack / email quit
- [ ] Second tab on `npm run demo:backup` (port 3001) as a fallback

---

## The numbers

Verified 2026-08-07. `npm run check` and `npm run smoke` both assert these.

| Figure | Value | Where it shows |
|---|---|---|
| JAZAN BP-JAZAN DIESEL, Oct submitted | **41.2 kb** | flag evidence line |
| its 12-month mean | **25.1 kb** | same line |
| deviation | **+64%** | same line |
| corrected to | **25.8 kb** | OSPAS reply |
| production swing | **−15.4 kb** | plan-impact line, before commit |
| revenue swing | **−$1.45M** | same line |
| planned revenue, final | **$141.54M** | plan headline strip |
| planned volume | **1,714 kb** | plan headline strip |
| rows with a shortfall | **2** | plan headline strip |
| rows outside their band | **3** | plan headline strip |
| plan rows | **84** | Feasibility tab |
| planted defects | **8** | validation screen |

The shortfalls and band breaches are all at **BP-QASSIM JET-A1** — the seasonal uplift
series. That is the best unscripted moment in the demo: the uplift is *legitimate*, it
gets justified with a threshold override, and the plan is still infeasible because the
uplift exceeds Qassim's capacity. Validation passed and the plan is still wrong, which
is exactly what the Feasibility tab exists to catch.

---

## The five minutes

| Time | Screen | Say |
|---|---|---|
| **0:00** | Cycle Home, no cycle | "One planner runs this today. Four months ahead, six data sources, all Excel, all email. Watch what the platform holds him to." Click **Start new cycle**. |
| **0:20** | Requests | Type *"Standard monthly pull. Also ask Jazan about the October outage."* → "He describes it. The orchestrator drafts six requests, compares them against last cycle so nothing routine is dropped, and marks the one ad-hoc ask **new this cycle**. It does not send — he reviews first." Send. |
| **0:50** | Role switcher → a refinery → Submit Data | "Every stakeholder gets a link. They upload themselves. No mailbox, no version confusion." Submit two or three sources. |
| **1:20** | Submissions | "Five in, one silent. One validation agent per source, running independently." Click **Validate**. |
| **1:40** | Validation | "Eight anomalies. It doesn't say *wrong* — it shows both numbers." Read the JAZAN line: "**41.2** against a 12-month mean of **25.1**. Plus **64%**. Check it yourself." |
| **2:10** | Validation | Send the query, **Simulate reply**, then stop on the confirmation. "**This** is the line that matters. Before he commits, it tells him the fix is worth **one and a half million dollars**. That's the difference between correcting data and understanding it." Accept. |
| **2:40** | Validation | Open the Qassim flag → **Raise threshold for this series** → 120%, reason *Hajj season uplift*. "Three flags close at once, with his reason attached. It's standing policy now, visible on the dashboard — not a note in someone's head." |
| **3:00** | Cycle Home | "The silent one." **Skip a week** → the fallback card appears. "Day three reminder, day five escalation to the department head. Day seven it does **not** decide — carrying stale data into a plan is a business decision." Confirm the fallback. |
| **3:20** | Master File & Plan | "Every flag resolved, so Gate 1 opens." Build → show a source trace → Approve → **Run plan**. |
| **3:40** | Feasibility tab | "**Two rows with a shortfall**, three outside their tank band." Click the shortfall stat. "All at Qassim. That uplift was legitimate — and the plan still can't serve it, because it exceeds capacity. Validation passed and the plan is still wrong. That's why this tab exists." |
| **4:10** | Reasonableness tab | "Same rows, different question: is this plausible against history. A plan can satisfy every constraint and still be wrong." Issue the draft. |
| **4:30** | Role switcher → Refinery RABIGH → Review | "Their rows, next to their own capacity and tank band — which is what they actually need to answer the question. And they can propose a change." **Check and submit** → the verdict. "It caught that they also changed a price they don't own. Held, not applied, and it told *them* first." |
| **4:50** | Draft SROP Review → publish | "He works the queue, reruns, and publishes. Gate 4 won't let him publish over an unresolved comment or a stale plan." |

**The 2:10 beat is the demo.** If you are running long, cut 0:50 and 4:10. Never cut the
plan-impact line or the Qassim shortfall.

---

## Failure playbook

| What breaks | Do |
|---|---|
| **A gate won't open** | Read the reason next to it — it always says what is blocking. Usually an undecided excluded series or a source that never reported. |
| **Cycle is in a weird state** | Cycle Home → Demo controls → **Reset cycle**. Five seconds, and `data/` is untouched. |
| **The dev server dies** | Switch to the port 3001 tab. State is on disk, so nothing is lost. |
| **A number on screen disagrees with this table** | Trust the screen and move on. Do not debug live. |
| **Everything breaks** | Play the recording and narrate over it. |

---

## Rehearsal log

| # | Date | Time | What went wrong | Fixed? |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

Target: **under 5:00** with the 2:10 plan-impact beat landing on time.

---

## What is real and what is not

Say this fast and unapologetically.

**Real:** the six validation rules and their arithmetic · the four gates · per-source
validation · the SLA and escalation ladder · field-level authority · the full audit
trail · persistence across a refresh · the master workbook and its source trace.

**Not real:** authentication is a role switcher · uploads are acknowledged then the
pre-generated fixture is used · email is drafted and stored, never delivered · the LP
model is deterministic arithmetic, not an optimizer · no SAP or upstream APIs.

If asked why the rules are code rather than a model: three earlier runs at temperature
zero produced three different wrong answers, including validating one refinery's tank
levels against another's limits. A validation a planner cannot reproduce is one he
cannot defend. See [CHECKLIST.md](CHECKLIST.md).

The agent **logic** is the deliverable and it is specified in
[version2.md](version2.md) §9 — inputs, outputs, rules and failure behaviour for all
four agents, on any runtime.
