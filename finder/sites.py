"""Custom shops and the priority order saved in sites.json."""

import json
from pathlib import Path

CONFIG_PATH = Path("sites.json")
REQUIRED_CONFIG_KEYS = (
    "search_url",
    "item_card_selector",
    "title_selector",
    "link_selector",
    "price_selector",
    "base_url",
)


def read_store() -> dict:
    """Load the site file, or an empty store when it has not been created."""
    if not CONFIG_PATH.is_file():
        return {"priority": [], "custom": {}}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"priority": [], "custom": {}}
    return {
        "priority": [str(item) for item in data.get("priority") or []],
        "custom": dict(data.get("custom") or {}),
    }


def write_store(store: dict) -> None:
    """Write the priority list and custom shop configs."""
    CONFIG_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


def ordered_domains(builtin: list[str], store: dict | None = None) -> list[str]:
    """Return built-in and custom domains, priority first."""
    store = store if store is not None else read_store()
    custom = store["custom"]
    ordered = []
    for domain in store["priority"]:
        if domain in builtin or domain in custom:
            ordered.append(domain)
    for domain in list(builtin) + list(custom):
        if domain not in ordered:
            ordered.append(domain)
    return ordered


def list_sites(builtin: list[str]) -> list[dict]:
    """Return sites in priority order, marking which ones the user added."""
    store = read_store()
    custom = store["custom"]
    return [
        {"domain": domain, "custom": domain in custom}
        for domain in ordered_domains(builtin, store)
    ]


def save_order(order: list[str], builtin: list[str]) -> list[dict]:
    """Save a priority list and keep any known site that was left out."""
    store = read_store()
    known = set(builtin) | set(store["custom"])
    cleaned = []
    for domain in order:
        if domain in known and domain not in cleaned:
            cleaned.append(domain)
    for domain in ordered_domains(builtin, store):
        if domain not in cleaned:
            cleaned.append(domain)
    store["priority"] = cleaned
    write_store(store)
    return list_sites(builtin)


def save_custom(domain: str, config: dict, builtin: list[str]) -> list[dict]:
    """Store a learned shop. Built-in domains are left unchanged."""
    if domain in builtin:
        raise ValueError(f"{domain} is already a built-in site.")
    missing = [key for key in REQUIRED_CONFIG_KEYS if not str(config.get(key) or "").strip()]
    if missing:
        raise ValueError(f"Shop config is missing {', '.join(missing)}.")
    if "{query}" not in config["search_url"]:
        raise ValueError("The search URL must contain {query}.")
    store = read_store()
    store["custom"][domain] = {
        "search_url": config["search_url"],
        "item_card_selector": config["item_card_selector"],
        "title_selector": config["title_selector"],
        "link_selector": config["link_selector"],
        "price_selector": config["price_selector"],
        "base_url": config["base_url"],
        "price_match": config.get("price_match") or "first",
    }
    if domain not in store["priority"]:
        store["priority"].append(domain)
    write_store(store)
    return list_sites(builtin)


def delete_custom(domain: str, builtin: list[str]) -> list[dict]:
    """Remove a user-added shop. Built-in shops stay."""
    if domain in builtin:
        raise ValueError("Built-in sites cannot be removed.")
    store = read_store()
    store["custom"].pop(domain, None)
    store["priority"] = [item for item in store["priority"] if item != domain]
    write_store(store)
    return list_sites(builtin)
