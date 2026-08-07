"""
Independent verifier for the SROP demo data.

Re-implements rules R1-R4 exactly as worded in the Node 1 prompt, runs them over
data/, and asserts the result is EXACTLY the four planted defects - no more, no
fewer. A stray fifth anomaly that the Validator legitimately catches will derail
the demo narration, so this must exit 0 after every data edit.

Deliberately does NOT import from generate_data.py. It reads the CSVs the same
way North will.

Run:  python3 scripts/check_data.py    ->  exit 0 = safe to demo
"""

import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

DEVIATION_THRESHOLD = 0.40

# What the Validator is supposed to find - and nothing else.
EXPECTED = {
    ("HISTORICAL_DEVIATION", "sub_demand.csv", "JAZAN|BP-JAZAN|DIESEL|2026-10"),
    ("LIMIT_BREACH", "sub_inv_jazan.csv", "BP-JAZAN|GASOLINE-91"),
    ("ZERO_OR_MISSING", "sub_prices.csv", "JET-A1|2026-11"),
    ("UNKNOWN_ENTITY", "sub_demand.csv", "JAZAN|BP-JAZAN|LPG-95|2026-11"),
}


def load(name):
    return pd.read_csv(os.path.join(DATA, name))


limits = load("ref_limits.csv")
history = load("history_baseline.csv")
demand = load("sub_demand.csv")
prices = load("sub_prices.csv")
inv_yanbu = load("sub_inv_yanbu.csv")
inv_jazan = load("sub_inv_jazan.csv")

found = []  # (rule, file, row_ref, evidence)

# ------------------------------------------------------------------------ R1
# A submitted demand_kb differs from that refinery+bulk_plant+product's mean in
# history_baseline.csv by more than 40%.
means = (
    history.groupby(["refinery", "bulk_plant", "product"])["demand_kb"]
    .mean()
    .to_dict()
)

for _, r in demand.iterrows():
    key = (r.refinery, r.bulk_plant, r["product"])
    if key not in means:
        continue  # no history -> R4's problem, not R1's
    mean = means[key]
    if mean == 0 or pd.isna(r.demand_kb):
        continue
    dev = (r.demand_kb - mean) / mean
    if abs(dev) > DEVIATION_THRESHOLD:
        found.append((
            "HISTORICAL_DEVIATION",
            "sub_demand.csv",
            f"{r.refinery}|{r.bulk_plant}|{r['product']}|{r.month}",
            f"submitted {r.demand_kb} kb vs 12-month mean {mean:.1f} kb ({dev:+.0%})",
        ))

# ------------------------------------------------------------------------ R2
# opening_inventory_kb above max_level or below min_level for that
# bulk_plant+product in ref_limits.csv.
lim = limits.set_index(["bulk_plant", "product"])[["min_level", "max_level"]].to_dict("index")

for fname, df in (("sub_inv_yanbu.csv", inv_yanbu), ("sub_inv_jazan.csv", inv_jazan)):
    for _, r in df.iterrows():
        key = (r.bulk_plant, r["product"])
        if key not in lim:
            continue  # R4's problem
        lo, hi = lim[key]["min_level"], lim[key]["max_level"]
        v = r.opening_inventory_kb
        if pd.isna(v):
            continue  # R3's problem
        if v > hi or v < lo:
            side = f"above max_level {hi}" if v > hi else f"below min_level {lo}"
            found.append((
                "LIMIT_BREACH",
                fname,
                f"{r.bulk_plant}|{r['product']}",
                f"opening inventory {v} kb is {side} kb",
            ))

# ------------------------------------------------------------------------ R3
# Any price_usd or demand_kb that is 0, negative, blank or NaN.
def zero_or_missing(df, fname, col, ref_cols):
    for _, r in df.iterrows():
        v = r[col]
        if pd.isna(v) or v <= 0:
            found.append((
                "ZERO_OR_MISSING",
                fname,
                "|".join(str(r[c]) for c in ref_cols),
                f"{col} is {'blank' if pd.isna(v) else v}",
            ))


zero_or_missing(prices, "sub_prices.csv", "price_usd", ["product", "month"])
zero_or_missing(demand, "sub_demand.csv", "demand_kb",
                ["refinery", "bulk_plant", "product", "month"])

# ------------------------------------------------------------------------ R4
# A product, refinery or bulk_plant present in a submission but absent from
# ref_limits.csv.
known_products = set(limits["product"])
known_refineries = set(limits["refinery"])
known_plants = set(limits["bulk_plant"])

for _, r in demand.iterrows():
    bad = []
    if r["product"] not in known_products:
        bad.append(f"product {r['product']}")
    if r.refinery not in known_refineries:
        bad.append(f"refinery {r.refinery}")
    if r.bulk_plant not in known_plants:
        bad.append(f"bulk_plant {r.bulk_plant}")
    if bad:
        found.append((
            "UNKNOWN_ENTITY",
            "sub_demand.csv",
            f"{r.refinery}|{r.bulk_plant}|{r['product']}|{r.month}",
            f"{', '.join(bad)} not present in ref_limits.csv",
        ))

for fname, df in (("sub_inv_yanbu.csv", inv_yanbu), ("sub_inv_jazan.csv", inv_jazan)):
    for _, r in df.iterrows():
        bad = []
        if r["product"] not in known_products:
            bad.append(f"product {r['product']}")
        if r.bulk_plant not in known_plants:
            bad.append(f"bulk_plant {r.bulk_plant}")
        if bad:
            found.append((
                "UNKNOWN_ENTITY", fname, f"{r.bulk_plant}|{r['product']}",
                f"{', '.join(bad)} not present in ref_limits.csv",
            ))

for _, r in prices.iterrows():
    if r["product"] not in known_products:
        found.append((
            "UNKNOWN_ENTITY", "sub_prices.csv", f"{r['product']}|{r.month}",
            f"product {r['product']} not present in ref_limits.csv",
        ))

# --------------------------------------------------------------------- report
print("\nFlags found:\n")
for rule, fname, ref, ev in sorted(found):
    print(f"  {rule:<22} {fname:<20} {ref}")
    print(f"  {'':<22} {'':<20} {ev}\n")

actual = {(rule, fname, ref) for rule, fname, ref, _ in found}
missing = EXPECTED - actual
extra = actual - EXPECTED

# Yanbu must come back completely clean - that contrast is the demo's credibility.
yanbu_hits = [f for f in found if "yanbu" in f[1] or f[2].startswith("YANBU")]

ok = True
if missing:
    ok = False
    print("MISSING expected defects:")
    for m in sorted(missing):
        print(f"  - {m}")
if extra:
    ok = False
    print("UNEXPECTED extra anomalies (these will derail the narration):")
    for e in sorted(extra):
        print(f"  + {e}")
if yanbu_hits:
    ok = False
    print("YANBU IS NOT CLEAN - the 'three flagged, one clean' contrast breaks:")
    for y in yanbu_hits:
        print(f"  ! {y[0]} {y[1]} {y[2]}")

# Sanity checks the demo script depends on out loud.
jazan_diesel_mean = means[("JAZAN", "BP-JAZAN", "DIESEL")]
if round(jazan_diesel_mean, 1) != 25.1:
    ok = False
    print(f"JAZAN DIESEL 12-month mean is {jazan_diesel_mean:.3f}, demo script says 25.1")

corrected = 25.8
if abs(corrected - jazan_diesel_mean) / jazan_diesel_mean > DEVIATION_THRESHOLD:
    ok = False
    print(f"corrected value {corrected} would itself trip R1 - pick another")

print(f"\n{len(found)} flag(s); expected {len(EXPECTED)}.")
print(f"Row counts: ref_limits {len(limits)}, history {len(history)}, "
      f"demand {len(demand)}, prices {len(prices)}, "
      f"inv_yanbu {len(inv_yanbu)}, inv_jazan {len(inv_jazan)}")

if ok:
    print("\nPASS - exactly the four planted defects, Yanbu clean.")
    sys.exit(0)

print("\nFAIL - fix the data before wiring anything to North.")
sys.exit(1)
