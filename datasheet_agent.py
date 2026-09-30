#!/usr/bin/env python3
"""Command-line datasheet search. The searchable class lives in finder.datasheet."""

import argparse
import asyncio
import json
import sys

from finder.datasheet import DatasheetSearchAgent

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def parse_args():
    parser = argparse.ArgumentParser(description="Search and download a component datasheet.")
    parser.add_argument("--query", help="IC/component name or SMD marking code.")
    parser.add_argument("--manufacturer", default="", help="Manufacturer to prefer, for example TI.")
    parser.add_argument("--package", default="", help="Package to prefer, for example SOIC-14.")
    parser.add_argument(
        "--smd",
        action="store_true",
        help="Treat the query as an SMD marking code on s-manuals.com.",
    )
    parser.add_argument("--pick", type=int, help="Choose this result number instead of prompting.")
    return parser.parse_args()


async def main():
    args = parse_args()
    query = (args.query or "").strip()
    if not query:
        query = input("Component name or SMD code: ").strip()
    if not query:
        raise SystemExit("A component name or SMD code is required.")

    agent = DatasheetSearchAgent()
    print(f"\nSearching datasheets for: {query}")
    result = await agent.search(query, args.manufacturer, args.package, args.smd)
    if result["smd"]:
        print("Treating the query as an SMD marking code.")
    candidates = result["candidates"]
    if not candidates:
        print("No datasheet found.")
        print(json.dumps({**result, "chosen": None}, indent=2, ensure_ascii=False))
        return

    try:
        chosen = agent.choose(candidates, query, args.pick)
    except ValueError as err:
        raise SystemExit(str(err)) from err
    saved_path = await agent.download_pdf(chosen) if chosen else None
    if chosen is not None:
        chosen["saved_path"] = saved_path
    print(json.dumps({**result, "chosen": chosen}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
