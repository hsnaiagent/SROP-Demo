"""
Generate the six SROP demo CSVs.

Fully deterministic - no randomness. Re-running produces byte-identical files.
Run:  python3 scripts/generate_data.py
Then: python3 scripts/check_data.py
"""

import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

PRODUCTS = ["DIESEL", "GASOLINE-91", "JET-A1", "FUEL-OIL"]
PLAN_MONTHS = ["2026-09", "2026-10", "2026-11", "2026-12"]
HIST_MONTHS = [
    "2025-09", "2025-10", "2025-11", "2025-12",
    "2026-01", "2026-02", "2026-03", "2026-04",
    "2026-05", "2026-06", "2026-07", "2026-08",
]

# (refinery, bulk_plant) -> one bulk plant per refinery
SITES = [("YANBU", "BP-YANBU"), ("JAZAN", "BP-JAZAN")]

# 12 seasonal factors that sum to exactly 12.00, so mean(base * factors) == base
FACTORS = [0.96, 1.02, 1.05, 0.99, 0.95, 1.00, 1.04, 1.01, 0.98, 1.03, 0.97, 1.00]

# historical monthly mean demand (kb) per site+product
BASE_DEMAND = {
    ("YANBU", "DIESEL"): 30.0,
    ("YANBU", "GASOLINE-91"): 42.0,
    ("YANBU", "JET-A1"): 18.0,
    ("YANBU", "FUEL-OIL"): 12.0,
    ("JAZAN", "DIESEL"): 25.1,   # exact mean is pinned below by HIST_JAZAN_DIESEL
    ("JAZAN", "GASOLINE-91"): 34.0,
    ("JAZAN", "JET-A1"): 14.0,
    ("JAZAN", "FUEL-OIL"): 20.0,
}

# Pinned so the 12-month mean is EXACTLY 25.1 - the number said out loud on stage.
# 24.1+25.6+26.3+24.8+23.9+25.0+26.1+25.4+24.6+25.9+24.7+24.8 = 301.2 ; /12 = 25.1
HIST_JAZAN_DIESEL = [24.1, 25.6, 26.3, 24.8, 23.9, 25.0, 26.1, 25.4, 24.6, 25.9, 24.7, 24.8]

# offset into FACTORS per product, so the series don't move in lockstep
OFFSET = {"DIESEL": 0, "GASOLINE-91": 3, "JET-A1": 6, "FUEL-OIL": 9}

# multipliers applied to the base for each of the four planned months
SUBMIT_FACTOR = {
    "DIESEL": [1.01, 1.03, 0.99, 1.02],
    "GASOLINE-91": [1.04, 1.02, 0.98, 1.01],
    "JET-A1": [0.98, 1.02, 1.05, 1.00],
    "FUEL-OIL": [1.02, 0.99, 1.03, 0.97],
}

# ---------------------------------------------------------------- ref_limits
# min_level / max_level are tank levels (kb); capacity is monthly production (kb)
REF_LIMITS = [
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
    path = os.path.join(DATA, name)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"  {name:<24} {len(rows):>3} rows")


print("Writing data/ ...")

write(
    "ref_limits.csv",
    ["refinery", "bulk_plant", "product", "min_level", "max_level", "capacity"],
    REF_LIMITS,
)

# ---------------------------------------------------------- history_baseline
hist = []
for refinery, plant in SITES:
    for product in PRODUCTS:
        if (refinery, product) == ("JAZAN", "DIESEL"):
            series = HIST_JAZAN_DIESEL
        else:
            base = BASE_DEMAND[(refinery, product)]
            off = OFFSET[product]
            series = [round(base * FACTORS[(i + off) % 12], 1) for i in range(12)]
        for month, value in zip(HIST_MONTHS, series):
            hist.append((refinery, plant, product, month, value))

write(
    "history_baseline.csv",
    ["refinery", "bulk_plant", "product", "month", "demand_kb"],
    hist,
)

# ------------------------------------------------------ sub_demand  (OSPAS)
# DEFECT 1 (R1): JAZAN / DIESEL / 2026-10 submitted at 41.2 vs 12-month mean 25.1 -> +64.1%
# DEFECT 4 (R4): a single LPG-95 row - product absent from ref_limits.csv
DEFECT_1 = ("JAZAN", "DIESEL", "2026-10", 41.2)

demand = []
for refinery, plant in SITES:
    for product in PRODUCTS:
        base = BASE_DEMAND[(refinery, product)]
        for i, month in enumerate(PLAN_MONTHS):
            if (refinery, product, month) == DEFECT_1[:3]:
                value = DEFECT_1[3]
            else:
                value = round(base * SUBMIT_FACTOR[product][i], 1)
            demand.append((refinery, plant, product, month, value))

# exactly ONE unknown-entity row, so R4 fires exactly once
demand.append(("JAZAN", "BP-JAZAN", "LPG-95", "2026-11", 6.4))

write(
    "sub_demand.csv",
    ["refinery", "bulk_plant", "product", "month", "demand_kb"],
    demand,
)

# ------------------------------------------- sub_prices  (Demand Planning)
# DEFECT 3 (R3): JET-A1 / 2026-11 price is 0
BASE_PRICE = {"DIESEL": 92.0, "GASOLINE-91": 88.0, "JET-A1": 97.0, "FUEL-OIL": 61.0}
PRICE_DRIFT = [1.00, 1.02, 1.01, 0.99]
DEFECT_3 = ("JET-A1", "2026-11")

prices = []
for product in PRODUCTS:
    for i, month in enumerate(PLAN_MONTHS):
        if (product, month) == DEFECT_3:
            value = 0.0
        else:
            value = round(BASE_PRICE[product] * PRICE_DRIFT[i], 2)
        prices.append((product, month, value))

write("sub_prices.csv", ["product", "month", "price_usd"], prices)

# ------------------------------------------ sub_inv_yanbu  (Refinery Yanbu)
# CLEAN. Every level sits comfortably inside min/max.
write(
    "sub_inv_yanbu.csv",
    ["bulk_plant", "product", "opening_inventory_kb"],
    [
        ("BP-YANBU", "DIESEL", 18.0),        # 6.0 - 24.0
        ("BP-YANBU", "GASOLINE-91", 26.5),   # 8.0 - 34.0
        ("BP-YANBU", "JET-A1", 9.2),         # 4.0 - 14.0
        ("BP-YANBU", "FUEL-OIL", 6.8),       # 2.5 - 10.0
    ],
)

# ------------------------------------------ sub_inv_jazan  (Refinery Jazan)
# DEFECT 2 (R2): GASOLINE-91 opening inventory 31.4 exceeds max_level 27.0
write(
    "sub_inv_jazan.csv",
    ["bulk_plant", "product", "opening_inventory_kb"],
    [
        ("BP-JAZAN", "DIESEL", 14.5),        # 5.0 - 20.0
        ("BP-JAZAN", "GASOLINE-91", 31.4),   # 7.0 - 27.0  <-- BREACH
        ("BP-JAZAN", "JET-A1", 7.1),         # 3.0 - 11.0
        ("BP-JAZAN", "FUEL-OIL", 11.2),      # 4.0 - 16.0
    ],
)

# ---------------------------------------------------------- corrections.json
# Keyed by RULE, not by flag id - North assigns flag ids at runtime and they
# are not stable across executions. Each rule fires exactly once by construction.
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
    "UNKNOWN_ENTITY": {
        "from": "OSPAS",
        "reply": "Confirmed intentional. LPG-95 is a new grade approved for JAZAN; "
                 "it has not been added to the reference limits file yet.",
        "correctedValue": None,
        "movesThePlan": False,
    },
}

with open(os.path.join(DATA, "corrections.json"), "w") as f:
    json.dump(corrections, f, indent=2)
    f.write("\n")
print(f"  {'corrections.json':<24} {len(corrections):>3} entries")

print("\nDone. Now run: python3 scripts/check_data.py")
