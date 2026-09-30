/**
 * CircuitHub Data Types & Schemas
 */

export interface PriceOffer {
  title: string;
  link: string;
  vendor: string;
  price_raw: string | null;
  price: number | null;
  currency: string | null;
  normalized_price_inr: number | null;
  details: string;
  saved?: boolean;
  availability?: 'in_stock' | 'out_of_stock' | null;
}

export interface PriceSearchResponse {
  query: string;
  origin: PriceOffer | null;
  offers: PriceOffer[];
}

export interface DatasheetCandidate {
  title: string;
  mpn: string;
  manufacturer: string;
  package: string;
  description: string;
  source: string;
  page_url: string;
  pdf_url: string;
  smd_code: string | null;
  saved_path?: string | null;
}

export interface WebResult {
  title: string;
  link: string;
  snippet: string;
}

export interface WebSearchResponse {
  query: string;
  blocked: boolean;
  search_url: string;
  results: WebResult[];
}

export interface SiteEntry {
  domain: string;
  custom: boolean;
}

export interface ShopConfig {
  search_url: string;
  item_card_selector: string;
  title_selector: string;
  link_selector: string;
  price_selector: string;
  base_url: string;
  price_match: string;
}

export interface LearnedShop {
  recognized: boolean;
  domain: string;
  search_url: string;
  message: string;
  config: ShopConfig | null;
  samples: Array<{
    title: string;
    link: string;
    vendor?: string | null;
    price_raw?: string | null;
    price?: number | null;
    currency?: string | null;
    normalized_price_inr?: number | null;
    details?: string | null;
  }>;
}

export type SearchMode = 'links' | 'datasheets';

export interface SiteProgress {
  site: string;
  status: 'searching' | 'done' | 'error' | 'stopped';
  count?: number;
  detail?: string;
  priority?: number;
  offers?: PriceOffer[];
}

export interface DatasheetSearchResponse {
  query: string;
  smd: boolean;
  needs_confirmation: boolean;
  candidates: DatasheetCandidate[];
}

export interface BOMItem {
  id: string;
  title: string;
  vendor: string;
  unitPriceInr: number;
  qty: number;
  link: string;
  package?: string;
  note?: string;
  addedAt: string;
}

export interface SavedDatasheet {
  id: string;
  title: string;
  mpn?: string;
  manufacturer?: string;
  package?: string;
  source: string;
  filename: string;
  pageUrl?: string;
  pdfUrl?: string;
  savedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  items: BOMItem[];
  datasheets: SavedDatasheet[];
}

export type SearchIntent = 'purchase' | 'datasheet';
export type ComponentKind = 'normal' | 'smd';
export type ViewMode = 'home' | 'search' | 'project' | 'viewer';
export type ThemeMode = 'dark' | 'light';

export interface ThemePreset {
  id: string;
  name: string;
  mode: ThemeMode;
  bgClass: string;
  cardClass: string;
  borderClass: string;
  accentClass: string;
  accentHex: string;
  previewColor: string;
}

export interface SearchFormState {
  query: string;
  intent: SearchIntent;
  kind: ComponentKind;
  manufacturer: string;
  package: string;
  notes: string;
}
