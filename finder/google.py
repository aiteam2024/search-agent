"""Google web results used when every vendor or datasheet site is empty."""

from urllib.parse import quote_plus

from camoufox.async_api import AsyncCamoufox

from finder.browser import CamoufoxAutomationEngine, get_actual_executable


class GoogleSearch:
    """Open a Google results page and return organic title, link, and snippet rows."""

    def __init__(self, engine: CamoufoxAutomationEngine | None = None):
        self.engine = engine or CamoufoxAutomationEngine()
        self.executable_path = get_actual_executable()

    async def search(self, query: str) -> dict:
        """Search Google. ``blocked`` is true when a challenge stops the page."""
        search_url = f"https://www.google.com/search?q={quote_plus(query)}&hl=en"
        context_dir = self.engine.get_persistent_context_dir("google.com")
        blocked = False
        results: list[dict] = []

        async def run(headless: bool) -> str | list[dict]:
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
                response = await page.goto(search_url, wait_until="domcontentloaded", timeout=45000)
                await self.engine.human_delay(1.0, 1.8)
                challenged = (
                    response is not None and response.status in {403, 429, 503}
                ) or await self.engine.is_captcha_or_blocked(page)
                if challenged:
                    if headless:
                        return "blocked"
                    if not await self.engine.wait_for_challenge_clear(page, 120):
                        return "blocked"
                await self.engine.human_mouse_move(page)
                return await self._extract(page)

        try:
            outcome = await run(True)
        except Exception as err:
            self.engine.log("ERROR", f"Google search failed: {err}")
            outcome = []
        if outcome == "blocked":
            try:
                outcome = await run(False)
            except Exception as err:
                self.engine.log("ERROR", f"Headed Google search failed: {err}")
                outcome = "blocked"
        if outcome == "blocked":
            blocked = True
            results = []
        elif isinstance(outcome, list):
            results = outcome
        return {
            "query": query,
            "blocked": blocked,
            "search_url": search_url,
            "results": results,
        }

    async def _extract(self, page) -> list[dict]:
        cards = page.locator("div#search div.g")
        count = await cards.count()
        results = []
        for index in range(min(count, 12)):
            card = cards.nth(index)
            title_el = card.locator("h3").first
            link_el = card.locator("a[href^='http']").first
            if not await title_el.count() or not await link_el.count():
                continue
            title = (await title_el.inner_text()).strip()
            link = await link_el.get_attribute("href") or ""
            if not title or not link or "google." in link:
                continue
            snippet = ""
            snippet_el = card.locator("div.VwiC3b, span.aCOpRe, div[data-sncf]").first
            if await snippet_el.count():
                snippet = " ".join((await snippet_el.inner_text()).split())[:400]
            results.append({"title": title, "link": link, "snippet": snippet})
            if len(results) >= 8:
                break
        self.engine.log("INFO", f"Found {len(results)} Google results")
        return results
