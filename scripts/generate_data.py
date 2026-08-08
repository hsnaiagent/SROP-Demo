"""
Generate the SROP version 2 demo dataset.

Fully deterministic - no randomness. Re-running produces byte-identical files.
Run:  python scripts/generate_data.py
Then: python scripts/check_data.py

Version 1's YANBU/BP-YANBU and JAZAN/BP-JAZAN series are reproduced BYTE FOR BYTE.
The demo numbers depend on them:
  - JAZAN|BP-JAZAN|DIESEL 12-month mean is exactly 25.1
  - submitted 41.2 for 2026-10 is +64% against that mean
  - correcting to 25.8 swings October production by -15.4 kb
  - at the 2026-10 DIESEL price of 93.84 that is -$1.45M
Do not touch BASE_DEMAND, HIST_JAZAN_DIESEL, SUBMIT_FACTOR, BASE_PRICE,
PRICE_DRIFT or the first eight REF_LIMITS rows without re-reading DEMO-RUNBOOK.md.
"""

import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

PLAN_MONTHS = ["2026-09", "2026-10", "2026-11", "2026-12"]
HIST_MONTHS = [
    "2025-09", "2025-10", "2025-11", "2025-12",
    "2026-01", "2026-02", "2026-03", "2026-04",
    "2026-05", "2026-06", "2026-07", "2026-08",
]

PRICED_PRODUCTS = ["DIESEL", "GASOLINE-91", "GASOLINE-95", "JET-A1", "FUEL-OIL", "ASPHALT"]

# refinery -> bulk plants it owns. Two refineries own two plants each, which is
# what makes the field-level authority rule non-trivial.
PLANTS = {
    "YANBU": ["BP-YANBU", "BP-MADINAH"],
    "JAZAN": ["BP-JAZAN"],
    "RIYADH": ["BP-RIYADH", "BP-QASSIM"],
    "RABIGH": ["BP-RABIGH"],
}

# 21 series. Not every product at every plant - that is the point of a series key.
# (refinery, bulk_plant, product) -> 12-month mean demand in kb
BASE_DEMAND = {
    # --- version 1, unchanged ---
    ("YANBU", "BP-YANBU", "DIESEL"): 30.0,
    ("YANBU", "BP-YANBU", "GASOLINE-91"): 42.0,
    ("YANBU", "BP-YANBU", "JET-A1"): 18.0,
    ("YANBU", "BP-YANBU", "FUEL-OIL"): 12.0,
    ("JAZAN", "BP-JAZAN", "DIESEL"): 25.1,   # exact mean pinned by HIST_JAZAN_DIESEL
    ("JAZAN", "BP-JAZAN", "GASOLINE-91"): 34.0,
    ("JAZAN", "BP-JAZAN", "JET-A1"): 14.0,
    ("JAZAN", "BP-JAZAN", "FUEL-OIL"): 20.0,
    # --- version 2 additions ---
    ("YANBU", "BP-MADINAH", "DIESEL"): 16.0,
    ("YANBU", "BP-MADINAH", "GASOLINE-91"): 22.0,
    ("YANBU", "BP-MADINAH", "GASOLINE-95"): 9.0,
    ("RIYADH", "BP-RIYADH", "DIESEL"): 28.0,
    ("RIYADH", "BP-RIYADH", "GASOLINE-91"): 38.0,
    ("RIYADH", "BP-RIYADH", "GASOLINE-95"): 15.0,
    ("RIYADH", "BP-RIYADH", "ASPHALT"): 7.0,
    ("RIYADH", "BP-QASSIM", "DIESEL"): 11.0,
    ("RIYADH", "BP-QASSIM", "JET-A1"): 12.0,
    ("RABIGH", "BP-RABIGH", "DIESEL"): 19.0,
    ("RABIGH", "BP-RABIGH", "GASOLINE-91"): 26.0,
    ("RABIGH", "BP-RABIGH", "FUEL-OIL"): 14.0,
    ("RABIGH", "BP-RABIGH", "ASPHALT"): 5.0,
}

SERIES = list(BASE_DEMAND.keys())

# 12 seasonal factors summing to exactly 12.00, so mean(base * factors) == base
FACTORS = [0.96, 1.02, 1.05, 0.99, 0.95, 1.00, 1.04, 1.01, 0.98, 1.03, 0.97, 1.00]

# Pinned so the 12-month mean is EXACTLY 25.1 - the number said out loud on stage.
# 24.1+25.6+26.3+24.8+23.9+25.0+26.1+25.4+24.6+25.9+24.7+24.8 = 301.2 ; /12 = 25.1
HIST_JAZAN_DIESEL = [24.1, 25.6, 26.3, 24.8, 23.9, 25.0, 26.1, 25.4, 24.6, 25.9, 24.7, 24.8]

# offset into FACTORS per product, so series don't move in lockstep
OFFSET = {
    "DIESEL": 0, "GASOLINE-95": 1, "GASOLINE-91": 3,
    "JET-A1": 6, "ASPHALT": 7, "FUEL-OIL": 9,
}

# multipliers applied to the base for each of the four planned months
SUBMIT_FACTOR = {
    "DIESEL": [1.01, 1.03, 0.99, 1.02],
    "GASOLINE-91": [1.04, 1.02, 0.98, 1.01],
    "GASOLINE-95": [1.03, 1.01, 1.04, 0.99],
    "JET-A1": [0.98, 1.02, 1.05, 1.00],
    "FUEL-OIL": [1.02, 0.99, 1.03, 0.97],
    "ASPHALT": [1.05, 1.02, 0.97, 1.00],
}

# ------------------------------------------------------------------- the defects
#
# 1  HISTORICAL_DEVIATION   JAZAN|BP-JAZAN|DIESEL 2026-10 at 41.2 vs mean 25.1  (+64%)
# 2  LIMIT_BREACH           BP-JAZAN GASOLINE-91 opening 31.4 above max 27.0
# 3  ZERO_OR_MISSING        JET-A1 2026-11 price is 0.0
# 4  non-response           RABIGH submits nothing (state, not data)
# 5  OUT_OF_SCOPE_EDIT      RABIGH's draft-review upload touches a price (revisions.json)

DEFECT_1 = ("JAZAN", "BP-JAZAN", "DIESEL", "2026-10", 41.2)
DEFECT_3 = ("JET-A1", "2026-11")

# --------------------------------------------------------------------- ref_limits
# min_level / max_level are tank levels (kb); capacity is monthly production (kb).
# The first eight rows are version 1 verbatim.
REF_LIMITS_V1 = [
    ("YANBU", "BP-YANBU", "DIESEL", 6.0, 24.0, 48.0),
    ("YANBU", "BP-YANBU", "GASOLINE-91", 8.0, 34.0, 68.0),
    ("YANBU", "BP-YANBU", "JET-A1", 4.0, 14.0, 29.0),
    ("YANBU", "BP-YANBU", "FUEL-OIL", 2.5, 10.0, 20.0),
    # capacity 45.0 (not 40) so the 41.2 kb bad figure is NOT clipped by the cap.
    # At 40.0 the optimizer absorbs 1.2 kb of the error and the on-stage swing
    # becomes 14.2, not the 15.4 in the demo script. Leave this alone.
    ("JAZAN", "BP-JAZAN", "DIESEL", 5.0, 20.0, 45.0),
    ("JAZAN", "BP-JAZAN", "GASOLINE-91", 7.0, 27.0, 54.0),
    ("JAZAN", "BP-JAZAN", "JET-A1", 3.0, 11.0, 22.0),
    ("JAZAN", "BP-JAZAN", "FUEL-OIL", 4.0, 16.0, 32.0),
]


def write(name, header, rows):
    with open(os.path.join(DATA, name), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"  {name:<26} {len(rows):>4} rows")


def write_json(name, obj):
    with open(os.path.join(DATA, name), "w") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")
    print(f"  {name:<26} {'json':>4}")


print("Writing data/ ...")

# ------------------------------------------------------------------- ref_limits
v1_keys = {(r[0], r[1], r[2]) for r in REF_LIMITS_V1}
ref_limits = list(REF_LIMITS_V1)
for refinery, plant, product in SERIES:
    if (refinery, plant, product) in v1_keys:
        continue
    base = BASE_DEMAND[(refinery, plant, product)]
    ref_limits.append((
        refinery, plant, product,
        round(0.2 * base, 1),   # min tank level
        round(0.8 * base, 1),   # max tank level
        round(1.6 * base, 1),   # monthly production capacity
    ))
ref_limits.sort(key=lambda r: (r[0], r[1], r[2]))

write(
    "ref_limits.csv",
    ["refinery", "bulk_plant", "product", "min_level", "max_level", "capacity"],
    ref_limits,
)
LIMIT_BY_KEY = {(r[0], r[1], r[2]): r for r in ref_limits}

# -------------------------------------------------------------- history_baseline
hist = []
for refinery, plant, product in SERIES:
    if (refinery, plant, product) == ("JAZAN", "BP-JAZAN", "DIESEL"):
        series = HIST_JAZAN_DIESEL
    else:
        base = BASE_DEMAND[(refinery, plant, product)]
        off = OFFSET[product]
        series = [round(base * FACTORS[(i + off) % 12], 1) for i in range(12)]
    for month, value in zip(HIST_MONTHS, series):
        hist.append((refinery, plant, product, month, value))

write(
    "history_baseline.csv",
    ["refinery", "bulk_plant", "product", "month", "demand_kb"],
    hist,
)

# ----------------------------------------------------------- sub_demand  (OSPAS)
demand = []
for refinery, plant, product in SERIES:
    base = BASE_DEMAND[(refinery, plant, product)]
    for i, month in enumerate(PLAN_MONTHS):
        if (refinery, plant, product, month) == DEFECT_1[:4]:
            value = DEFECT_1[4]
        else:
            value = round(base * SUBMIT_FACTOR[product][i], 1)
        demand.append((refinery, plant, product, month, value))

demand.sort(key=lambda r: (r[3], r[0], r[1], r[2]))

write(
    "sub_demand.csv",
    ["refinery", "bulk_plant", "product", "month", "demand_kb"],
    demand,
)

# -------------------------------------------- sub_prices  (Demand Planning)
BASE_PRICE = {
    "DIESEL": 92.0, "GASOLINE-91": 88.0, "GASOLINE-95": 95.0,
    "JET-A1": 97.0, "FUEL-OIL": 61.0, "ASPHALT": 54.0,
}
PRICE_DRIFT = [1.00, 1.02, 1.01, 0.99]

prices = []
for product in PRICED_PRODUCTS:
    for i, month in enumerate(PLAN_MONTHS):
        value = 0.0 if (product, month) == DEFECT_3 else round(BASE_PRICE[product] * PRICE_DRIFT[i], 2)
        prices.append((product, month, value))

write("sub_prices.csv", ["product", "month", "price_usd"], prices)

# ------------------------------------------------- sub_inv_*  (per refinery)
# Every level sits comfortably inside min/max, except the one planted breach.
# Version 1's four BP-YANBU rows and four BP-JAZAN rows are reproduced exactly.
PINNED_INVENTORY = {
    ("BP-YANBU", "DIESEL"): 18.0,        # 6.0 - 24.0
    ("BP-YANBU", "GASOLINE-91"): 26.5,   # 8.0 - 34.0
    ("BP-YANBU", "JET-A1"): 9.2,         # 4.0 - 14.0
    ("BP-YANBU", "FUEL-OIL"): 6.8,       # 2.5 - 10.0
    ("BP-JAZAN", "DIESEL"): 14.5,        # 5.0 - 20.0
    ("BP-JAZAN", "GASOLINE-91"): 31.4,   # 7.0 - 27.0  <-- DEFECT 2, BREACH
    ("BP-JAZAN", "JET-A1"): 7.1,         # 3.0 - 11.0
    ("BP-JAZAN", "FUEL-OIL"): 11.2,      # 4.0 - 16.0
}

for refinery, plants in PLANTS.items():
    rows = []
    for plant in plants:
        for r, p, product in SERIES:
            if r != refinery or p != plant:
                continue
            if (plant, product) in PINNED_INVENTORY:
                value = PINNED_INVENTORY[(plant, product)]
            else:
                limit = LIMIT_BY_KEY[(refinery, plant, product)]
                value = round(0.62 * limit[4], 1)   # 62% of max_level - comfortably inside
            rows.append((plant, product, value))
    write(
        f"sub_inv_{refinery.lower()}.csv",
        ["bulk_plant", "product", "opening_inventory_kb"],
        rows,
    )

# ------------------------------------------------------------------ ref_outage
# Planned outage days per plant per month. The JAZAN October turnaround is the
# justification OSPAS cites when it rejects the draft in scenario 3.
OUTAGE = {
    ("BP-JAZAN", "2026-10"): 12,
    ("BP-QASSIM", "2026-11"): 4,
    ("BP-RABIGH", "2026-12"): 7,
}
outage = []
for plants in PLANTS.values():
    for plant in plants:
        for month in PLAN_MONTHS:
            outage.append((plant, month, OUTAGE.get((plant, month), 0)))

write("ref_outage.csv", ["bulk_plant", "month", "outage_days"], outage)

# --------------------------------------------------------------- stakeholders
EMAIL_DOMAIN = "aramco.example"
stakeholders = [
    {
        "id": "planner",
        "name": "Y - SROP Planner",
        "kind": "planner",
        "email": f"srop.planner@{EMAIL_DOMAIN}",
        "escalationContact": None,
        "ownsPlants": [],
        "ownsFields": ["*"],
        "submits": [],
    },
    {
        "id": "ospas",
        "name": "OSPAS",
        "kind": "department",
        "email": f"ospas.demand@{EMAIL_DOMAIN}",
        "escalationContact": f"ospas.head@{EMAIL_DOMAIN}",
        "ownsPlants": [],
        "ownsFields": ["demand_kb"],
        "submits": ["demand"],
    },
    {
        "id": "demand-planning",
        "name": "Demand Planning",
        "kind": "department",
        "email": f"demand.planning@{EMAIL_DOMAIN}",
        "escalationContact": f"dp.head@{EMAIL_DOMAIN}",
        "ownsPlants": [],
        "ownsFields": ["price_usd"],
        "submits": ["prices"],
    },
]
for refinery, plants in PLANTS.items():
    stakeholders.append({
        "id": f"refinery-{refinery.lower()}",
        "name": f"Refinery {refinery}",
        "kind": "refinery",
        "refinery": refinery,
        "email": f"{refinery.lower()}.planning@{EMAIL_DOMAIN}",
        "escalationContact": f"{refinery.lower()}.manager@{EMAIL_DOMAIN}",
        "ownsPlants": plants,
        "ownsFields": ["opening_inventory_kb", "min_level", "max_level", "capacity", "outage_days"],
        "submits": ["inventory"],
    })
stakeholders.append({
    "id": "finance",
    "name": "Finance",
    "kind": "department",
    "email": f"finance.planning@{EMAIL_DOMAIN}",
    "escalationContact": f"finance.head@{EMAIL_DOMAIN}",
    "ownsPlants": [],
    "ownsFields": [],
    "submits": [],
})

write_json("stakeholders.json", stakeholders)

# ------------------------------------------------------------------ prev_cycle
# The previous cycle planned 2026-08 through 2026-11, so this cycle's 2026-12 has
# no last-cycle counterpart. That null case is deliberate - the Reasonableness tab
# has to render it.
prev_demand = {}
for refinery, plant, product in SERIES:
    base = BASE_DEMAND[(refinery, plant, product)]
    for i, month in enumerate(PLAN_MONTHS[:3]):
        key = f"{refinery}|{plant}|{product}|{month}"
        prev_demand[key] = round(base * (0.97 + 0.01 * i), 1)

write_json("prev_cycle.json", {
    "id": "2026-08",
    "horizon": ["2026-08", "2026-09", "2026-10", "2026-11"],
    "demand": prev_demand,
    "requestTemplate": [
        {"recipient": "Demand Planning", "items": ["Product prices for all products, 4-month horizon"]},
        {"recipient": "OSPAS", "items": ["Demand per refinery per bulk plant per product, 4-month horizon"]},
        {"recipient": "Refinery YANBU", "items": ["Opening inventory (tank levels) for BP-YANBU and BP-MADINAH"]},
        {"recipient": "Refinery JAZAN", "items": ["Opening inventory (tank levels) for BP-JAZAN"]},
        {"recipient": "Refinery RIYADH", "items": ["Opening inventory (tank levels) for BP-RIYADH and BP-QASSIM"]},
        {"recipient": "Refinery RABIGH", "items": ["Opening inventory (tank levels) for BP-RABIGH"]},
    ],
})

# --------------------------------------------------------------- corrections
# Scripted stakeholder replies for the Simulate response shortcut. Keyed by rule,
# except HISTORICAL_DEVIATION which fires on two different series and so is keyed
# by series as well. Version 1's four texts are unchanged.
corrections = {
    "HISTORICAL_DEVIATION": {
        "from": "OSPAS",
        "reply": "Checked against our dispatch log - 41.2 was a transcription error. "
                 "Correct figure for JAZAN DIESEL October is 25.8 kb.",
        "correctedValue": 25.8,
        "movesThePlan": True,
    },
    "LIMIT_BREACH": {
        "from": "Refinery JAZAN",
        "reply": "Confirmed intentional. GASOLINE-91 is running an approved temporary "
                 "over-fill under waiver TW-2026-114 ahead of the Q4 turnaround.",
        "correctedValue": None,
        "movesThePlan": False,
    },
    "ZERO_OR_MISSING": {
        "from": "Demand Planning",
        "reply": "Confirmed intentional. No JET-A1 term pricing published for November - "
                 "scheduled shutdown, no liftings expected.",
        "correctedValue": None,
        "movesThePlan": False,
    },
}

write_json("corrections.json", corrections)

# ----------------------------------------------------------------- revisions
# Scripted stakeholder responses to the issued draft SROP. DEFECT 8 lives here:
# RABIGH changes its own tank levels and, in the same file, a price it does not own.
revisions = [
    {
        "id": "rev-finance-approve",
        "stakeholder": "Finance",
        "channel": "approve",
    },
    {
        "id": "rev-ospas-comment",
        "stakeholder": "OSPAS",
        "channel": "comment",
        "rowRef": "refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10",
        "text": "BP-JAZAN has a 12-day turnaround in October. Even at the corrected 25.8 kb "
                "we cannot lift this volume - please plan 19.4 kb and carry the rest into November.",
        "proposedValue": 19.4,
    },
    {
        "id": "rev-rabigh-upload",
        "stakeholder": "Refinery RABIGH",
        "channel": "upload",
        "fileName": "RABIGH_tank_levels_rev2.xlsx",
        "changes": [
            {
                "field": "opening_inventory_kb",
                "rowRef": "bulk_plant=BP-RABIGH,product=DIESEL",
                "before": 9.4, "after": 11.8,
            },
            {
                "field": "opening_inventory_kb",
                "rowRef": "bulk_plant=BP-RABIGH,product=FUEL-OIL",
                "before": 6.9, "after": 7.4,
            },
            {
                "field": "price_usd",
                "rowRef": "product=GASOLINE-91,month=2026-11",
                "before": 88.88, "after": 94.20,
            },
        ],
    },
]

write_json("revisions.json", revisions)

print("\nDone. Now run: python scripts/check_data.py")
