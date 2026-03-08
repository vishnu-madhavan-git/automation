"""
Apify Dubai Real Estate API Bridge
====================================
Uses Apify's ready-made Dubai Real Estate Scraper actor to get
owner contacts from PropertyFinder, Bayut & Dubizzle.

This is the FAST path - uses Apify's actor which handles anti-bot measures.
Requires APIFY_TOKEN in .env

Usage:
    python agents/apify_dubai_scraper.py
    python agents/apify_dubai_scraper.py --area "Palm Jumeirah" --max 100
"""

import argparse
import json
import time
import urllib.request
import urllib.error
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
STATE_DIR = ROOT_DIR / "data" / "state"
LOG_DIR = ROOT_DIR / "data" / "logs"
LEADS_FILE = STATE_DIR / "villa_leads.json"
LOG_FILE = LOG_DIR / "apify_scraper.log"

STATE_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Apify actor ID for Dubai Real Estate Scraper
ACTOR_ID = "redoubtable_bubble~dubai-real-estate-scraper-propertyfinder-bayut-dubizzle"


def log(msg: str) -> None:
    line = f"[{datetime.now(timezone.utc).isoformat()}] [apify-scraper] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def apify_request(method: str, path: str, token: str, body: dict = None) -> dict:
    url = f"https://api.apify.com/v2{path}?token={token}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        log(f"Apify API error {e.code}: {error_body}")
        return {"error": str(e.code), "message": error_body}
    except Exception as e:
        log(f"Request error: {e}")
        return {"error": str(e)}


def run_actor(token: str, area: str, max_items: int, property_type: str = "villa") -> str | None:
    """Start the Apify actor run and return run ID."""
    payload = {
        "searchQuery": f"{property_type} {area} Dubai" if area else f"{property_type} Dubai",
        "maxItems": max_items,
        "propertyType": "villa",
        "listingType": "rent",
        "location": area or "Dubai",
        "directOwnerOnly": True
    }
    log(f"Starting Apify actor: {ACTOR_ID}")
    log(f"Payload: {json.dumps(payload)}")

    result = apify_request("POST", f"/acts/{ACTOR_ID}/runs", token, payload)

    if "data" in result:
        run_id = result["data"]["id"]
        log(f"Actor started. Run ID: {run_id}")
        return run_id
    else:
        log(f"Failed to start actor: {result}")
        return None


def wait_for_run(token: str, run_id: str, timeout: int = 300) -> bool:
    """Wait for actor run to finish."""
    log(f"Waiting for run {run_id} to complete...")
    start = time.time()
    while time.time() - start < timeout:
        result = apify_request("GET", f"/actor-runs/{run_id}", token)
        status = result.get("data", {}).get("status", "")
        log(f"  Status: {status}")
        if status in ("SUCCEEDED", "FINISHED"):
            return True
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            log(f"Run failed with status: {status}")
            return False
        time.sleep(10)
    log("Timeout waiting for actor run")
    return False


def fetch_results(token: str, run_id: str) -> list[dict]:
    """Fetch results from completed actor run."""
    result = apify_request("GET", f"/actor-runs/{run_id}/dataset/items", token)
    items = result.get("data", {}).get("items", [])
    log(f"Fetched {len(items)} items from Apify")
    return items


def normalize_lead(item: dict, area: str) -> dict | None:
    """Convert Apify result to our lead format."""
    # Apify actor returns various fields - normalize them
    phone = (
        item.get("phone") or
        item.get("contactPhone") or
        item.get("agentPhone") or
        item.get("ownerPhone") or ""
    )
    name = (
        item.get("agentName") or
        item.get("ownerName") or
        item.get("contactName") or
        "Unknown"
    )
    if not phone:
        return None

    return {
        "name": name.strip(),
        "phone": phone.strip(),
        "all_phones": [phone.strip()],
        "area": item.get("location") or item.get("area") or area or "Dubai",
        "type": "villa",
        "price": str(item.get("price", "")),
        "url": item.get("url") or item.get("propertyUrl", ""),
        "source": item.get("source") or "Apify/Dubai",
        "direct_owner": item.get("directOwner", False),
        "unit_number": item.get("unitNumber", ""),
        "scraped_at": now_iso()
    }


def load_existing_leads() -> list:
    if LEADS_FILE.exists():
        try:
            return json.loads(LEADS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def save_leads(leads: list) -> None:
    LEADS_FILE.write_text(json.dumps(leads, indent=2, ensure_ascii=False), encoding="utf-8")


def deduplicate(existing: list, new_leads: list) -> tuple[list, int]:
    existing_phones = {lead["phone"] for lead in existing}
    unique_new = []
    for lead in new_leads:
        if lead["phone"] not in existing_phones:
            unique_new.append(lead)
            existing_phones.add(lead["phone"])
    return unique_new, len(new_leads) - len(unique_new)


def main() -> None:
    parser = argparse.ArgumentParser(description="Apify Dubai Villa Scraper")
    parser.add_argument("--area", type=str, default="", help="Area in Dubai (e.g. 'Palm Jumeirah')")
    parser.add_argument("--max", type=int, default=50, help="Max leads to scrape")
    parser.add_argument("--token", type=str, default=os.environ.get("APIFY_TOKEN", ""), help="Apify API token")
    args = parser.parse_args()

    if not args.token:
        log("ERROR: APIFY_TOKEN not set. Add it to .env or pass --token")
        print('__RESULT__:{"status":"error","message":"APIFY_TOKEN not set"}')
        return

    log("=== Apify Dubai Villa Scraper Started ===")

    run_id = run_actor(args.token, args.area, args.max)
    if not run_id:
        print('__RESULT__:{"status":"error","message":"Failed to start actor"}')
        return

    success = wait_for_run(args.token, run_id)
    if not success:
        print('__RESULT__:{"status":"error","message":"Actor run failed"}')
        return

    raw_items = fetch_results(args.token, run_id)
    new_leads = [n for item in raw_items if (n := normalize_lead(item, args.area)) is not None]

    existing = load_existing_leads()
    unique_leads, dupes = deduplicate(existing, new_leads)
    all_leads = existing + unique_leads
    save_leads(all_leads)

    log(f"=== Done. New: {len(unique_leads)}, Skipped: {dupes}, Total: {len(all_leads)} ===")

    summary = {
        "status": "ok",
        "new_leads": len(unique_leads),
        "total_leads": len(all_leads),
        "duplicates_skipped": dupes,
        "leads": unique_leads
    }
    print(f"\n__RESULT__:{json.dumps(summary)}")


if __name__ == "__main__":
    main()
