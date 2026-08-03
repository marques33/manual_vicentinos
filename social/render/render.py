import asyncio
import pathlib
import shutil
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent
HTML = ROOT / "all-slides.html"
OUT = ROOT / "output"
LAUNCH_DIR = ROOT.parent / "instagram-launch"


async def main():
    OUT.mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(
            viewport={"width": 1180, "height": 1400},
            device_scale_factor=2,
        )
        page = await ctx.new_page()
        await page.goto(HTML.as_uri())
        await page.wait_for_load_state("networkidle")
        await page.evaluate("document.fonts.ready")
        await page.wait_for_timeout(800)

        slides = await page.locator(".slide").all()
        print(f"Encontrados {len(slides)} slides.")

        for slide in slides:
            slide_id = await slide.get_attribute("id")
            post_id, idx = slide_id.split("_")
            target_dir = LAUNCH_DIR / post_id / "slides-png"
            target_dir.mkdir(parents=True, exist_ok=True)
            out_path = target_dir / f"{idx}.png"
            await slide.screenshot(path=str(out_path), omit_background=False)
            print(f"  -> {out_path.relative_to(LAUNCH_DIR.parent)}")

        await browser.close()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
