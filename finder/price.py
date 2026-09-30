"""Multi-vendor component price search."""

import asyncio
import re
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, quote_plus, unquote, urljoin, urlparse

from camoufox.async_api import AsyncCamoufox

from finder.browser import CamoufoxAutomationEngine, get_actual_executable
from finder.saved_links import matching_offers
from finder.sites import ordered_domains as saved_domain_order, read_store


class PriceSearchAgent:
    INR_PER_CURRENCY = {
        "INR": Decimal("1"),
        "USD": Decimal("83"),
        "EUR": Decimal("90"),
        "GBP": Decimal("105"),
    }

    def __init__(self, engine: CamoufoxAutomationEngine | None = None):
        self.engine = engine or CamoufoxAutomationEngine()
        self.executable_path = get_actual_executable()
        self.engine.log("INFO", f"Bound browser executable: {self.executable_path}")
        self.builtin_providers = {
            "robu.in": {
                "search_url": "https://robu.in/?s={query}&post_type=product",
                "item_card_selector": 'a[href*="/product/"]',
                "title_selector": ":scope",
                "link_selector": ":scope",
                "price_selector": "xpath=../..",
                "base_url": "https://robu.in",
            },
            "etstore.in": {
                "search_url": "https://www.etstore.in/search?q={query}&type=product",
                "item_card_selector": ".product-card, .grid-product, div.product-item, .product-grid-item",
                "title_selector": ".product-card__title, .grid-product__title, a[href*='/products/']",
                "link_selector": "a[href*='/products/']",
                "price_selector": ".price, .product-card__price, .price-item, .money",
                "base_url": "https://www.etstore.in",
            },
            "sharvielectronics.com": {
                "search_url": "https://sharvielectronics.com/?s={query}&post_type=product",
                "item_card_selector": 'a[href*="/product/"]',
                "title_selector": ":scope",
                "link_selector": ":scope",
                "price_selector": "xpath=../..",
                "base_url": "https://sharvielectronics.com",
            },
            "in.element14.com": {
                "search_url": "https://in.element14.com/search/prl/results?st={query}",
                "item_card_selector": "[class*='TableContainer']:not(.table-clone) tr[class*='TableRow']",
                "title_selector": "[data-testid='catalog.listerTable.manufacturer-table-cell__link']",
                "link_selector": "[data-testid='catalog.listerTable.manufacturer-table-cell__link']",
                "price_selector": "[data-testid='catalog.listerTable.table-cell__price-breakup']",
                "price_match": "first",
                "base_url": "https://in.element14.com",
            },
            "leedscart.com": {
                "search_url": "https://www.leedscart.com/index.php?route=product/search&search={query}",
                "item_card_selector": ".product-layout",
                "title_selector": ".caption h4 a",
                "link_selector": ".caption h4 a",
                "price_selector": "p.price",
                "base_url": "https://www.leedscart.com",
            },
            "tomsonelectronics.com": {
                "search_url": "https://www.tomsonelectronics.com/search?q={query}&type=product",
                "item_card_selector": "section.product-card",
                "title_selector": "h3.product-card_title a",
                "link_selector": "h3.product-card_title a",
                "price_selector": ".product-price .price",
                "base_url": "https://www.tomsonelectronics.com",
            },
        }
        store = read_store()
        self.search_providers = {**self.builtin_providers, **store["custom"]}
        self.priority = saved_domain_order(list(self.builtin_providers), store)

    def ordered_domains(self) -> list[str]:
        """Domains that will be searched, highest priority first."""
        ranked = [domain for domain in self.priority if domain in self.search_providers]
        rest = [domain for domain in self.search_providers if domain not in ranked]
        return ranked + rest

    def reload_sites(self) -> None:
        """Read sites.json again after settings change the shop list."""
        store = read_store()
        self.search_providers = {**self.builtin_providers, **store["custom"]}
        self.priority = saved_domain_order(list(self.builtin_providers), store)

    def limit_sites(self, sites: list[str] | None) -> None:
        if not sites:
            return
        wanted = {site.strip().lower().removeprefix("www.") for site in sites if site.strip()}
        unknown = wanted - set(self.search_providers)
        if unknown:
            raise ValueError(f"Unknown site(s): {', '.join(sorted(unknown))}")
        self.search_providers = {
            domain: config
            for domain, config in self.search_providers.items()
            if domain in wanted
        }

    @classmethod
    def parse_price(
        cls, value: str | None, pick: str = "last"
    ) -> tuple[float | None, str | None, float | None]:
        if not value:
            return None, None, None
        matches = list(
            re.finditer(
                r"(?P<currency>[$€£₹]|USD|EUR|GBP|INR|Rs\.?)\s*"
                r"(?P<amount>\d[\d,]*(?:\.\d{1,3})?)",
                value,
                re.IGNORECASE,
            )
        )
        if not matches:
            match = None
        elif pick == "first":
            match = matches[0]
        else:
            match = matches[-1]
        if not match:
            matches = list(re.finditer(r"(?P<amount>\d[\d,]*(?:\.\d{1,3})?)", value))
            match = matches[-1] if matches else None
            if not match:
                return None, None, None
        symbol = (match.group("currency") or "INR").upper()
        currency = {"$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "RS.": "INR"}.get(
            symbol, symbol
        )
        if currency not in cls.INR_PER_CURRENCY:
            return None, None, None
        try:
            amount = Decimal(match.group("amount").replace(",", ""))
        except InvalidOperation:
            return None, None, None
        normalized = amount * cls.INR_PER_CURRENCY[currency]
        return float(amount), currency, float(normalized)

    async def _text(self, locator) -> str:
        try:
            return (await locator.inner_text()).strip()
        except Exception:
            return ""

    BADGE_TITLES = {"hot", "sale", "new", "out of stock", "sold out", "featured"}

    @classmethod
    def product_title(cls, visible: str, title_attr: str | None) -> str:
        """Pick the product name and skip sale badges such as HOT."""
        lines = [line.strip() for line in re.split(r"[\n|]+", visible or "") if line.strip()]
        names = [line for line in lines if line.lower() not in cls.BADGE_TITLES]
        if names:
            return names[0]
        attr = (title_attr or "").strip()
        if attr and attr.lower() not in cls.BADGE_TITLES:
            return attr
        return ""

    @classmethod
    def availability_from_text(cls, blob: str) -> str | None:
        """Read in-stock or out-of-stock from product card text and class names."""
        text = " ".join((blob or "").lower().split())
        if any(token in text for token in ("out of stock", "sold out", "outofstock", "out-of-stock")):
            return "out_of_stock"
        if any(token in text for token in ("in stock", "instock", "in-stock")):
            return "in_stock"
        return None

    async def _extract_card(self, card, config: dict) -> dict | None:
        title = link = ""
        title_el = card.locator(config["title_selector"]).first
        link_el = card.locator(config["link_selector"]).first
        if await title_el.count():
            visible = await self._text(title_el)
            attr = await title_el.get_attribute("title")
            title = self.product_title(visible, attr)
        if await link_el.count():
            link = await link_el.get_attribute("href") or ""
        card_text = await self._text(card)
        if not title:
            title = self.product_title(card_text, None)
        if not link:
            fallback = card.locator('a[href*="/product/"], a[href*="/ProductDetail/"]').first
            if await fallback.count():
                link = await fallback.get_attribute("href") or ""
        if not title or not link:
            return None
        price_el = card.locator(config["price_selector"]).first
        price_raw = await self._text(price_el) if await price_el.count() else card_text
        price, currency, normalized = self.parse_price(
            price_raw, pick=config.get("price_match", "last")
        )
        return {
            "title": title,
            "link": urljoin(config["base_url"], link),
            "price_raw": price_raw,
            "price": price,
            "currency": currency,
            "normalized_price_inr": normalized,
        }

    async def get_product_details(self, product_url: str) -> dict | None:
        parsed = urlparse(product_url)
        domain = parsed.netloc.lower().removeprefix("www.")
        slug = parsed.path.rstrip("/").rsplit("/", 1)[-1]
        fallback_title = re.sub(r"[-_]+", " ", slug).strip().title()
        context_dir = self.engine.get_persistent_context_dir(domain)
        try:
            async with AsyncCamoufox(
                headless=True,
                persistent_context=True,
                user_data_dir=str(context_dir),
                executable_path=self.executable_path,
            ) as context:
                await self.engine.configure_stealth_context(context)
                page = await context.new_page()
                response = await page.goto(
                    product_url, wait_until="domcontentloaded", timeout=30000
                )
                await self.engine.human_delay(1.0, 2.0)
                blocked = (
                    not response
                    or response.status in {403, 429, 503}
                    or await self.engine.is_captcha_or_blocked(page)
                )
                if blocked:
                    self.engine.log(
                        "WARN",
                        "Origin page is protected; reopening the same persistent "
                        "profile in a headed browser.",
                    )
                else:
                    return await self._extract_origin_page(
                        page, domain, product_url, fallback_title
                    )
        except Exception as err:
            self.engine.log("WARN", f"Origin headless lookup failed: {err}")

        try:
            async with AsyncCamoufox(
                headless=False,
                persistent_context=True,
                user_data_dir=str(context_dir),
                executable_path=self.executable_path,
            ) as context:
                await self.engine.configure_stealth_context(context)
                page = await context.new_page()
                await page.bring_to_front()
                await page.goto(product_url, wait_until="domcontentloaded", timeout=45000)
                if not await self.engine.wait_for_challenge_clear(page, timeout_seconds=120):
                    return None
                return await self._extract_origin_page(
                    page, domain, product_url, fallback_title
                )
        except Exception as err:
            self.engine.log("WARN", f"Origin headed lookup failed: {err}")
            return {
                "vendor": domain,
                "title": fallback_title,
                "price_raw": None,
                "price": None,
                "currency": None,
                "normalized_price_inr": None,
                "link": product_url,
            }

    async def _extract_origin_page(
        self, page, domain: str, product_url: str, fallback_title: str
    ) -> dict:
        title = (await page.title()).strip()
        price_locator = page.locator(
            ".price ins .amount, .price .amount, "
            ".woocommerce-Price-amount, [class*='price'], [class*='Price']"
        ).first
        price_raw = await self._text(price_locator) if await price_locator.count() else ""
        price, currency, normalized = self.parse_price(price_raw)
        return {
            "vendor": domain,
            "title": re.sub(r"\s*[|\-]\s*.*$", "", title).strip() or fallback_title,
            "price_raw": price_raw,
            "price": price,
            "currency": currency,
            "normalized_price_inr": normalized,
            "link": product_url,
        }

    async def find_product_datasheet(self, product_url: str) -> dict | None:
        """Open a product page and return the datasheet or PDF attachment on that page."""
        parsed = urlparse(product_url)
        domain = parsed.netloc.lower().removeprefix("www.") or "product"
        context_dir = self.engine.get_persistent_context_dir(domain)
        try:
            async with AsyncCamoufox(
                headless=True,
                persistent_context=True,
                user_data_dir=str(context_dir),
                executable_path=self.executable_path,
            ) as context:
                await self.engine.configure_stealth_context(context)
                page = await context.new_page()
                await page.goto(product_url, wait_until="domcontentloaded", timeout=15000)
                try:
                    await page.wait_for_selector("a[href]", timeout=5000)
                except Exception:
                    pass
                found = await page.evaluate(
                    r"""() => {
                      const anchors = Array.from(document.querySelectorAll('a[href]'));
                      const hits = [];
                      for (const anchor of anchors) {
                        const href = anchor.href || '';
                        const text = (anchor.innerText || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '')
                          .replace(/\s+/g, ' ')
                          .trim();
                        const blob = (text + ' ' + href).toLowerCase();
                        const path = href.toLowerCase().split('?')[0];
                        const isPdf = path.endsWith('.pdf');
                        const isSheet = blob.includes('datasheet');
                        if (href && (isSheet || isPdf)) hits.push({ href, text, isSheet });
                      }
                      const preferred = hits.find((item) => item.isSheet) || hits[0];
                      return preferred ? { href: preferred.href, text: preferred.text } : null;
                    }"""
                )
        except Exception as err:
            self.engine.log("WARN", f"Product datasheet lookup failed: {err}")
            return None
        if not found or not found.get("href"):
            return None
        return {"pdf_url": found["href"], "title": (found.get("text") or "").strip()}

    async def extract_results(self, page, domain: str, config: dict) -> list[dict]:
        results = []
        cards = page.locator(config["item_card_selector"])
        for _ in range(30):
            if await cards.count():
                break
            await asyncio.sleep(0.5)
        if not await cards.count():
            self.engine.log("WARN", f"No product cards found on {domain}")
            return results

        count = await cards.count()
        self.engine.log("INFO", f"Found {count} cards on {domain}")

        for index in range(min(count, 8)):
            card = cards.nth(index)
            try:
                item = await self._extract_card(card, config)
            except Exception:
                continue
            if item and item["title"].strip().lower() not in {"view", "details", "buy"}:
                visible, classes = await self._stock_blob(card)
                item["details"] = " ".join(visible.split())[:500]
                item["availability"] = self.availability_from_text(f"{visible} {classes}")
                item["vendor"] = domain
                results.append(item)
        return results

    async def _stock_blob(self, card) -> tuple[str, str]:
        """Visible card text and class names, including the product wrapper."""
        texts = [await self._text(card)]
        classes = [await card.get_attribute("class") or ""]
        try:
            extra = await card.evaluate(
                """(el) => {
                  const texts = [];
                  const classes = [el.className || ''];
                  let node = el.parentElement;
                  for (let depth = 0; depth < 5 && node; depth += 1) {
                    const name = node.className || '';
                    classes.push(name);
                    if (/product|stock|availability/i.test(name)) {
                      texts.push(node.innerText || '');
                      break;
                    }
                    node = node.parentElement;
                  }
                  const stock = el.querySelector('[class*="stock"], [class*="availability"]');
                  if (stock) texts.push(stock.innerText || '');
                  return { text: texts.join(' '), classes: classes.join(' ') };
                }"""
            )
            if extra:
                texts.append(extra.get("text") or "")
                classes.append(extra.get("classes") or "")
        except Exception:
            pass
        return " ".join(part for part in texts if part), " ".join(part for part in classes if part)

    async def _report(self, on_progress, domain: str, status: str, **extra) -> None:
        if on_progress is None:
            return
        event = {"site": domain, "status": status}
        event.update({key: value for key, value in extra.items() if value is not None})
        await on_progress(event)

    async def search_site(
        self,
        semaphore: asyncio.Semaphore,
        domain: str,
        config: dict,
        query: str,
        on_progress=None,
    ) -> list[dict]:
        async with semaphore:
            await self._report(on_progress, domain, "searching")
            search_url = config["search_url"].format(query=quote_plus(query))
            context_dir = self.engine.get_persistent_context_dir(domain)

            try:
                async with AsyncCamoufox(
                    headless=True,
                    persistent_context=True,
                    user_data_dir=str(context_dir),
                    executable_path=self.executable_path,
                ) as context:
                    await self.engine.configure_stealth_context(context)
                    page = await context.new_page()
                    self.engine.log("INFO", f"Navigating headlessly to {domain}: {search_url}")
                    response = await page.goto(
                        search_url, wait_until="domcontentloaded", timeout=15000
                    )
                    blocked = (
                        response is not None and response.status in {403, 429, 503}
                    ) or await self.engine.is_captcha_or_blocked(page)
                    if not blocked:
                        rows = await self.extract_results(page, domain, config)
                        await self._report(on_progress, domain, "done", count=len(rows), offers=rows)
                        return rows
                    self.engine.log(
                        "WARN",
                        f"Challenge detected on {domain}; reopening the same "
                        "persistent profile in a headed browser.",
                    )
            except Exception as err:
                self.engine.log("ERROR", f"Search failed on {domain}: {err}")
                await self._report(on_progress, domain, "error", detail=str(err))
                return []

            try:
                async with AsyncCamoufox(
                    headless=False,
                    persistent_context=True,
                    user_data_dir=str(context_dir),
                    executable_path=self.executable_path,
                ) as context:
                    await self.engine.configure_stealth_context(context)
                    page = await context.new_page()
                    await page.bring_to_front()
                    self.engine.log("INFO", f"Waiting for human challenge completion on {domain}.")
                    await page.goto(search_url, wait_until="domcontentloaded", timeout=45000)
                    if not await self.engine.wait_for_challenge_clear(page, timeout_seconds=120):
                        await self._report(on_progress, domain, "done", count=0, offers=[])
                        return []
                    await self.engine.human_mouse_move(page)
                    await self.engine.human_scroll(page)
                    rows = await self.extract_results(page, domain, config)
                    await self._report(on_progress, domain, "done", count=len(rows), offers=rows)
                    return rows
            except Exception as err:
                self.engine.log("ERROR", f"Headed challenge recovery failed on {domain}: {err}")
                await self._report(on_progress, domain, "error", detail=str(err))
                return []

    async def search_all(self, query: str, on_progress=None) -> list[dict]:
        domains = self.ordered_domains()
        rank = {domain: index for index, domain in enumerate(domains)}

        async def report(event: dict) -> None:
            if on_progress is None:
                return
            stamped = dict(event)
            stamped["priority"] = rank.get(stamped.get("site"), len(domains))
            await on_progress(stamped)

        semaphore = asyncio.Semaphore(max(len(domains), 1))
        tasks = [
            self.search_site(semaphore, domain, self.search_providers[domain], query, report)
            for domain in domains
        ]
        all_results = await asyncio.gather(*tasks, return_exceptions=True)
        combined = []
        for result in all_results:
            if isinstance(result, list):
                combined.extend(result)

        unique = {}
        for item in combined:
            key = (item["vendor"], item["link"], item.get("price"))
            unique[key] = item
        offers = list(unique.values())
        tail = len(rank)
        offers.sort(
            key=lambda item: (
                rank.get(item.get("vendor"), tail),
                item["normalized_price_inr"] is None,
                item["normalized_price_inr"] or 0,
            )
        )
        return offers

    def search_template(self, url: str, sample_query: str) -> str:
        """Replace the sample part in a results URL with {query}."""
        sample = " ".join(sample_query.split())
        if not sample:
            raise ValueError("Enter the sample part that is already in the search URL.")
        for token in (quote_plus(sample), quote(sample), sample):
            if token and token in url:
                return url.replace(token, "{query}", 1)
        decoded = unquote(url)
        if sample in decoded:
            return decoded.replace(sample, "{query}", 1)
        raise ValueError("The sample query was not found in that search URL.")

    async def learn_shop(self, url: str, sample_query: str = "1k resistor") -> dict:
        """Open one results page, clear a challenge if needed, and learn product cards."""
        parsed = urlparse(url.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Enter a full search URL, including https://.")
        template = self.search_template(url.strip(), sample_query)
        domain = parsed.netloc.lower().removeprefix("www.")
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        context_dir = self.engine.get_persistent_context_dir(domain)
        page_url = url.strip()

        async def open_page(headless: bool):
            async with AsyncCamoufox(
                headless=headless,
                persistent_context=True,
                user_data_dir=str(context_dir),
                executable_path=self.executable_path,
            ) as context:
                await self.engine.configure_stealth_context(context)
                page = await context.new_page()
                if not headless:
                    await page.bring_to_front()
                response = await page.goto(page_url, wait_until="domcontentloaded", timeout=45000)
                await self.engine.human_delay(1.2, 2.0)
                blocked = (
                    response is not None and response.status in {403, 429, 503}
                ) or await self.engine.is_captcha_or_blocked(page)
                if blocked:
                    if headless:
                        return "blocked"
                    if not await self.engine.wait_for_challenge_clear(page, timeout_seconds=120):
                        return "captcha"
                await self.engine.human_mouse_move(page)
                await self.engine.human_scroll(page)
                learned = await page.evaluate(
                    """() => {
                      const priceRe = /(?:[$€£₹]|USD|EUR|GBP|INR|Rs\\.?)\\s*\\d[\\d,]*(?:\\.\\d{1,3})?/i;
                      const groups = new Map();
                      for (const el of document.querySelectorAll('body *')) {
                        if (!el || el.children.length > 12) continue;
                        const text = (el.innerText || '').trim();
                        if (!text || text.length > 800 || !priceRe.test(text)) continue;
                        const link = el.querySelector('a[href]');
                        if (!link) continue;
                        const classes = [...el.classList].filter((name) => /^[A-Za-z_-]/.test(name)).slice(0, 2);
                        const selector = el.tagName.toLowerCase() + classes.map((name) => '.' + CSS.escape(name)).join('');
                        const bucket = groups.get(selector) || { count: 0, items: [] };
                        bucket.count += 1;
                        if (bucket.items.length < 5) {
                          bucket.items.push({
                            title: (link.innerText || '').trim().slice(0, 180),
                            href: link.getAttribute('href') || '',
                            text,
                          });
                        }
                        groups.set(selector, bucket);
                      }
                      let best = null;
                      for (const [selector, bucket] of groups) {
                        if (bucket.count < 3) continue;
                        const score = bucket.count + selector.split('.').length * 3;
                        if (!best || score > best.score) best = { selector, items: bucket.items, score };
                      }
                      return best ? { selector: best.selector, items: best.items } : null;
                    }"""
                )
                return learned

        try:
            learned = await open_page(True)
        except Exception as err:
            self.engine.log("ERROR", f"Learn failed on {domain}: {err}")
            learned = None
        if learned == "blocked":
            try:
                learned = await open_page(False)
            except Exception as err:
                self.engine.log("ERROR", f"Headed learn failed on {domain}: {err}")
                learned = None
        if learned in {"blocked", "captcha", None} or not isinstance(learned, dict):
            return {
                "recognized": False,
                "domain": domain,
                "search_url": template,
                "message": (
                    "The page layout was not recognized. The browser profile was kept. "
                    "Complete the check if a window is open, or try another results URL."
                ),
                "config": None,
                "samples": [],
            }

        config = {
            "search_url": template,
            "item_card_selector": learned["selector"],
            "title_selector": "a",
            "link_selector": "a",
            "price_selector": ":scope",
            "price_match": "first",
            "base_url": base_url,
        }
        samples = []
        for item in learned.get("items") or []:
            price, currency, normalized = self.parse_price(item.get("text"), pick="first")
            title = " ".join((item.get("title") or "").split())
            link = urljoin(base_url, item.get("href") or "")
            if not title or not link:
                continue
            samples.append(
                {
                    "title": title,
                    "link": link,
                    "vendor": domain,
                    "price_raw": item.get("text", "")[:180],
                    "price": price,
                    "currency": currency,
                    "normalized_price_inr": normalized,
                    "details": " ".join((item.get("text") or "").split())[:300],
                }
            )
            if len(samples) >= 5:
                break
        if not samples:
            return {
                "recognized": False,
                "domain": domain,
                "search_url": template,
                "message": (
                    "The page layout was not recognized. The browser profile was kept. "
                    "Try another results URL."
                ),
                "config": None,
                "samples": [],
            }
        return {
            "recognized": True,
            "domain": domain,
            "search_url": template,
            "message": f"Found {len(samples)} sample offers on {domain}.",
            "config": config,
            "samples": samples,
        }

    async def search(
        self,
        query: str,
        sites: list[str] | None = None,
        origin_url: str | None = None,
        on_progress=None,
        pitch: str = "",
    ) -> dict:
        """Search vendors and return JSON-ready data for the CLI or API."""
        self.limit_sites(sites)
        origin = None
        if origin_url:
            origin = await self.get_product_details(origin_url)
            if origin and origin.get("title"):
                query = origin["title"]
        shop_query = " ".join(part for part in (query, pitch.strip()) if part)
        saved = matching_offers(query)
        if saved:
            await self._report(
                on_progress,
                "Saved links",
                "done",
                count=len(saved),
                offers=saved,
                priority=-1,
            )
        live = await self.search_all(shop_query, on_progress)
        seen = {item["link"] for item in saved}
        offers = list(saved)
        offers.extend(item for item in live if item.get("link") not in seen)
        return {"query": query, "origin": origin, "offers": offers}
