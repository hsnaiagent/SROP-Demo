# SROP Automation Platform — Full Business Logic Scope

## 1. Purpose & Framing

This document translates the current manual SROP (Short Range Operating Plan) process, run by a single planner (**"Y"**), into a full business-logic scope for the proposed platform. It covers: actors, data objects, the end-to-end process across a monthly cycle, the rules engine that drives validation/escalation/approval, the state model for tracking submissions and drafts, and a list of edge cases that still need a business decision before this can go to solution design.

Two source-document inconsistencies are carried forward and should be resolved: **"OSPAS"** vs **"OPAS"** department (assumed to be the same entity — demand-per-refinery-per-bulk-plant-per-product provider) and whether Demand Planning and OSPAS are two separate departments or one (assumed separate: Demand Planning → prices, OSPAS → demand).

---

## 2. Actors

| Actor | Role in process |
|---|---|
| **Y (SROP Planner/Owner)** | Initiates each monthly cycle, defines data requests, resolves validation flags, triggers LP runs, approves drafts, resolves stakeholder comments, publishes final SROP. Sole actor with system-wide authority. |
| **Demand Planning Dept** | Supplies product prices. |
| **OSPAS Department** | Supplies product demand per refinery per bulk plant, for the 4-month horizon. |
| **Refineries** | Supply opening inventory (tank levels), bulk-plant limits/min-max/outage data; review and approve/comment on their portion of the Draft/Final SROP. |
| **Finance** (and other downstream consumers) | Reviews and approves Draft/Final SROP from a financial-impact lens; consumes Final SROP for downstream work. |
| **Stakeholders' management** | Escalation target when a stakeholder is non-responsive. |
| **Orchestrator (platform/system)** | Coordinates requests, storage, notifications, versioning, and hand-offs between agents and the LP model. |
| **Validation AI Agent(s)** | Run per submission, in parallel, to flag anomalies against historical baseline and refinery limit tables. |
| **Intake Agent** | Maps validated, per-source data into the standardized multi-sheet Excel template consumed by the LP model. |
| **File-Recognition Agent** (Phase 6) | Reads a stakeholder's re-uploaded file, confirms only their authorized fields changed, flags anything else to Y. |
| **LP Model** (external, pre-existing) | Black-box optimization engine; takes the master template, returns Draft SROP. |

---

## 3. Core Data Objects

- **Historical Data** — baseline used for outlier detection (loaded once, then incrementally extended each cycle).
- **Refinery Reference Tables** — bulk-plant min/max, capacity, outage schedules (irregularly updated, ingested via API/manual upload where no API exists).
- **Monthly Submission Files** (per cycle, per source):
  - Prices (Demand Planning)
  - Demand per refinery per bulk plant per product, 4-month horizon (OSPAS)
  - Opening inventory / tank levels (Refineries)
  - Updated limits/outage/min-max (Refineries, ad hoc)
- **Validation Flags** — anomaly records tied to a submission, a field, a severity, and a status (open/emailed/resolved/justified).
- **Comments/Justifications** — stakeholder-provided rationale for an unmodified flagged value, or a rejection of a Draft SROP value.
- **Master Input File** — the consolidated, multi-sheet Excel produced by the Intake Agent; direct input to the LP model.
- **Draft SROP** — LP model output, multi-sheet, split by month across the 4-month window.
- **Final SROP** — the approved version of the above, used downstream.
- **Cycle Request Log** — what was asked of whom, when, reused as a template next cycle.
- **Audit/History Archive** — every version of every file, every flag, every email, every approval, timestamped and attributable.

---

## 4. End-to-End Process

### Phase 0 — Platform Onboarding (one-time)
- Bulk-load historical data; connect to SAP via API for historical pulls.
- Ingest existing refinery reference tables (manual upload, since these aren't API-connected or regularly updated).
- Establish the storage structure (by cycle/month, by stakeholder, by file type).

### Phase 1 — Cycle Initiation (Day 1 of month)
1. Y opens the platform chat and specifies, in natural language, what to request from Demand Planning, OSPAS, and each Refinery (including ad hoc asks — updated outages, limits, min-max).
2. Orchestrator parses this into structured requests, checks completeness against the prior cycle's request template, and confirms with Y before sending (*assumption: orchestrator should surface a review step to Y rather than send silently — flag if not desired*).
3. Orchestrator sends the emails (with platform links) to all parties and stores the request log for reuse next cycle.

### Phase 2 — Stakeholder Submission
4. Each stakeholder follows the link, authenticates, and uploads the requested file(s); any unrequested/new items (new product, new bulk plant, new stakeholder) are captured separately and routed to Y before being stored as reference data.
5. Reminder/escalation logic runs against a response SLA (see §5 — **timing needs confirmation**).

### Phase 3 — Validation (parallel per submission)
6. A Validation Agent instance runs per submission (e.g., one per refinery) against: historical baseline, refinery limit tables, and cross-submission consistency (e.g., OSPAS demand vs. refinery capacity).
7. Flags are grouped per submission source for Y to triage, not surfaced individually.
8. **Flag resolution UI** gives Y, per flag:
   - Send an email to the source (AI-drafted, human-editable) requesting confirmation/correction.
   - Directly edit the value via LLM-assisted natural-language edit.
   - Accept as justified with no change (requires a logged reason).
9. **Dashboard** (independent of flag status) lets Y filter/compare any submitted value against historical data and refinery limit tables at any time.
10. Loop: emailed flags await stakeholder response (a resubmission or a written justification) → re-validation → closed.

### Phase 4 — Intake / Consolidation
11. Intake Agent maps all *validated* (flag-free or Y-justified) data into the Master Input File (multi-sheet Excel).
12. This agent reruns automatically whenever a resolved flag changes underlying data, and finally once Y closes out all flags for a submission.

### Phase 5 — LP Run & Draft Generation
13. Gate: Y can only trigger the LP run once the dashboard shows zero pending/blocking flags across all submissions for the cycle.
14. Backend invokes the LP model with the Master Input File; LP returns the Draft SROP (multi-sheet, split by month, 4-month horizon).
15. On Y's approval, the platform automatically emails the Draft SROP (with a platform link) to all stakeholders.

### Phase 6 — Stakeholder Review of Draft SROP
16. Each stakeholder, via the platform, can:
    - **Approve** as-is.
    - **Update** specific values and upload the changed file → File-Recognition Agent verifies only that stakeholder's authorized fields were touched, flags anything else (out-of-scope edits, extreme values) to Y.
    - **Comment** — a rejection of specific value(s) with justification — routed straight to Y's queue (no file involved).
    - **Chat with AI** to request a change or lodge a comment conversationally (functionally equivalent to the two options above).
17. Y reviews all incoming updates/comments, applies what's approved, checks the dashboard again, and re-approves.
18. Any data change triggers Phase 4 → Phase 5 again (Intake rerun → LP rerun) to produce the updated Draft. (*Assumption: even a single stakeholder's data update reruns the LP model in full — flag if a lighter-weight patch is preferred.*)

### Phase 7 — Finalization
19. Once every stakeholder has either approved or had their comments resolved and re-confirmed, the Draft becomes the **Final SROP** and is resent for final acknowledgment.
20. Final SROP is archived; downstream stakeholders (Finance, Refineries, etc.) use it in their own processes.
21. Orchestrator persists everything (submissions, flags + resolutions, emails, versions, approvals) to the History Archive, and separately logs justified-but-flagged patterns to reduce false positives in future cycles' Validation Agent.

### Phase 8 — Out of Scope for Now (future work)
- Stakeholder-facing visualizations of "what changed and what needs my attention" in the Draft SROP.
- Automating stakeholders' own downstream actions (Finance workflows, refinery scheduling, etc.).

---

## 5. Business Rules Engine

- **Outlier/validation rules:** deviation from historical baseline (e.g., the "50% increase" example), breach of refinery min/max or capacity, missing/negative/zero values, and unrecognized new entities. *(Needs confirmation: are thresholds global and fixed, or configurable per product/plant by Y?)*
- **Escalation rule:** if a stakeholder doesn't respond within [**SLA — TBD**] of the initial request, orchestrator auto-escalates to their management with a reminder/escalation email.
- **Field-level authority:** a stakeholder can only ever modify their own data domain in the Draft SROP; the File-Recognition Agent enforces this and flags violations to Y rather than silently rejecting.
- **Run authority:** only Y can trigger an LP run or publish a Final SROP; stakeholders can only propose changes or comments.
- **Approval gating:** LP run requires zero open blocking flags; Draft→Final transition requires every stakeholder to have either approved or had their comment addressed and re-confirmed (not necessarily every stakeholder actively clicking "approve" on the final round — **needs confirmation**).
- **Versioning:** every submission, flag resolution, LP run, and stakeholder update produces a retained, attributable version.

---

## 6. State Model (summary)

**Per data submission** (e.g., one refinery's file):
`Requested → Submitted → Validating → (Flagged → Emailed → Response Received → Re-validated) → Clean → Included in Intake`

**Per monthly cycle:**
`Not Started → Requests Sent → Awaiting Submissions → Validating → Consolidating → LP Running → Draft Generated → Draft Under Review → Revision Loop → Final Approved → Archived`

**Per stakeholder, on the Draft SROP:**
`Notified → Reviewing → (Approved | Update Submitted | Comment Submitted) → Y-Reviewed → Awaiting Final Confirmation → Final Approved`

---

## 7. Edge Cases Needing a Business Decision

1. A stakeholder never responds, even after escalation — does the cycle proceed with last-known/historical data (flagged as assumed), or does it block?
2. Two stakeholders submit conflicting updates touching the same underlying value — who arbitrates, and how is it surfaced?
3. The LP model returns an infeasible or failed run — what's the fallback (alert Y only, or also notify stakeholders of a delay)?
4. A new product, bulk plant, or stakeholder appears mid-cycle — is it auto-provisioned into the schema, or does it always require Y's manual sign-off before storage?
5. How many Draft-revision rounds are allowed in Phase 6 before this is escalated as a process exception?

---

## 8. Open Questions for You

- **Escalation SLA:** how many business days of silence before auto-escalation, and to whom exactly (line manager, department head)?
- **Outlier thresholds:** fixed and global, or configurable per product/plant/data type, and by whom?
- **Final approval bar:** does every stakeholder need to actively click "approve" on the Final SROP, or is Y's sign-off (after addressing all comments) sufficient to publish?
- **LP rerun scope:** does *any* single-field stakeholder update always trigger a full LP rerun, or are there changes minor enough to skip it?
- **New-entity handling:** should new products/plants/stakeholders be auto-ingested by the orchestrator, or always gated by Y before becoming part of the reference data?
- **Non-response fallback:** if escalation still gets no response, what does the platform do — proceed with historical/last-cycle data, or hold the cycle?
- **Authentication model:** do stakeholders get individual platform accounts, SSO via SAP, or a shared per-department login?
