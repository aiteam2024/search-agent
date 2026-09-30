/**
 * CircuitHub API Client
 * Connects to http://localhost:8000 (or custom configured API base URL)
 */

import {
  PriceSearchResponse,
  DatasheetSearchResponse,
  DatasheetCandidate,
  WebSearchResponse,
  SiteProgress,
  SiteEntry,
  ShopConfig,
  LearnedShop,
} from '../types/circuithub';

export const DEFAULT_API_BASE = 'http://localhost:8000';

/** The API running on this same computer. */
export function defaultApiBaseUrl(): string {
  return DEFAULT_API_BASE;
}

export function getApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem('circuithub_api_base');
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore
  }
  return defaultApiBaseUrl();
}

export function setApiBaseUrl(url: string): void {
  try {
    localStorage.setItem('circuithub_api_base', url.trim());
  } catch {
    // ignore
  }
}

/**
 * Extracts a clean filename from a saved_path returned by the backend.
 * Handles both Windows "datasheets\\LM324.pdf" and Unix "datasheets/LM324.pdf"
 */
export function extractFilename(savedPath: string): string {
  if (!savedPath) return '';
  const normalized = savedPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1];
}

/**
 * Resolves full URL to view a PDF in an iframe
 */
export function getPdfFileUrl(filename: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, '');
  const cleanName = filename.replace(/^[/\\]+/, '');
  return `${base}/api/datasheets/file/${cleanName}`;
}

/**
 * Resolves a preview PDF that has not been saved into a project.
 */
export function getPreviewFileUrl(filename: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, '');
  const cleanName = filename.replace(/^[/\\]+/, '');
  return `${base}/api/datasheets/preview/${cleanName}`;
}

export class ApiError extends Error {
  detail: string;
  status?: number;

  constructor(message: string, detail?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.detail = detail || message;
    this.status = status;
  }
}

/**
 * Search component prices from real vendor scrapers
 * Searches open real vendor pages and often take 1-2 minutes.
 */
export async function searchPrices(
  query: string,
  sites: string[] | null = null,
  originUrl: string | null = null,
  signal?: AbortSignal
): Promise<PriceSearchResponse> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const endpoint = `${baseUrl}/api/prices/search`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: query.trim(),
        sites: sites && sites.length > 0 ? sites : null,
        origin_url: originUrl,
      }),
      signal,
    });

    if (!res.ok) {
      let detailMsg = `HTTP Error ${res.status}: ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson && errorJson.detail) {
          detailMsg = errorJson.detail;
        }
      } catch {
        // use fallback message
      }
      throw new ApiError(detailMsg, detailMsg, res.status);
    }

    const data: PriceSearchResponse = await res.json();
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof ApiError) {
      throw err;
    }
    // Network failure (e.g. backend server not started or mixed-content)
    const errorDetails =
      `Failed to connect to CircuitHub backend at ${baseUrl}. Ensure the Python server is running (e.g. uvicorn api.main:app --port 8000).`;
    throw new ApiError(errorDetails, errorDetails);
  }
}

/**
 * Search datasheets across distributor sources
 */
export async function searchDatasheets(
  query: string,
  manufacturer?: string | null,
  packageType?: string | null,
  smd: boolean = false,
  signal?: AbortSignal
): Promise<DatasheetSearchResponse> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const endpoint = `${baseUrl}/api/datasheets/search`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: query.trim(),
        manufacturer: manufacturer?.trim() || '',
        package: packageType?.trim() || '',
        smd: Boolean(smd),
      }),
      signal,
    });

    if (!res.ok) {
      let detailMsg = `HTTP Error ${res.status}: ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson && errorJson.detail) {
          detailMsg = errorJson.detail;
        }
      } catch {
        // fallback
      }
      throw new ApiError(detailMsg, detailMsg, res.status);
    }

    const data: DatasheetSearchResponse = await res.json();
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof ApiError) {
      throw err;
    }
    const errorDetails =
      `Failed to connect to CircuitHub backend at ${baseUrl}. Ensure the Python server is running (e.g. uvicorn api.main:app --port 8000).`;
    throw new ApiError(errorDetails, errorDetails);
  }
}

/**
 * Download selected candidate datasheet onto server
 */
export async function downloadDatasheet(
  candidate: DatasheetCandidate,
  signal?: AbortSignal
): Promise<DatasheetCandidate> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const endpoint = `${baseUrl}/api/datasheets/download`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title: candidate.title,
        mpn: candidate.mpn || '',
        manufacturer: candidate.manufacturer || '',
        package: candidate.package || '',
        description: candidate.description || '',
        source: candidate.source,
        page_url: candidate.page_url || '',
        pdf_url: candidate.pdf_url || '',
        smd_code: candidate.smd_code,
        preview_filename: candidate.saved_path ? extractFilename(candidate.saved_path) : '',
      }),
      signal,
    });

    if (!res.ok) {
      let detailMsg = `HTTP Error ${res.status}: ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson && errorJson.detail) {
          detailMsg = errorJson.detail;
        }
      } catch {
        // fallback
      }
      throw new ApiError(detailMsg, detailMsg, res.status);
    }

    const data: DatasheetCandidate = await res.json();
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof ApiError) {
      throw err;
    }
    const errorDetails =
      `Failed to download datasheet from ${baseUrl}: ${err.message || 'Unknown network error'}`;
    throw new ApiError(errorDetails, errorDetails);
  }
}

/**
 * Test connectivity to the backend
 */
export async function testBackendConnection(): Promise<{ ok: boolean; message: string }> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    // Try pinging the root or an endpoint
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { ok: false, message: `Backend at ${baseUrl} returned HTTP ${res.status}.` };
    }
    return { ok: true, message: `Connected to ${baseUrl}` };
  } catch (err: any) {
    return {
      ok: false,
      message: `Could not reach ${baseUrl}. Please check that the server is running on port 8000 with CORS configured.`,
    };
  }
}

async function readEventStream<T>(
  endpoint: string,
  body: unknown,
  signal: AbortSignal | undefined,
  onProgress: (event: SiteProgress) => void,
): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new ApiError(`HTTP Error ${res.status}: ${res.statusText}`, undefined, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: T | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((item) => item.startsWith('data: '));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'final') finalResult = event.result as T;
      else if (event.type === 'error') throw new ApiError(event.detail || 'Search failed');
      else onProgress(event as SiteProgress);
    }
  }
  if (!finalResult) throw new ApiError('Search ended without a result.');
  return finalResult;
}

/**
 * Stream vendor price search and report each site as it runs.
 */
export async function streamPriceSearch(
  query: string,
  onProgress: (event: SiteProgress) => void,
  signal?: AbortSignal,
  pitch = '',
): Promise<PriceSearchResponse> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  try {
    return await readEventStream<PriceSearchResponse>(
      `${baseUrl}/api/prices/search/stream`,
      { query: query.trim(), sites: null, origin_url: null, pitch: pitch.trim() },
      signal,
      onProgress,
    );
  } catch (err: any) {
    if (err.name === 'AbortError' || err instanceof ApiError) throw err;
    throw new ApiError(`Failed to connect to CircuitHub backend at ${baseUrl}.`);
  }
}

/**
 * Stream datasheet search and report each source as it runs.
 */
export async function streamDatasheetSearch(
  query: string,
  manufacturer: string,
  packageType: string,
  smd: boolean,
  onProgress: (event: SiteProgress) => void,
  signal?: AbortSignal,
): Promise<DatasheetSearchResponse> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  try {
    return await readEventStream<DatasheetSearchResponse>(
      `${baseUrl}/api/datasheets/search/stream`,
      {
        query: query.trim(),
        manufacturer: manufacturer?.trim() || '',
        package: packageType?.trim() || '',
        smd: Boolean(smd),
      },
      signal,
      onProgress,
    );
  } catch (err: any) {
    if (err.name === 'AbortError' || err instanceof ApiError) throw err;
    throw new ApiError(`Failed to connect to CircuitHub backend at ${baseUrl}.`);
  }
}

/**
 * Fetch a datasheet into the preview folder so the app can show it before saving.
 */
export async function previewDatasheet(
  candidate: DatasheetCandidate,
  signal?: AbortSignal,
): Promise<DatasheetCandidate> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/api/datasheets/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      title: candidate.title,
      mpn: candidate.mpn || '',
      manufacturer: candidate.manufacturer || '',
      package: candidate.package || '',
      description: candidate.description || '',
      source: candidate.source,
      page_url: candidate.page_url || '',
      pdf_url: candidate.pdf_url || '',
      smd_code: candidate.smd_code,
    }),
    signal,
  });
  return readJson<DatasheetCandidate>(res);
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP Error ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // keep the status text
    }
    throw new ApiError(detail, detail, res.status);
  }
  return res.json();
}

/** Return shops in the saved priority order. */
export async function listPriceSites(): Promise<SiteEntry[]> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const data = await readJson<{ sites: SiteEntry[] }>(await fetch(`${baseUrl}/api/prices/sites`));
  return data.sites;
}

/** Save the priority order. Higher entries appear first in search results. */
export async function saveSiteOrder(order: string[]): Promise<SiteEntry[]> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const data = await readJson<{ sites: SiteEntry[] }>(
    await fetch(`${baseUrl}/api/prices/sites/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ order }),
    }),
  );
  return data.sites;
}

/** Open one search URL, clear a captcha if needed, and learn product cards. */
export async function learnPriceSite(searchUrl: string, sampleQuery: string): Promise<LearnedShop> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  return readJson<LearnedShop>(
    await fetch(`${baseUrl}/api/prices/sites/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        search_url: searchUrl.trim(),
        sample_query: sampleQuery.trim() || '1k resistor',
      }),
    }),
  );
}

/** Save a learned shop after the user confirms the sample offers. */
export async function savePriceSite(domain: string, config: ShopConfig): Promise<SiteEntry[]> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const data = await readJson<{ sites: SiteEntry[] }>(
    await fetch(`${baseUrl}/api/prices/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ domain, config }),
    }),
  );
  return data.sites;
}

/**
 * Open the product page and return the datasheet or PDF attached to that page.
 */
export async function findProductDatasheet(url: string): Promise<{ pdf_url: string; title: string }> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  return readJson(
    await fetch(`${baseUrl}/api/prices/product-datasheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url }),
    }),
  );
}

/** Remember a store link so a later search can show it first. */
export async function rememberSavedLink(title: string, link: string): Promise<void> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  await readJson(
    await fetch(`${baseUrl}/api/prices/saved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ title, link }),
    }),
  );
}

/** Remove a shop the user added. Built-in shops stay. */
export async function deletePriceSite(domain: string): Promise<SiteEntry[]> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const data = await readJson<{ sites: SiteEntry[] }>(
    await fetch(`${baseUrl}/api/prices/sites/${encodeURIComponent(domain)}`, { method: 'DELETE' }),
  );
  return data.sites;
}
export async function searchWeb(query: string, signal?: AbortSignal): Promise<WebSearchResponse> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/api/web/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: query.trim() }),
    signal,
  });
  if (!res.ok) {
    throw new ApiError(`HTTP Error ${res.status}: ${res.statusText}`, undefined, res.status);
  }
  return res.json();
}
