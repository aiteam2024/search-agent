"""Datasheet lookup for part names and SMD marking codes."""

import asyncio
import re
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

from camoufox.async_api import AsyncCamoufox

from finder.browser import CamoufoxAutomationEngine, get_actual_executable

MAX_LISTED = 12
MAX_DEVICE_LOOKUPS = 3


def is_smd_code(query: str, force: bool = False) -> bool:
    token = " ".join(query.split())
    if force:
        return True
    if " " in token or not (2 <= len(token) <= 6):
        return False
    if re.search(r"\d{3,}", token):
        return False
    if re.fullmatch(r"[A-Za-z]{1,6}\d[\w./+-]*", token):
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9*+=.\-]+", token))


def code_key(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", value or "").lower()


def safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return (cleaned or "datasheet")[:80]


class DatasheetSearchAgent:
    def __init__(self, engine: CamoufoxAutomationEngine | None = None):
        self.engine = engine or CamoufoxAutomationEngine()
        self.executable_path = get_actual_executable()
        self.output_dir = Path("./datasheets")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.engine.log("INFO", f"Bound browser executable: {self.executable_path}")
        self.part_providers = {
            "datasheets.com": {
                "search_url": "https://www.datasheets.com/search?p={query}",
                "base_url": "https://www.datasheets.com",
            },
            "alldatasheet.com": {
                "search_url": "https://www.alldatasheet.com/view.jsp?Searchword={query}",
                "base_url": "https://www.alldatasheet.com",
            },
        }

    async def _text(self, locator) -> str:
        try:
            return " ".join((await locator.inner_text()).split())
        except Exception:
            return ""

    def _candidate(
        self,
        *,
        title: str,
        manufacturer: str = "",
        package: str = "",
        description: str = "",
        source: str,
        page_url: str = "",
        pdf_url: str = "",
        mpn: str = "",
    ) -> dict | None:
        title = " ".join(title.split())
        if not title:
            return None
        if pdf_url.startswith("//"):
            pdf_url = "https:" + pdf_url
        if page_url.startswith("//"):
            page_url = "https:" + page_url
        return {
            "title": title,
            "mpn": " ".join((mpn or title).split()),
            "manufacturer": " ".join(manufacturer.split()),
            "package": " ".join(package.split()),
            "description": " ".join(description.split())[:400],
            "source": source,
            "page_url": page_url,
            "pdf_url": pdf_url,
        }

    async def browse(self, domain: str, url: str, extract):
        context_dir = self.engine.get_persistent_context_dir(domain)

        async def run(headless: bool):
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
                mode = "headlessly" if headless else "in a headed browser"
                self.engine.log("INFO", f"Navigating {mode} to {domain}: {url}")
                response = await page.goto(
                    url, wait_until="domcontentloaded", timeout=45000
                )
                await self.engine.human_delay(1.2, 2.2)
                blocked = (
                    response is not None and response.status in {403, 429, 503}
                ) or await self.engine.is_captcha_or_blocked(page)
                if blocked:
                    if headless:
                        self.engine.log(
                            "WARN",
                            f"Challenge detected on {domain}; reopening the same "
                            "persistent profile in a headed browser.",
                        )
                        return "blocked"
                    if not await self.engine.wait_for_challenge_clear(
                        page, timeout_seconds=120
                    ):
                        return []
                await self.engine.human_mouse_move(page)
                await self.engine.human_scroll(page)
                return await extract(page)

        try:
            result = await run(True)
        except Exception as err:
            self.engine.log("ERROR", f"Search failed on {domain}: {err}")
            raise
        if result != "blocked":
            return result
        try:
            result = await run(False)
            return [] if result == "blocked" else result
        except Exception as err:
            self.engine.log("ERROR", f"Headed search failed on {domain}: {err}")
            raise

    async def _tracked(self, domain: str, url: str, extract) -> list[dict]:
        await self._progress_event(domain, "searching")
        try:
            rows = await self.browse(domain, url, extract) or []
        except Exception as err:
            await self._progress_event(domain, "error", detail=str(err))
            return []
        await self._progress_event(domain, "done", count=len(rows))
        return rows

    async def _progress_event(self, site: str, status: str, count: int | None = None, detail: str | None = None) -> None:
        progress = getattr(self, "_progress", None)
        if progress is None:
            return
        event = {"site": site, "status": status}
        if count is not None:
            event["count"] = count
        if detail:
            event["detail"] = detail
        await progress(event)

    async def search_smd(self, code: str) -> list[dict]:
        path_code = code_key(code) or quote(code.strip().lower(), safe="")
        url = f"https://www.s-manuals.com/smd/{path_code}"

        async def extract(page) -> list[dict]:
            rows = page.locator("#sortTable tbody tr")
            for _ in range(20):
                if await rows.count():
                    break
                await asyncio.sleep(0.4)
            count = await rows.count()
            if not count:
                self.engine.log("WARN", f"No SMD rows found for {code}")
                return []
            self.engine.log("INFO", f"Found {count} SMD rows on s-manuals.com")
            found = []
            wanted = code_key(code)
            for index in range(min(count, 40)):
                row = rows.nth(index)
                cells = row.locator("td")
                if await cells.count() < 5:
                    continue
                marking = await self._text(cells.nth(0))
                if wanted and code_key(marking) != wanted and not code_key(marking).startswith(wanted):
                    continue
                link = row.locator("td.pdf a").first
                href = await link.get_attribute("href") if await link.count() else ""
                item = self._candidate(
                    title=await self._text(cells.nth(2)),
                    mpn=await self._text(cells.nth(2)),
                    package=await self._text(cells.nth(1)),
                    manufacturer=await self._text(cells.nth(3)),
                    description=await self._text(cells.nth(4)),
                    source="s-manuals.com",
                    page_url=url,
                    pdf_url=urljoin("https://www.s-manuals.com/", href or ""),
                )
                if item:
                    item["smd_code"] = marking
                    found.append(item)
            return found

        return await self._tracked("s-manuals.com", url, extract)

    def parse_datasheets_com(self, html: str) -> list[dict]:
        text = html.replace('\\"', '"')
        found = []
        for chunk in text.split('"part":{')[1:21]:
            def field(name: str) -> str:
                match = re.search(rf'"{re.escape(name)}":"(.*?)"', chunk)
                return match.group(1) if match else ""

            mpn = field("mpn")
            if not mpn:
                continue
            pdf_match = re.search(
                r'"bestDatasheet":\{"url":"(https:[^"]+)"', chunk
            )
            manufacturer_match = re.search(
                r'"manufacturer":\{"name":"(.*?)"', chunk
            )
            package = ""
            for spec_name in ("Casing", "Package/Case", "Package"):
                spec = re.search(
                    rf'"spec_name":"{spec_name}","spec_units":[^,]*,"spec_value":"(.*?)"',
                    chunk,
                )
                if spec:
                    package = spec.group(1)
                    break
            slug = field("slug")
            item = self._candidate(
                title=mpn,
                mpn=mpn,
                manufacturer=manufacturer_match.group(1) if manufacturer_match else "",
                package=package,
                description=field("title") or field("description"),
                source="datasheets.com",
                page_url=urljoin("https://www.datasheets.com", slug) if slug else "",
                pdf_url=pdf_match.group(1) if pdf_match else "",
            )
            if item:
                found.append(item)
        return found

    async def search_datasheets_com(self, query: str) -> list[dict]:
        url = self.part_providers["datasheets.com"]["search_url"].format(
            query=quote(query)
        )

        async def extract(page) -> list[dict]:
            html = await page.content()
            found = self.parse_datasheets_com(html)
            self.engine.log("INFO", f"Found {len(found)} parts on datasheets.com")
            if not found:
                self.engine.log("WARN", "No datasheets.com parts found")
            return found

        return await self._tracked("datasheets.com", url, extract)

    async def search_alldatasheet(self, query: str) -> list[dict]:
        url = self.part_providers["alldatasheet.com"]["search_url"].format(
            query=quote(query)
        )

        async def extract(page) -> list[dict]:
            links = page.locator("a[href*='datasheet-pdf']")
            for _ in range(20):
                if await links.count():
                    break
                await asyncio.sleep(0.4)
            count = await links.count()
            if not count:
                self.engine.log("WARN", "No alldatasheet.com datasheet links found")
                return []
            self.engine.log("INFO", f"Found {count} datasheet links on alldatasheet.com")
            found = []
            seen = set()
            for index in range(min(count, 20)):
                link = links.nth(index)
                href = await link.get_attribute("href") or ""
                if not href or href in seen:
                    continue
                seen.add(href)
                row = link.locator("xpath=ancestor::tr[1]")
                row_text = await self._text(row) if await row.count() else await self._text(link)
                cells = row.locator("td") if await row.count() else None
                manufacturer = part = description = ""
                if cells is not None and await cells.count() >= 3:
                    manufacturer = await self._text(cells.nth(0))
                    part = await self._text(cells.nth(1))
                    description = await self._text(cells.nth(3)) if await cells.count() > 3 else ""
                if not part:
                    part = row_text.split()[0] if row_text else query
                page_url = urljoin("https://www.alldatasheet.com/", href)
                pdf_url = page_url if page_url.lower().split("?")[0].endswith(".pdf") else ""
                item = self._candidate(
                    title=part,
                    mpn=part,
                    manufacturer=manufacturer,
                    description=description or row_text[:400],
                    source="alldatasheet.com",
                    page_url=page_url,
                    pdf_url=pdf_url,
                )
                if item:
                    found.append(item)
            return found

        return await self._tracked("alldatasheet.com", url, extract)

    async def search_parts(self, query: str) -> list[dict]:
        datasheets, alldatasheet = await asyncio.gather(
            self.search_datasheets_com(query),
            self.search_alldatasheet(query),
        )
        return datasheets + alldatasheet

    async def collect(self, query: str, smd: bool) -> list[dict]:
        found = []
        if is_smd_code(query, smd):
            rows = await self.search_smd(query)
            found.extend(rows)
            names = []
            for row in rows:
                name = row.get("mpn") or row.get("title")
                if name and name not in names:
                    names.append(name)
            for name in names[:MAX_DEVICE_LOOKUPS]:
                self.engine.log("INFO", f"Looking up datasheet for SMD device {name}")
                found.extend(await self.search_parts(name))
        else:
            found.extend(await self.search_parts(query))
        return self.dedupe(found)

    @staticmethod
    def dedupe(items: list[dict]) -> list[dict]:
        unique = {}
        for item in items:
            key = (
                (item.get("pdf_url") or "").lower(),
                item.get("source"),
                item.get("mpn", "").lower(),
                item.get("manufacturer", "").lower(),
            )
            if not item.get("pdf_url"):
                key = (
                    item.get("page_url", "").lower(),
                    item.get("source"),
                    item.get("mpn", "").lower(),
                    item.get("manufacturer", "").lower(),
                )
            unique[key] = item
        return list(unique.values())

    def rank(
        self,
        items: list[dict],
        query: str,
        manufacturer: str = "",
        package: str = "",
    ) -> list[dict]:
        query_key = code_key(query)
        manufacturer_key = manufacturer.strip().lower()
        package_key = package.strip().lower()

        def matches_filter(item: dict, value: str, field: str) -> bool:
            if not value:
                return True
            haystack = f"{item.get(field, '')} {item.get('description', '')}".lower()
            return value in haystack

        filtered = [
            item
            for item in items
            if matches_filter(item, manufacturer_key, "manufacturer")
            and matches_filter(item, package_key, "package")
        ]
        if manufacturer_key or package_key:
            if filtered:
                items = filtered
            else:
                self.engine.log(
                    "WARN",
                    "Manufacturer or package filter matched nothing; showing all hits.",
                )

        def score(item: dict) -> tuple:
            mpn_key = code_key(item.get("mpn") or item.get("title") or "")
            exact = mpn_key == query_key
            contains = bool(query_key and query_key in mpn_key)
            smd_hit = code_key(item.get("smd_code") or "") == query_key
            manufacturer_hit = bool(
                manufacturer_key
                and manufacturer_key in (item.get("manufacturer") or "").lower()
            )
            package_hit = bool(
                package_key and package_key in (item.get("package") or "").lower()
            )
            return (
                exact or smd_hit,
                manufacturer_hit,
                package_hit,
                bool(item.get("pdf_url")),
                contains,
            )

        ranked = sorted(items, key=score, reverse=True)
        return ranked[:MAX_LISTED]

    def exact_matches(self, items: list[dict], query: str) -> list[dict]:
        query_key = code_key(query)
        exact = [
            item
            for item in items
            if code_key(item.get("mpn") or "") == query_key
            or code_key(item.get("title") or "") == query_key
        ]
        return exact or items

    def narrow(self, items: list[dict], text: str) -> list[dict]:
        words = [word.lower() for word in text.split() if word.strip()]
        if not words:
            return items
        narrowed = []
        for item in items:
            haystack = " ".join(
                [
                    item.get("title", ""),
                    item.get("mpn", ""),
                    item.get("manufacturer", ""),
                    item.get("package", ""),
                    item.get("description", ""),
                    item.get("smd_code", ""),
                ]
            ).lower()
            if all(word in haystack for word in words):
                narrowed.append(item)
        return narrowed

    def print_candidates(self, items: list[dict]):
        print("\nDatasheets found:")
        for index, item in enumerate(items, start=1):
            package = item.get("package") or "-"
            manufacturer = item.get("manufacturer") or "-"
            marking = f" code {item['smd_code']}" if item.get("smd_code") else ""
            print(
                f"  {index}. {item.get('mpn') or item.get('title')}{marking}"
                f" | {manufacturer} | {package} | {item.get('source')}"
            )

    def choose(self, items: list[dict], query: str, pick: int | None) -> dict | None:
        pool = self.exact_matches(items, query)
        if pick is not None:
            if pick < 1 or pick > len(pool):
                raise ValueError(f"Pick {pick} is outside 1..{len(pool)}")
            return pool[pick - 1]
        if len(pool) == 1:
            return pool[0]
        self.print_candidates(pool)
        while True:
            answer = input(
                "Enter a number, or manufacturer/package details to narrow: "
            ).strip()
            if not answer:
                continue
            if answer.isdigit():
                choice = int(answer)
                if 1 <= choice <= len(pool):
                    return pool[choice - 1]
                print(f"Enter a number from 1 to {len(pool)}.")
                continue
            narrowed = self.narrow(pool, answer)
            if not narrowed or len(narrowed) == len(pool):
                print("Those details did not narrow the list. Try a number or different details.")
                continue
            pool = narrowed
            if len(pool) == 1:
                return pool[0]
            self.print_candidates(pool)

    def viewer_links(self, html: str, base_url: str) -> list[str]:
        found = []
        for match in re.findall(r"""href=["']([^"']+)["']""", html, re.I):
            if "datasheet-pdf/view/" not in match and "datasheet-pdf/download/" not in match:
                continue
            url = urljoin(base_url, match)
            if url not in found:
                found.append(url)
        found.sort(key=lambda item: 0 if "/datasheet-pdf/view/" in item else 1)
        return found

    async def _open_for_pdf(self, page, url: str) -> tuple[bytes, str]:
        found = []

        def on_response(response):
            if ".pdf" in response.url.lower():
                found.append(response)

        page.on("response", on_response)
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            candidates = [response] if response is not None else []
            for _ in range(20):
                candidates.extend(item for item in found if item not in candidates)
                for candidate in candidates:
                    try:
                        body = await candidate.body()
                    except Exception:
                        continue
                    content_type = candidate.headers.get("content-type", "")
                    if body.startswith(b"%PDF") or "application/pdf" in content_type.lower():
                        return body, candidate.url
                await asyncio.sleep(0.4)
        finally:
            page.remove_listener("response", on_response)
        return b"", page.url

    async def _pdf_from_page(self, page, url: str) -> tuple[bytes, str]:
        body, final_url = await self._open_for_pdf(page, url)
        if body.startswith(b"%PDF"):
            return body, final_url
        viewers = self.viewer_links(await page.content(), page.url)
        for viewer_url in viewers[:2]:
            body, final_url = await self._open_for_pdf(page, viewer_url)
            if body.startswith(b"%PDF"):
                return body, final_url
        return b"", url

    async def fetch_pdf(self, item: dict) -> bytes | None:
        url = item.get("pdf_url") or item.get("page_url")
        if not url:
            self.engine.log("WARN", "Chosen datasheet has no link.")
            return None
        domain = urlparse(url).netloc.lower().removeprefix("www.") or "datasheet"
        context_dir = self.engine.get_persistent_context_dir(domain)

        async def run(headless: bool):
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
                body, final_url = await self._pdf_from_page(page, url)
                if not body.startswith(b"%PDF"):
                    if await self.engine.is_captcha_or_blocked(page):
                        if headless:
                            return "blocked"
                        if not await self.engine.wait_for_challenge_clear(page, 120):
                            return None
                        body, final_url = await self._pdf_from_page(page, url)
                if not body.startswith(b"%PDF"):
                    self.engine.log("WARN", f"Download was not a PDF: {final_url}")
                    return None
                item["pdf_url"] = final_url
                return body

        try:
            saved = await run(True)
        except Exception as err:
            self.engine.log("ERROR", f"PDF download failed: {err}")
            return None
        if saved == "blocked":
            try:
                saved = await run(False)
            except Exception as err:
                self.engine.log("ERROR", f"Headed PDF download failed: {err}")
                return None
        return saved if isinstance(saved, bytes) else None

    def store_pdf(self, item: dict, body: bytes, directory: Path, overwrite: bool = False) -> str:
        """Write PDF bytes into a datasheet directory."""
        directory.mkdir(parents=True, exist_ok=True)
        name = safe_filename(item.get("mpn") or item.get("title") or "datasheet")
        path = directory / f"{name}.pdf"
        if path.exists() and not overwrite:
            path = directory / f"{name}_{safe_filename(item.get('source', ''))}.pdf"
        path.write_bytes(body)
        self.engine.log("INFO", f"Saved datasheet to {path}")
        return str(path)

    async def download_pdf(self, item: dict) -> str | None:
        """Fetch a datasheet and save it under ./datasheets."""
        body = await self.fetch_pdf(item)
        if not body:
            return None
        return self.store_pdf(item, body, self.output_dir, overwrite=False)

    async def preview_pdf(self, item: dict) -> str | None:
        """Fetch a datasheet into ./datasheets/preview without archiving it."""
        body = await self.fetch_pdf(item)
        if not body:
            return None
        return self.store_pdf(item, body, self.output_dir / "preview", overwrite=True)

    async def search(
        self,
        query: str,
        manufacturer: str = "",
        package: str = "",
        smd: bool = False,
        on_progress=None,
    ) -> dict:
        """Find datasheet candidates. The caller confirms when more than one matches."""
        self._progress = on_progress
        smd_query = is_smd_code(query, smd)
        candidates = self.rank(
            await self.collect(query, smd),
            query,
            manufacturer,
            package,
        )
        pool = self.exact_matches(candidates, query) if candidates else []
        return {
            "query": query,
            "smd": smd_query,
            "needs_confirmation": len(pool) > 1,
            "candidates": candidates,
        }
