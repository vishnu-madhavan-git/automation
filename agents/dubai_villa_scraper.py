"""
Dubai Villa Lead Scraper Agent
================================
Scrapes villa listings from PropertyFinder and Bayut for direct-owner contact details.
Outputs structured JSON for the orchestrator to pass to Google Sheets CRM.

Usage:
    python agents/dubai_villa_scraper.py
    python agents/dubai_villa_scraper.py --source propertyfinder --max 50
    python agents/dubai_villa_scraper.py --source bayut --area "Palm Jumeirah"

Output:
    Writes to data/state/villa_leads.json
    Each lead: { name, phone, area, type, price, url, source, scraped_at }
"""

import argparse
import json
import time
import urllib.request
import urllib.parse
import urllib.error
import re
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
STATE_DIR = ROOT_DIR / "data" / "state"
LOG_DIR = ROOT_DIR / "data" / "logs"
LEADS_FILE = STATE_DIR / "villa_leads.json"
SCRAPER_LOG = LOG_DIR / "scraper.log"

STATE_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)


def log(msg: str) -> None:
    line = f"[{datetime.now(timezone.utc).isoformat()}] [villa-scraper] {msg}"
    print(line, flush=True)
    with open(SCRAPER_LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_existing_leads() -> list:
    if LEADS_FILE.exists():
        try:
            return json.loads(LEADS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def save_leads(leads: list) -> None:
    LEADS_FILE.write_text(json.dumps(leads, indent=2, ensure_ascii=False), encoding="utf-8")


def fetch_url(url: str, headers: dict = None) -> str | None:
    """Fetch a URL with retry logic."""
    default_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    if headers:
        default_headers.update(headers)

    req = urllib.request.Request(url, headers=default_headers)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            log(f"HTTP {e.code} on attempt {attempt+1}: {url}")
            if e.code in (403, 429):
                time.sleep(5 * (attempt + 1))
            else:
                break
        except Exception as e:
            log(f"Error on attempt {attempt+1}: {e}")
            time.sleep(3)
    return None


def extract_phones(text: str) -> list[str]:
    """Extract UAE phone numbers from text."""
    patterns = [
        r'\+971[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{4}',
        r'00971[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{4}',
        r'05\d[\s\-]?\d{3}[\s\-]?\d{4}',
        r'04[\s\-]?\d{3}[\s\-]?\d{4}',
    ]
    phones = []
    for pattern in patterns:
        found = re.findall(pattern, text)
        phones.extend(found)
    # Normalize
    normalized = []
    for p in phones:
        clean = re.sub(r'[\s\-]', '', p)
        if clean not in normalized:
            normalized.append(clean)
    return normalized


def scrape_propertyfinder(area: str = "", max_results: int = 30) -> list[dict]:
    """Scrape PropertyFinder for direct-owner Dubai villa listings."""
    leads = []
    page = 1

    area_slug = area.lower().replace(" ", "-") if area else ""
    base_url = "https://www.propertyfinder.ae/en/search?c=2&t=1&fu=1&rp=y"
    if area_slug:
        base_url += f"&l={urllib.parse.quote(area)}"

    log(f"PropertyFinder: starting scrape (area={area or 'all Dubai'}, max={max_results})")

    while len(leads) < max_results:
        url = f"{base_url}&page={page}"
        html = fetch_url(url)
        if not html:
            break

        # Extract listing cards
        # Look for direct owner markers
        listings = re.findall(
            r'data-id="(\d+)"[^>]*>.*?class="[^"]*property-card[^"]*".*?</article>',
            html, re.DOTALL
        )

        # Simpler extraction - look for villa data in JSON-LD or meta tags
        # PropertyFinder embeds listing data as JSON
        json_matches = re.findall(r'window\.__INITIAL_STATE__\s*=\s*({.*?});\s*</script>', html, re.DOTALL)
        if not json_matches:
            json_matches = re.findall(r'"properties"\s*:\s*(\[.*?\])', html, re.DOTALL)

        # Extract listing URLs for further processing
        listing_urls = re.findall(
            r'href="(/en/[^"]*villa[^"]*)" class="[^"]*card[^"]*"',
            html
        )
        if not listing_urls:
            listing_urls = re.findall(
                r'"(/en/property/[^"]+)"',
                html
            )

        if not listing_urls:
            log(f"PropertyFinder page {page}: no listings found, stopping")
            break

        log(f"PropertyFinder page {page}: found {len(listing_urls)} potential listings")

        for path in listing_urls[:10]:  # Process up to 10 per page
            if len(leads) >= max_results:
                break

            listing_url = f"https://www.propertyfinder.ae{path}"
            time.sleep(1.5)  # Polite delay

            listing_html = fetch_url(listing_url)
            if not listing_html:
                continue

            # Extract contact info
            phones = extract_phones(listing_html)

            # Extract name
            name_match = re.search(
                r'"agent[Nn]ame"\s*:\s*"([^"]+)"'
                r'|<span[^>]*class="[^"]*agent-name[^"]*"[^>]*>([^<]+)<',
                listing_html
            )
            name = ""
            if name_match:
                name = (name_match.group(1) or name_match.group(2) or "").strip()

            # Extract price
            price_match = re.search(r'"price"\s*:\s*(\d+)', listing_html)
            price = price_match.group(1) if price_match else ""

            # Check if direct owner (not agent)
            is_direct = bool(re.search(
                r'direct.*owner|owner.*direct|by.*owner|no.*commission',
                listing_html, re.IGNORECASE
            ))

            if phones:
                lead = {
                    "name": name or "Unknown",
                    "phone": phones[0],
                    "all_phones": phones,
                    "area": area or "Dubai",
                    "type": "villa",
                    "price": price,
                    "url": listing_url,
                    "source": "PropertyFinder",
                    "direct_owner": is_direct,
                    "scraped_at": now_iso()
                }
                leads.append(lead)
                log(f"  Lead: {name or 'Unknown'} | {phones[0]} | {listing_url}")

        page += 1
        time.sleep(2)

    log(f"PropertyFinder: collected {len(leads)} leads")
    return leads


def scrape_bayut(area: str = "", max_results: int = 30) -> list[dict]:
    """Scrape Bayut for direct-owner Dubai villa listings."""
    leads = []

    encoded_area = urllib.parse.quote(area) if area else "dubai"
    url = f"https://www.bayut.com/for-rent/villa/{encoded_area.lower().replace(' ', '-')}/?owner_only=1"

    log(f"Bayut: starting scrape (area={area or 'Dubai'}, max={max_results})")
    html = fetch_url(url)

    if not html:
        log("Bayut: failed to fetch listings page")
        return leads

    # Extract listing links
    listing_urls = re.findall(r'"(https://www\.bayut\.com/property/[^"]+)"', html)
    if not listing_urls:
        listing_urls = re.findall(r'href="(/property/[^"]+)"', html)
        listing_urls = [f"https://www.bayut.com{u}" for u in listing_urls]

    log(f"Bayut: found {len(listing_urls)} listing URLs")

    for listing_url in listing_urls[:max_results]:
        time.sleep(1.5)
        listing_html = fetch_url(listing_url)
        if not listing_html:
            continue

        phones = extract_phones(listing_html)

        name_match = re.search(
            r'"name"\s*:\s*"([^"]+)".*?"@type"\s*:\s*"(Person|RealEstateAgent)"'
            r'|class="[^"]*agent-name[^"]*"[^>]*>\s*([^<]+)',
            listing_html, re.DOTALL
        )
        name = ""
        if name_match:
            name = (name_match.group(1) or name_match.group(3) or "").strip()

        price_match = re.search(r'"price"\s*:\s*"?(\d+)"?', listing_html)
        price = price_match.group(1) if price_match else ""

        area_match = re.search(r'"addressLocality"\s*:\s*"([^"]+)"', listing_html)
        detected_area = area_match.group(1) if area_match else (area or "Dubai")

        if phones:
            lead = {
                "name": name or "Unknown",
                "phone": phones[0],
                "all_phones": phones,
                "area": detected_area,
                "type": "villa",
                "price": price,
                "url": listing_url,
                "source": "Bayut",
                "direct_owner": True,  # filtered by owner_only=1
                "scraped_at": now_iso()
            }
            leads.append(lead)
            log(f"  Lead: {name or 'Unknown'} | {phones[0]} | {detected_area}")

    log(f"Bayut: collected {len(leads)} leads")
    return leads


def deduplicate(existing: list, new_leads: list) -> tuple[list, int]:
    """Deduplicate by phone number."""
    existing_phones = {lead["phone"] for lead in existing}
    unique_new = []
    for lead in new_leads:
        if lead["phone"] not in existing_phones:
            unique_new.append(lead)
            existing_phones.add(lead["phone"])
    return unique_new, len(new_leads) - len(unique_new)


def main() -> None:
    parser = argparse.ArgumentParser(description="Dubai Villa Lead Scraper")
    parser.add_argument("--source", choices=["propertyfinder", "bayut", "both"], default="both")
    parser.add_argument("--area", type=str, default="", help="Dubai area (e.g. 'Palm Jumeirah', 'Emirates Hills')")
    parser.add_argument("--max", type=int, default=30, help="Max leads per source")
    parser.add_argument("--log-file", type=str, default=None, help="Extra log file path")
    args = parser.parse_args()

    log(f"=== Dubai Villa Scraper Started ===")
    log(f"Source: {args.source} | Area: {args.area or 'All Dubai'} | Max: {args.max}")

    existing = load_existing_leads()
    log(f"Existing leads in DB: {len(existing)}")

    new_leads = []

    if args.source in ("propertyfinder", "both"):
        pf_leads = scrape_propertyfinder(area=args.area, max_results=args.max)
        new_leads.extend(pf_leads)

    if args.source in ("bayut", "both"):
        bayut_leads = scrape_bayut(area=args.area, max_results=args.max)
        new_leads.extend(bayut_leads)

    unique_leads, dupes = deduplicate(existing, new_leads)
    log(f"New unique leads: {len(unique_leads)} | Duplicates skipped: {dupes}")

    all_leads = existing + unique_leads
    save_leads(all_leads)

    log(f"=== Done. Total leads in DB: {len(all_leads)} ===")

    # Print summary JSON for orchestrator to consume
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
