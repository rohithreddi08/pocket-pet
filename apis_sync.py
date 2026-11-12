"""Downloads reference data the game uses into static/pet/data/ (run by app.py).

Two APIs don't allow browser requests (or need a key), so they're fetched here,
on the server, and saved as JSON the game loads like any other file:

* Breed Health Score (https://breedhealthscore.com, CC BY 4.0, no key): median
  lifespan, flat-faced flag and common hereditary conditions for our dog breeds.
  Refreshed weekly.
* USDA FoodData Central (https://fdc.nal.usda.gov, public domain): official
  energy values for the cooking ingredients, cooked the way the recipes cook
  them. Fetched once (the values don't change); delete the file to refresh.
  Uses the FDC_API_KEY environment variable, or the public DEMO_KEY.

Everything is best-effort: offline or on error, the game keeps its built-in
values.

    python apis_sync.py          # refresh whatever is missing or stale
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / "static" / "pet" / "data"
UA = {"User-Agent": "PocketPet/1.0 (local app)"}

# our breed id → Breed Health Score slug (the Indie isn't in their dataset)
BREED_SLUGS = {
    "husky": "siberian-husky",
    "malamute": "alaskan-malamute",
    "shiba": "shiba-inu",
    "akita": "akita",
    "germanshepherd": "german-shepherd-dog",
    "pug": "pug",
}

# our ingredient id → the USDA SR Legacy food that matches how the recipe cooks it:
# (FDC id, description, kcal/100 g from the SR Legacy dataset as a fallback if the API can't be reached)
FDC_FOODS = {
    "chicken": (171477, "Chicken, broilers or fryers, breast, meat only, cooked, roasted", 165),
    "turkey": (171506, "Turkey, Ground, cooked", 203),
    "fish": (171956, "Fish, cod, Atlantic, cooked, dry heat", 105),
    "beef": (171794, "Beef, ground, 90% lean meat / 10% fat, crumbles, cooked, pan-browned", 230),
    "egg": (173424, "Egg, whole, cooked, hard-boiled", 155),
    "rice": (168878, "Rice, white, long-grain, regular, enriched, cooked", 130),
    "oats": (173905, "Cereals, oats, regular and quick, unenriched, cooked with water, without salt", 71),
    "pumpkin": (168449, "Pumpkin, cooked, boiled, drained, without salt", 20),
    "sweetpot": (168484, "Sweet potato, cooked, boiled, without skin", 76),
    "carrot": (170394, "Carrots, cooked, boiled, drained, without salt", 35),
    "beans": (169141, "Beans, snap, green, cooked, boiled, drained, without salt", 35),
    "berries": (171711, "Blueberries, raw", 57),
    "broccoli": (169967, "Broccoli, cooked, boiled, drained, without salt", 35),
    "cucumber": (168409, "Cucumber, with peel, raw", 15),
}


def _get(url: str, timeout: float = 20) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return json.loads(r.read().decode("utf8"))


def _stale(path: Path, days: float) -> bool:
    return not path.exists() or time.time() - path.stat().st_mtime > days * 86400


def sync_breed_health(max_age_days: float = 7) -> bool:
    out = DATA / "breed-health.json"
    if not _stale(out, max_age_days):
        return True
    data = _get("https://breedhealthscore.com/api/breeds.json")
    by_slug = {b["slug"]: b for b in data["breeds"]}
    breeds = {}
    for ours, slug in BREED_SLUGS.items():
        b = by_slug.get(slug)
        if not b:
            continue
        breeds[ours] = {
            "name": b["breed"],
            "lifespan": b.get("median_lifespan_years"),
            "brachycephalic": bool(b.get("brachycephalic")),
            "conditions": b.get("conditions", []),
            "score": b.get("health_score"),
            "grade": b.get("grade"),
            "url": b.get("url"),
        }
    DATA.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "source": "Breed Health Score",
        "sourceUrl": "https://breedhealthscore.com",
        "licence": data.get("licence", "CC-BY-4.0"),
        "attribution": data.get("attribution", "Breed Health Score (breedhealthscore.com)"),
        "fetched": time.strftime("%Y-%m-%d"),
        "breeds": breeds,
    }, indent=1), encoding="utf8")
    return True


def sync_food_energy() -> bool:
    out = DATA / "ingredients-fdc.json"
    if out.exists():
        # done — unless the API was unavailable last time; then retry it once a day
        try:
            if "unavailable" not in json.loads(out.read_text(encoding="utf8")).get("via", "") or not _stale(out, 1):
                return True
        except ValueError:
            pass
    key = os.environ.get("FDC_API_KEY", "DEMO_KEY")
    ids = ",".join(str(v[0]) for v in FDC_FOODS.values())
    via = "FoodData Central API"
    live = {}
    try:
        # one batch request for all foods (the public DEMO_KEY allows ~30 requests an hour)
        q = urllib.parse.urlencode({"api_key": key, "fdcIds": ids, "format": "abridged", "nutrients": "208"})
        for f in _get(f"https://api.nal.usda.gov/fdc/v1/foods?{q}"):
            for n in f.get("foodNutrients", []):
                if str(n.get("number")) == "208" or n.get("nutrientNumber") == "208":
                    live[int(f["fdcId"])] = round(float(n.get("amount", n.get("value"))))
    except Exception:
        via = "FoodData Central SR Legacy dataset (API unavailable)"
    foods = {ours: {"kcal": live.get(fid, kcal), "fdcId": fid, "description": desc}
             for ours, (fid, desc, kcal) in FDC_FOODS.items()}
    DATA.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "source": "USDA FoodData Central (SR Legacy)",
        "sourceUrl": "https://fdc.nal.usda.gov",
        "via": via,
        "licence": "Public domain (CC0)",
        "fetched": time.strftime("%Y-%m-%d"),
        "unit": "kcal per 100 g",
        "foods": foods,
    }, indent=1), encoding="utf8")
    return True


def sync() -> dict:
    """Refresh what's missing or stale. Never raises: the game has built-in fallbacks."""
    status = {}
    for name, fn in (("breed-health", sync_breed_health), ("food-energy", sync_food_energy)):
        try:
            status[name] = "ok" if fn() else "no data"
        except Exception as e:  # offline, rate-limited, changed API…
            status[name] = f"skipped ({e.__class__.__name__})"
    return status


if __name__ == "__main__":
    print(sync())
