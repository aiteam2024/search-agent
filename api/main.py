"""HTTP API for the future frontend. Searches call the same classes as the CLI."""

import asyncio
import json
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from finder.datasheet import DatasheetSearchAgent, safe_filename
from finder.google import GoogleSearch
from finder.price import PriceSearchAgent
from finder.saved_links import add_saved_link
from finder.sites import delete_custom, list_sites, save_custom, save_order
from finder.schemas import (
    DatasheetDownloadRequest,
    DatasheetHit,
    DatasheetSearchRequest,
    DatasheetSearchResponse,
    PriceSearchRequest,
    PriceSearchResponse,
    SaveSiteRequest,
    SiteListResponse,
    SiteOrderRequest,
    LearnSiteRequest,
    LearnSiteResponse,
    ProductDatasheetRequest,
    ProductDatasheetResponse,
    SavedLinkRequest,
    WebSearchRequest,
    WebSearchResponse,
)

app = FastAPI(title="Component Finder", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASHEET_DIR = Path("./datasheets").resolve()
PREVIEW_DIR = (DATASHEET_DIR / "preview").resolve()


def _pdf_name(filename: str) -> str:
    if Path(filename).name != filename or not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF filename required.")
    return filename


async def _sse(work):
    queue: asyncio.Queue = asyncio.Queue()

    async def on_progress(event: dict) -> None:
        await queue.put(event)

    async def runner() -> None:
        try:
            result = await work(on_progress)
            await queue.put({"type": "final", "result": result})
        except asyncio.CancelledError:
            raise
        except Exception as err:
            await queue.put({"type": "error", "detail": str(err)})
        await queue.put(None)

    task = asyncio.create_task(runner())

    async def generate():
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/prices/sites", response_model=SiteListResponse)
def price_sites():
    builtin = list(PriceSearchAgent().builtin_providers)
    return {"sites": list_sites(builtin)}


@app.put("/api/prices/sites/order", response_model=SiteListResponse)
def update_site_order(body: SiteOrderRequest):
    builtin = list(PriceSearchAgent().builtin_providers)
    return {"sites": save_order(body.order, builtin)}


@app.post("/api/prices/sites/learn", response_model=LearnSiteResponse)
async def learn_site(body: LearnSiteRequest):
    try:
        result = await PriceSearchAgent().learn_shop(body.search_url, body.sample_query)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return LearnSiteResponse.model_validate(result)


@app.post("/api/prices/sites", response_model=SiteListResponse)
def add_site(body: SaveSiteRequest):
    builtin = list(PriceSearchAgent().builtin_providers)
    try:
        sites = save_custom(body.domain, body.config.model_dump(), builtin)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"sites": sites}


@app.delete("/api/prices/sites/{domain}", response_model=SiteListResponse)
def remove_site(domain: str):
    builtin = list(PriceSearchAgent().builtin_providers)
    try:
        sites = delete_custom(domain, builtin)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"sites": sites}


@app.post("/api/prices/search", response_model=PriceSearchResponse)
async def search_prices(body: PriceSearchRequest):
    agent = PriceSearchAgent()
    try:
        result = await agent.search(
            body.query, sites=body.sites, origin_url=body.origin_url, pitch=body.pitch
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return PriceSearchResponse.model_validate(result)


@app.post("/api/prices/search/stream")
async def stream_prices(body: PriceSearchRequest):
    agent = PriceSearchAgent()

    async def work(on_progress):
        result = await agent.search(
            body.query,
            sites=body.sites,
            origin_url=body.origin_url,
            on_progress=on_progress,
            pitch=body.pitch,
        )
        return PriceSearchResponse.model_validate(result).model_dump()

    return await _sse(work)


@app.post("/api/prices/product-datasheet", response_model=ProductDatasheetResponse)
async def product_datasheet(body: ProductDatasheetRequest):
    """Open one product page and return the datasheet attachment on that page."""
    found = await PriceSearchAgent().find_product_datasheet(body.url)
    if not found:
        raise HTTPException(status_code=404, detail="This product page has no datasheet attachment.")
    return ProductDatasheetResponse.model_validate(found)


@app.post("/api/prices/saved")
async def remember_saved_link(body: SavedLinkRequest):
    """Store a product link the user added to a project."""
    add_saved_link(body.title, body.link)
    return {"ok": True}


@app.post("/api/datasheets/search", response_model=DatasheetSearchResponse)
async def search_datasheets(body: DatasheetSearchRequest):
    agent = DatasheetSearchAgent()
    result = await agent.search(body.query, body.manufacturer, body.package, body.smd)
    return DatasheetSearchResponse.model_validate(result)


@app.post("/api/datasheets/search/stream")
async def stream_datasheets(body: DatasheetSearchRequest):
    agent = DatasheetSearchAgent()

    async def work(on_progress):
        result = await agent.search(
            body.query,
            body.manufacturer,
            body.package,
            body.smd,
            on_progress=on_progress,
        )
        return DatasheetSearchResponse.model_validate(result).model_dump()

    return await _sse(work)


@app.post("/api/web/search", response_model=WebSearchResponse)
async def search_web(body: WebSearchRequest):
    result = await GoogleSearch().search(body.query)
    return WebSearchResponse.model_validate(result)


def _copy_preview(preview_filename: str, item: dict) -> str | None:
    name = _pdf_name(preview_filename)
    source = (PREVIEW_DIR / name).resolve()
    if source.parent != PREVIEW_DIR or not source.is_file():
        return None
    DATASHEET_DIR.mkdir(parents=True, exist_ok=True)
    target = DATASHEET_DIR / name
    if target.exists():
        stem = safe_filename(item.get("mpn") or item.get("title") or "datasheet")
        source_name = safe_filename(item.get("source") or "copy")
        target = DATASHEET_DIR / f"{stem}_{source_name}.pdf"
    shutil.copyfile(source, target)
    return str(target)


@app.post("/api/datasheets/preview", response_model=DatasheetHit)
async def preview_datasheet(body: DatasheetDownloadRequest):
    agent = DatasheetSearchAgent()
    item = body.model_dump()
    saved_path = await agent.preview_pdf(item)
    if not saved_path:
        raise HTTPException(status_code=404, detail="Datasheet PDF could not be previewed.")
    item["saved_path"] = saved_path
    return DatasheetHit.model_validate(item)


@app.post("/api/datasheets/download", response_model=DatasheetHit)
async def download_datasheet(body: DatasheetDownloadRequest):
    agent = DatasheetSearchAgent()
    item = body.model_dump()
    saved_path = None
    if body.preview_filename:
        saved_path = _copy_preview(body.preview_filename, item)
    if not saved_path:
        saved_path = await agent.download_pdf(item)
    if not saved_path:
        raise HTTPException(status_code=404, detail="Datasheet PDF could not be saved.")
    item["saved_path"] = saved_path
    return DatasheetHit.model_validate(item)


@app.get("/api/datasheets/preview/{filename}")
def preview_file(filename: str):
    name = _pdf_name(filename)
    path = (PREVIEW_DIR / name).resolve()
    if path.parent != PREVIEW_DIR or not path.is_file():
        raise HTTPException(status_code=404, detail="Preview file was not found.")
    return FileResponse(path, media_type="application/pdf", filename=name)


@app.get("/api/datasheets/file/{filename}")
def datasheet_file(filename: str):
    name = _pdf_name(filename)
    path = (DATASHEET_DIR / name).resolve()
    if path.parent != DATASHEET_DIR or not path.is_file():
        raise HTTPException(status_code=404, detail="Datasheet file was not found.")
    return FileResponse(path, media_type="application/pdf", filename=name)
