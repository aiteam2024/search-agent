"""Shared Camoufox browser used by price and datasheet search."""

import asyncio
import random
import re
from pathlib import Path

from camoufox.pkgman import launch_path


def get_actual_executable() -> str:
    return str(Path(launch_path()).resolve())


class CamoufoxAutomationEngine:
    def __init__(self, base_profile_dir: str = "./profiles"):
        self.base_profile_dir = Path(base_profile_dir)
        self.base_profile_dir.mkdir(parents=True, exist_ok=True)

    def get_persistent_context_dir(self, domain: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", domain)
        return self.base_profile_dir / safe

    def log(self, level: str, message: str):
        print(f"[{level}] {message}")

    async def human_delay(self, min_seconds: float = 0.5, max_seconds: float = 1.5):
        await asyncio.sleep(random.uniform(min_seconds, max_seconds))

    async def human_mouse_move(self, page):
        x, y = random.randint(80, 240), random.randint(80, 240)
        for _ in range(random.randint(2, 4)):
            x, y = random.randint(180, 1100), random.randint(120, 760)
            await page.mouse.move(x, y, steps=random.randint(8, 20))
            await self.human_delay(0.05, 0.2)

    async def human_scroll(self, page):
        for _ in range(random.randint(2, 4)):
            await page.mouse.wheel(0, random.randint(300, 700))
            await self.human_delay(0.25, 0.7)

    async def configure_stealth_context(self, context):
        try:
            await context.add_init_script(
                """
                Object.defineProperty(window.navigator, 'webdriver', { get: () => false });
                Object.defineProperty(window, 'navigator', {
                    value: Object.create(window.navigator),
                    configurable: true,
                });
                Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });
                Object.defineProperty(window.navigator, 'languages', { value: ['en-US', 'en'], configurable: true });
                """
            )
            await context.set_extra_http_headers(
                {
                    "Accept-Language": "en-US,en;q=0.9",
                    "Upgrade-Insecure-Requests": "1",
                }
            )
        except Exception as err:
            self.log("WARN", f"Stealth profile setup warning: {err}")

    async def is_captcha_or_blocked(self, page) -> bool:
        try:
            title = await page.title()
            blocked_titles = (
                "Just a moment...",
                "Attention Required!",
                "Security Check",
                "Human Verification",
                "Access Denied",
            )
            if any(value.lower() in title.lower() for value in blocked_titles):
                return True

            challenge = page.locator(
                "#challenge-stage, #turnstile-wrapper, "
                "iframe[src*='challenges.cloudflare.com']"
            )
            if await challenge.count() and await challenge.first.is_visible():
                return True

            captcha = page.locator(
                "iframe[src*='recaptcha/api2/bframe'], iframe[src*='hcaptcha']"
            )
            return await captcha.count() > 0 and await captcha.first.is_visible()
        except Exception:
            return False

    async def wait_for_challenge_clear(self, page, timeout_seconds: int = 120) -> bool:
        self.log(
            "INFO",
            "Waiting for the human to complete the browser challenge "
            f"(up to {timeout_seconds}s)...",
        )
        deadline = asyncio.get_running_loop().time() + timeout_seconds
        while asyncio.get_running_loop().time() < deadline:
            if not await self.is_captcha_or_blocked(page):
                await asyncio.sleep(0.5)
                self.log("INFO", "Browser challenge cleared; continuing search.")
                return True
            await asyncio.sleep(1)
        self.log("WARN", "Browser challenge was not cleared before timeout.")
        return False
