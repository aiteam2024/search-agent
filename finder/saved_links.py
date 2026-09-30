"""Saved product links shown before a live shop search."""

import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

DATA_PATH = Path("data/saved_links.json")
SOURCE_XLSX = Path(r"C:\Users\aitea\Downloads\verified_parts_list.xlsx")
TRUSTED_STATUS = {"verified", "verified-replaced", "high-confidence"}
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _read_rows() -> list[dict]:
    if not DATA_PATH.is_file():
        return []
    try:
        data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return list(data) if isinstance(data, list) else []


def _write_rows(rows: list[dict]) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")


def _xlsx_rows(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as workbook:
        shared = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
        strings = [
            "".join(node.text or "" for node in item.iter(NS + "t"))
            for item in shared.findall(NS + "si")
        ]
        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.findall(NS + "sheetData/" + NS + "row"):
        cells = {}
        for cell in row.findall(NS + "c"):
            value = cell.find(NS + "v")
            if value is None or not value.text:
                continue
            text = strings[int(value.text)] if cell.get("t") == "s" else value.text
            column = "".join(char for char in (cell.get("r") or "") if char.isalpha())
            cells[column] = text
        if cells.get("A") and cells.get("A") != "item_name":
            rows.append(cells)
    return rows


def ensure_store() -> list[dict]:
    """Import trusted spreadsheet rows the first time the store is missing."""
    rows = _read_rows()
    if rows or not SOURCE_XLSX.is_file():
        return rows
    imported = []
    for cells in _xlsx_rows(SOURCE_XLSX):
        status = (cells.get("C") or "").strip().lower()
        link = (cells.get("B") or "").strip()
        name = " ".join((cells.get("A") or "").split())
        if status not in TRUSTED_STATUS or not name or not link.startswith("http"):
            continue
        imported.append({"title": name, "link": link, "status": status})
    _write_rows(imported)
    return imported


def vendor_for(link: str) -> str:
    """Hostname without www, used as the offer vendor."""
    host = urlparse(link).netloc.lower().removeprefix("www.")
    return host or "saved"


def add_saved_link(title: str, link: str) -> None:
    """Remember a store link the user added to a project."""
    name = " ".join(title.split())
    href = link.strip()
    if not name or not href.startswith("http"):
        return
    rows = ensure_store()
    if any(row.get("link") == href for row in rows):
        return
    rows.append({"title": name, "link": href, "status": "added"})
    _write_rows(rows)


def _matches(query: str, name: str) -> bool:
    left = " ".join(query.lower().split())
    right = " ".join(name.lower().split())
    if len(left) < 2 or len(right) < 2:
        return False
    return left in right or right in left


def matching_offers(query: str) -> list[dict]:
    """Return saved offers whose name contains the query, or the reverse."""
    offers = []
    seen = set()
    for row in ensure_store():
        title = row.get("title") or ""
        link = row.get("link") or ""
        if not _matches(query, title) or link in seen:
            continue
        seen.add(link)
        offers.append(
            {
                "title": title,
                "link": link,
                "vendor": vendor_for(link),
                "price_raw": None,
                "price": None,
                "currency": None,
                "normalized_price_inr": None,
                "details": "Saved link",
                "saved": True,
            }
        )
    return offers
