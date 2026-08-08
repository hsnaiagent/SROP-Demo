"""
Independent verifier for data/. Re-derives every flag from the CSVs without
importing anything from generate_data.py, so a bug in the generator cannot hide
behind a matching bug in the checker.

Run:  python scripts/check_data.py
Exit 0 means the dataset is demo-safe: exactly the three planted validation flags, with
YANBU and RIYADH clean.

This mirrors lib/rules.ts. If the two ever disagree, one of them is wrong and the
demo is not safe to give.
"""

import collections
import csv
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

DEVIATION_THRESHOLD = 0.50   # lib/rules.ts DEFAULT_DEVIATION_THRESHOLD
PLAN_MONTHS = ["2026-09", "2026-10", "2026-11", "2026-12"]


def read(name):
    with open(os.path.join(DATA, name), newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def load_json(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)


limits = read("ref_limits.csv")
history = read("history_baseline.csv")
demand = read("sub_demand.csv")
prices = read("sub_prices.csv")
stakeholders = load_json("stakeholders.json")

LIMIT_KEYS = {(r["refinery"], r["bulk_plant"], r["product"]) for r in limits}
LIMIT_BY_KEY = {(r["refinery"], r["bulk_plant"], r["product"]): r for r in limits}

# refinery -> its inventory file, derived from stakeholders.json rather than assumed
INV_FILES = {
    s["refinery"]: f"sub_inv_{s['refinery'].lower()}.csv"
    for s in stakeholders if s["kind"] == "refinery"
}
PLANT_OWNER = {
    plant: s["refinery"]
    for s in stakeholders if s["kind"] == "refinery"
    for plant in s["ownsPlants"]
}

# ------------------------------------------------------------- historical means
buckets = collections.defaultdict(list)
for row in history:
    buckets[(row["refinery"], row["bulk_plant"], row["product"])].append(num(row["demand_kb"]))
MEANS = {k: sum(v) / len(v) for k, v in buckets.items()}

flags = []


def flag(rule, source, file, ref, evidence):
    flags.append({"rule": rule, "source": source, "file": file, "ref": ref, "evidence": evidence})


# ------------------------------------------------------ R3 / R4 / R1 on demand
for row in demand:
    key = (row["refinery"], row["bulk_plant"], row["product"])
    ref = f"{key[0]}|{key[1]}|{key[2]}|{row['month']}"
    value = num(row["demand_kb"])

    # structural rules first: a missing value is reported as missing, never as a deviation
    if row["demand_kb"].strip() == "" or value <= 0:
        flag("ZERO_OR_MISSING", "OSPAS", "sub_demand.csv", ref,
             f"demand_kb is {row['demand_kb']!r}")
        continue

    if key not in LIMIT_KEYS:
        flag("UNKNOWN_ENTITY", "OSPAS", "sub_demand.csv", ref,
             f"{key[2]} at {key[1]} is not present in ref_limits.csv")
        continue

    mean = MEANS.get(key)
    if mean:
        dev = (value - mean) / mean
        if abs(dev) > DEVIATION_THRESHOLD:
            flag("HISTORICAL_DEVIATION", "OSPAS", "sub_demand.csv", ref,
                 f"submitted {value} kb vs 12-month mean {round(mean, 1)} kb ({dev:+.0%})")

# ------------------------------------------------------------- R3 on prices
for row in prices:
    ref = f"{row['product']}|{row['month']}"
    if row["price_usd"].strip() == "" or num(row["price_usd"]) <= 0:
        flag("ZERO_OR_MISSING", "Demand Planning", "sub_prices.csv", ref,
             f"price_usd is {num(row['price_usd'])}")

# ------------------------------------------------ R2 on each refinery inventory
for refinery, file in sorted(INV_FILES.items()):
    path = os.path.join(DATA, file)
    if not os.path.exists(path):
        continue
    for row in read(file):
        plant, product = row["bulk_plant"], row["product"]
        owner = PLANT_OWNER.get(plant)
        ref = f"{plant}|{product}"
        value = num(row["opening_inventory_kb"])

        if owner is None or (owner, plant, product) not in LIMIT_BY_KEY:
            flag("UNKNOWN_ENTITY", f"Refinery {refinery}", file, ref,
                 f"{product} at {plant} is not present in ref_limits.csv")
            continue

        # THE MATCHING RULE: a submitted row matches a reference row only when
        # refinery AND bulk_plant AND product all match. Comparing against another
        # plant's row is the v1.0.1 bug and it is why this is spelled out.
        limit = LIMIT_BY_KEY[(owner, plant, product)]
        lo, hi = num(limit["min_level"]), num(limit["max_level"])
        if value > hi:
            flag("LIMIT_BREACH", f"Refinery {refinery}", file, ref,
                 f"opening inventory {value} kb is above max_level {hi} kb")
        elif value < lo:
            flag("LIMIT_BREACH", f"Refinery {refinery}", file, ref,
                 f"opening inventory {value} kb is below min_level {lo} kb")

# --------------------------------------------------------- R5 cross-source
# One flag per product that has demand but no price anywhere in the horizon.
priced = {row["product"] for row in prices}
demanded = {row["product"] for row in demand if (row["refinery"], row["bulk_plant"], row["product"]) in LIMIT_KEYS}
for product in sorted(demanded - priced):
    flag("CROSS_SOURCE_CONFLICT", "Demand Planning", "sub_prices.csv", product,
         f"{product} has demand in all 4 months but no price in sub_prices.csv")

# --------------------------------------------------------------------- report
print("\nFlags found:\n")
for f in sorted(flags, key=lambda f: (f["rule"], f["ref"])):
    print(f"  {f['rule']:<22} {f['source']:<18} {f['file']:<24} {f['ref']}")
    print(f"  {'':<22} {'':<18} {'':<24} {f['evidence']}\n")

EXPECTED = 3
by_rule = collections.Counter(f["rule"] for f in flags)
by_source = collections.Counter(f["source"] for f in flags)

print(f"{len(flags)} flag(s); expected {EXPECTED}.")
print("  by rule:   " + ", ".join(f"{k} {v}" for k, v in sorted(by_rule.items())))
print("  by source: " + ", ".join(f"{k} {v}" for k, v in sorted(by_source.items())))

rows = {
    "ref_limits": len(limits), "history": len(history),
    "demand": len(demand), "prices": len(prices),
    "outage": len(read("ref_outage.csv")),
}
for refinery, file in sorted(INV_FILES.items()):
    rows[f"inv_{refinery.lower()}"] = len(read(file))
print("Row counts: " + ", ".join(f"{k} {v}" for k, v in rows.items()))

problems = []

if len(flags) != EXPECTED:
    problems.append(f"expected {EXPECTED} flags, found {len(flags)}")

EXPECTED_BY_RULE = {
    "HISTORICAL_DEVIATION": 1,   # JAZAN DIESEL Oct
    "LIMIT_BREACH": 1,
    "ZERO_OR_MISSING": 1,
}
if dict(by_rule) != EXPECTED_BY_RULE:
    problems.append(f"rule mix is {dict(by_rule)}, expected {EXPECTED_BY_RULE}")

# The two clean refineries. Their green check marks are on screen for the whole demo.
for clean in ("Refinery YANBU", "Refinery RIYADH"):
    if by_source.get(clean):
        problems.append(f"{clean} must be clean, has {by_source[clean]} flag(s)")

# The pinned demo numbers.
jazan_diesel_mean = round(MEANS[("JAZAN", "BP-JAZAN", "DIESEL")], 4)
if jazan_diesel_mean != 25.1:
    problems.append(f"JAZAN|BP-JAZAN|DIESEL 12-month mean is {jazan_diesel_mean}, must be exactly 25.1")

oct_diesel = next(
    (num(r["demand_kb"]) for r in demand
     if (r["refinery"], r["bulk_plant"], r["product"], r["month"]) == ("JAZAN", "BP-JAZAN", "DIESEL", "2026-10")),
    None,
)
if oct_diesel != 41.2:
    problems.append(f"JAZAN DIESEL 2026-10 is {oct_diesel}, must be 41.2")

jazan_cap = num(LIMIT_BY_KEY[("JAZAN", "BP-JAZAN", "DIESEL")]["capacity"])
if jazan_cap != 45.0:
    problems.append(f"JAZAN DIESEL capacity is {jazan_cap}, must be 45.0 or the 15.4 kb swing is clipped")

oct_diesel_price = next(
    (num(r["price_usd"]) for r in prices if (r["product"], r["month"]) == ("DIESEL", "2026-10")),
    None,
)
if oct_diesel_price != 93.84:
    problems.append(f"DIESEL 2026-10 price is {oct_diesel_price}, must be 93.84 for the -$1.45M delta")

# Every planned series in demand must have reference limits.
unknown_series = {
    (r["refinery"], r["bulk_plant"], r["product"]) for r in demand
} - LIMIT_KEYS
if unknown_series:
    problems.append(f"demand rows without reference limits: {sorted(unknown_series)}")

if problems:
    print("\nFAIL")
    for p in problems:
        print(f"  - {p}")
    sys.exit(1)

print("\nPASS - exactly the three planted validation flags; YANBU and RIYADH clean; demo numbers pinned.")
