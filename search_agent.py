#!/usr/bin/env python3
"""Command-line price search. The searchable class lives in finder.price."""

import argparse
import asyncio
import json
import sys

from finder.browser import CamoufoxAutomationEngine, get_actual_executable
from finder.price import PriceSearchAgent

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HumanizedSearchAgent = PriceSearchAgent


def parse_args():
    parser = argparse.ArgumentParser(description="Search component offers across vendors.")
    parser.add_argument("--query", help="Component name or specification to search.")
    parser.add_argument(
        "--robu-url",
        help="Robu product URL; its page title is used as the cross-vendor query.",
    )
    parser.add_argument(
        "--sites",
        help="Comma-separated vendor domains to search, for example leedscart.com,tomsonelectronics.com.",
    )
    return parser.parse_args()


async def main():
    args = parse_args()
    agent = PriceSearchAgent()
    query = args.query or "1K OHM 1/4W RESISTOR"
    sites = [site.strip() for site in args.sites.split(",")] if args.sites else None
    try:
        output = await agent.search(query, sites=sites, origin_url=args.robu_url)
    except ValueError as err:
        raise SystemExit(str(err)) from err

    print(f"\nSearching headlessly for: {output['query']}")
    print("Sites:", ", ".join(agent.ordered_domains()))
    print("\nResults by site:")
    for domain in agent.ordered_domains():
        site_offers = [item for item in output["offers"] if item.get("vendor") == domain]
        print(f"  {domain}: {len(site_offers)} offer(s)")
        for item in site_offers[:3]:
            price = item.get("price_raw") or "no price"
            print(f"    - {item.get('title')} | {price}")
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
