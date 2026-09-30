"""Response shapes shared by the command-line tools and the future API."""

from pydantic import BaseModel, ConfigDict, Field


class Offer(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    link: str
    vendor: str | None = None
    price_raw: str | None = None
    price: float | None = None
    currency: str | None = None
    normalized_price_inr: float | None = None
    details: str | None = None
    saved: bool = False
    availability: str | None = None


class PriceSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    sites: list[str] | None = None
    origin_url: str | None = None
    pitch: str = ""


class PriceSearchResponse(BaseModel):
    query: str
    origin: Offer | None = None
    offers: list[Offer]


class DatasheetHit(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    mpn: str
    manufacturer: str = ""
    package: str = ""
    description: str = ""
    source: str
    page_url: str = ""
    pdf_url: str = ""
    smd_code: str | None = None
    saved_path: str | None = None


class DatasheetSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    manufacturer: str = ""
    package: str = ""
    smd: bool = False


class DatasheetSearchResponse(BaseModel):
    query: str
    smd: bool
    needs_confirmation: bool
    candidates: list[DatasheetHit]


class DatasheetDownloadRequest(BaseModel):
    title: str
    mpn: str = ""
    manufacturer: str = ""
    package: str = ""
    description: str = ""
    source: str
    page_url: str = ""
    pdf_url: str = ""
    smd_code: str | None = None
    preview_filename: str = ""


class WebResult(BaseModel):
    title: str
    link: str
    snippet: str = ""


class WebSearchRequest(BaseModel):
    query: str = Field(min_length=1)


class WebSearchResponse(BaseModel):
    query: str
    blocked: bool = False
    search_url: str = ""
    results: list[WebResult]


class SiteEntry(BaseModel):
    domain: str
    custom: bool


class SiteListResponse(BaseModel):
    sites: list[SiteEntry]


class SiteOrderRequest(BaseModel):
    order: list[str] = Field(min_length=1)


class LearnSiteRequest(BaseModel):
    search_url: str = Field(min_length=1)
    sample_query: str = "1k resistor"


class ShopConfig(BaseModel):
    search_url: str
    item_card_selector: str
    title_selector: str
    link_selector: str
    price_selector: str
    base_url: str
    price_match: str = "first"


class LearnSiteResponse(BaseModel):
    recognized: bool
    domain: str
    search_url: str = ""
    message: str = ""
    config: ShopConfig | None = None
    samples: list[Offer] = Field(default_factory=list)


class SaveSiteRequest(BaseModel):
    domain: str = Field(min_length=1)
    config: ShopConfig


class ProductDatasheetRequest(BaseModel):
    url: str = Field(min_length=1)


class ProductDatasheetResponse(BaseModel):
    pdf_url: str = ""
    title: str = ""


class SavedLinkRequest(BaseModel):
    title: str = Field(min_length=1)
    link: str = Field(min_length=1)
