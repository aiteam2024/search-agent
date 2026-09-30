import React, { useState, useEffect, useRef } from 'react';
import {
  PriceOffer,
  DatasheetCandidate,
  ComponentKind,
  Project,
  SearchMode,
  SiteProgress,
  WebResult,
} from '../types/circuithub';
import {
  streamPriceSearch,
  streamDatasheetSearch,
  previewDatasheet,
  searchWeb,
  findProductDatasheet,
  extractFilename,
  ApiError,
} from '../services/api';
import { loadRecentSearches, rememberRecentSearch, type RecentSearch } from '../services/storage';
import { useTheme } from '../context/ThemeContext';
import {
  Search,
  FileText,
  Plus,
  Check,
  Clock,
  ExternalLink,
  Eye,
  Layers,
  Cpu,
  AlertCircle,
  X,
} from 'lucide-react';

interface SearchPanelProps {
  activeProject: Project | null;
  onAddPartToBOM: (part: {
    title: string;
    vendor: string;
    unitPriceInr: number;
    link: string;
    package?: string;
    note?: string;
  }) => void;
  onOpenDatasheet: (filename: string, title: string, source: string, candidate?: DatasheetCandidate) => void;
  onOpenAttachment: (title: string, source: string, url: string) => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  activeProject,
  onAddPartToBOM,
  onOpenDatasheet,
  onOpenAttachment,
}) => {
  const { mode } = useTheme();
  const isLight = mode === 'light';

  // Search parameters
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ComponentKind>('normal');
  const [searchMode, setSearchMode] = useState<SearchMode>('links');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [noteFilter, setNoteFilter] = useState('');
  const [pitchFilter, setPitchFilter] = useState('');
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => loadRecentSearches());
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [siteProgress, setSiteProgress] = useState<SiteProgress[]>([]);
  const [siteRank, setSiteRank] = useState<Record<string, number>>({});
  const [webResults, setWebResults] = useState<WebResult[]>([]);
  const [webBlockedUrl, setWebBlockedUrl] = useState<string | null>(null);

  // Results & status
  const [isSearching, setIsSearching] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [priceOffers, setPriceOffers] = useState<PriceOffer[]>([]);
  const [datasheetCandidates, setDatasheetCandidates] = useState<DatasheetCandidate[]>([]);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [sheetNotes, setSheetNotes] = useState<Record<string, string>>({});
  const [sheetBusyLink, setSheetBusyLink] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const searchGenerationRef = useRef(0);
  const timerRef = useRef<any>(null);

  // Timer for elapsed seconds
  useEffect(() => {
    if (isSearching) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSearching]);

  const recordProgress = (event: SiteProgress) => {
    if (typeof event.priority === 'number') {
      setSiteRank((current) => ({ ...current, [event.site]: event.priority as number }));
    }
    setSiteProgress((current) => {
      const next = current.filter((item) => item.site !== event.site);
      return [...next, event];
    });
    if (!event.offers?.length) return;
    setPriceOffers((current) => {
      const merged = [...current];
      for (const offer of event.offers || []) {
        const sameLink = merged.findIndex((item) => item.vendor === offer.vendor && item.link === offer.link);
        if (sameLink >= 0) {
          const previous = merged[sameLink];
          const next = { ...previous, ...offer, saved: Boolean(previous.saved || offer.saved) };
          if (offer.price == null && previous.price != null) {
            next.price = previous.price;
            next.price_raw = previous.price_raw;
            next.currency = previous.currency;
            next.normalized_price_inr = previous.normalized_price_inr;
          }
          if (previous.saved && previous.title) next.title = previous.title;
          merged[sameLink] = next;
          continue;
        }
        merged.push(offer);
      }
      return merged;
    });
  };

  const stopSearch = () => {
    searchGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    setSiteProgress((current) =>
      current.map((item) => (item.status === 'searching' ? { ...item, status: 'stopped' } : item)),
    );
    setIsSearching(false);
  };

  const openPreview = async (candidate: DatasheetCandidate) => {
    const previewed = await previewDatasheet(candidate);
    if (!previewed.saved_path) {
      throw new ApiError('The datasheet preview did not return a file.');
    }
    onOpenDatasheet(extractFilename(previewed.saved_path), candidate.title, candidate.source, previewed);
  };

  const loadWebFallback = async (q: string, signal: AbortSignal) => {
    setWebResults([]);
    setWebBlockedUrl(null);
    recordProgress({ site: 'google.com', status: 'searching' });
    try {
      const web = await searchWeb(q, signal);
      if (signal.aborted) return;
      if (web.blocked) {
        setWebBlockedUrl(web.search_url);
        recordProgress({ site: 'google.com', status: 'error', detail: 'Google asked for a check.' });
        return;
      }
      setWebResults(web.results || []);
      recordProgress({ site: 'google.com', status: 'done', count: web.results?.length || 0 });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      recordProgress({
        site: 'google.com',
        status: 'error',
        detail: err instanceof ApiError ? err.detail : err.message || 'Web search failed.',
      });
    }
  };

  const handleSearch = async (overrideQuery?: string, overrideKind?: ComponentKind) => {
    const q = (overrideQuery ?? query).trim();
    const k = overrideKind ?? kind;
    if (!q) return;

    setRecentSearches(rememberRecentSearch(q, k));
    const generation = ++searchGenerationRef.current;
    setIsSearching(true);
    setErrorMessage(null);
    setPriceOffers([]);
    setDatasheetCandidates([]);
    setSiteProgress([]);
    setSiteRank({});
    setWebResults([]);
    setWebBlockedUrl(null);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      if (searchMode === 'links') {
        const priceRes = await streamPriceSearch(q, recordProgress, signal, pitchFilter);
        if (signal.aborted) return;
        if ((priceRes.offers || []).length === 0) await loadWebFallback(q, signal);
      } else {
        const sheetQuery = [q, pitchFilter.trim()].filter(Boolean).join(' ');
        const sheetRes = await streamDatasheetSearch(
          sheetQuery,
          manufacturerFilter,
          packageFilter,
          k === 'smd',
          recordProgress,
          signal,
        );
        if (signal.aborted) return;
        const candidates = sheetRes.candidates || [];
        setDatasheetCandidates(candidates);
        if (candidates.length === 1) await openPreview(candidates[0]);
        else if (candidates.length === 0) await loadWebFallback(q, signal);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal.aborted) return;
      setErrorMessage(err instanceof ApiError ? err.detail : err.message || 'Search failed');
    } finally {
      if (searchGenerationRef.current === generation) setIsSearching(false);
    }
  };

  const handleQuickChip = (testQuery: string, testKind: ComponentKind) => {
    setQuery(testQuery);
    setKind(testKind);
    handleSearch(testQuery, testKind);
  };

  const handleAddOffer = (offer: PriceOffer) => {
    onAddPartToBOM({
      title: offer.title,
      vendor: offer.vendor,
      unitPriceInr: offer.normalized_price_inr ?? offer.price ?? 0,
      link: offer.link,
      package: packageFilter || undefined,
      note: offer.saved ? undefined : offer.details || undefined,
    });
    setAddedIds((prev) => ({ ...prev, [offer.link]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [offer.link]: false }));
    }, 2000);
  };

  const handleViewCandidate = async (candidate: DatasheetCandidate) => {
    setErrorMessage(null);
    setIsSearching(true);
    try {
      await openPreview(candidate);
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.detail : err.message || 'Datasheet preview failed.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleOfferDatasheet = async (offer: PriceOffer) => {
    setSheetBusyLink(offer.link);
    setErrorMessage(null);
    setSheetNotes((current) => ({ ...current, [offer.link]: '' }));
    try {
      const found = await findProductDatasheet(offer.link);
      if (!found.pdf_url) {
        setSheetNotes((current) => ({
          ...current,
          [offer.link]: 'No datasheet is attached to this product page.',
        }));
        return;
      }
      onOpenAttachment(offer.title, offer.vendor, found.pdf_url);
    } catch (err: any) {
      const detail = err instanceof ApiError ? err.detail : err.message || 'Datasheet preview failed.';
      setSheetNotes((current) => ({ ...current, [offer.link]: detail }));
    } finally {
      setSheetBusyLink(null);
    }
  };

  const filteredOffers = React.useMemo(() => {
    const list = [...priceOffers].sort((a, b) => {
      if (Boolean(a.saved) !== Boolean(b.saved)) return a.saved ? -1 : 1;
      const rankA = siteRank[a.vendor] ?? 999;
      const rankB = siteRank[b.vendor] ?? 999;
      if (rankA !== rankB) return rankA - rankB;
      const priceA = a.normalized_price_inr ?? a.price ?? Number.POSITIVE_INFINITY;
      const priceB = b.normalized_price_inr ?? b.price ?? Number.POSITIVE_INFINITY;
      return priceA - priceB;
    });
    const detailTerms = [manufacturerFilter, packageFilter, pitchFilter, noteFilter]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (showAllOffers || detailTerms.length === 0) return list;
    return list.filter((offer) => {
      const haystack = `${offer.title} ${offer.details || ''}`.toLowerCase();
      return detailTerms.every((term) => haystack.includes(term));
    });
  }, [priceOffers, siteRank, manufacturerFilter, packageFilter, pitchFilter, noteFilter, showAllOffers]);

  const lowestPrice = React.useMemo(() => {
    const prices = filteredOffers
      .map((offer) => offer.normalized_price_inr ?? offer.price)
      .filter((price): price is number => price != null);
    if (prices.length === 0) return null;
    return Math.min(...prices);
  }, [filteredOffers]);

  return (
    <div
      className={`h-full flex flex-col rounded-xl border transition-colors ${
        isLight
          ? 'bg-white border-[#E2E8F0] shadow-sm'
          : 'bg-[#151C2C] border-[#222F43]'
      }`}
    >
      {/* Search Input Bar */}
      <div className={`p-4 border-b ${isLight ? 'border-[#E2E8F0] bg-[#F8FAFC]' : 'border-[#222F43] bg-[#0B0F17]'}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="space-y-2.5"
        >
          {/* Main search box */}
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                kind === 'smd'
                  ? 'SMD marking code (e.g. A7, 1AM, EN)...'
                  : 'Component MPN or value (e.g. LM324, 10k resistor)...'
              }
              className={`w-full rounded-lg border pl-9 pr-20 py-2 text-xs font-mono transition-colors focus:outline-none ${
                isLight
                  ? 'bg-white border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                  : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
              }`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-14 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type={isSearching ? 'button' : 'submit'}
              disabled={!isSearching && !query.trim()}
              onClick={isSearching ? stopSearch : undefined}
              className="absolute right-1.5 rounded-md bg-[#1D4ED8] px-3 py-1 text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-50 transition-colors"
            >
              {isSearching ? 'Stop' : 'Search'}
            </button>
          </div>

          {/* Sub-toggles: Normal vs SMD + Filter Chips */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 text-xs">
            {/* Kind switch */}
            <div
              className={`inline-flex rounded-lg border p-0.5 ${
                isLight ? 'bg-slate-100 border-[#E2E8F0]' : 'bg-[#0F1523] border-[#222F43]'
              }`}
            >
              <button
                type="button"
                onClick={() => setKind('normal')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  kind === 'normal'
                    ? 'bg-[#1D4ED8] text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Cpu className="h-3 w-3" />
                <span>Normal MPN</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('smd')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  kind === 'smd'
                    ? 'bg-[#1D4ED8] text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Layers className="h-3 w-3" />
                <span>SMD Code</span>
              </button>
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              {([
                ['links', 'Links'],
                ['datasheets', 'Datasheet'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSearchMode(value)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    searchMode === value
                      ? isLight
                        ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8] font-bold'
                        : 'border-[#1D4ED8] bg-[#1D4ED8]/20 text-[#1D4ED8] font-bold'
                      : isLight
                      ? 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
                      : 'border-[#222F43] bg-[#151C2C] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <input
              type="text"
              value={manufacturerFilter}
              onChange={(e) => {
                setManufacturerFilter(e.target.value);
                setShowAllOffers(false);
              }}
              placeholder="Manufacturer"
              className={`rounded-md border px-2 py-1 text-[11px] focus:outline-none ${
                isLight
                  ? 'bg-white border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                  : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
              }`}
            />
            <input
              type="text"
              value={packageFilter}
              onChange={(e) => {
                setPackageFilter(e.target.value);
                setShowAllOffers(false);
              }}
              placeholder="Package"
              className={`rounded-md border px-2 py-1 text-[11px] focus:outline-none ${
                isLight
                  ? 'bg-white border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                  : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
              }`}
            />
            <input
              type="text"
              value={pitchFilter}
              onChange={(e) => {
                setPitchFilter(e.target.value);
                setShowAllOffers(false);
              }}
              placeholder="Pitch"
              className={`rounded-md border px-2 py-1 text-[11px] focus:outline-none ${
                isLight
                  ? 'bg-white border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                  : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
              }`}
            />
            <input
              type="text"
              value={noteFilter}
              onChange={(e) => {
                setNoteFilter(e.target.value);
                setShowAllOffers(false);
              }}
              placeholder="Note"
              className={`rounded-md border px-2 py-1 text-[11px] focus:outline-none ${
                isLight
                  ? 'bg-white border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                  : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
              }`}
            />
          </div>

          {recentSearches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px] text-slate-400">
              <span className="font-semibold text-slate-400 mr-0.5">Quick:</span>
              {recentSearches.map((chip) => (
                <button
                  key={`${chip.kind}-${chip.query}`}
                  type="button"
                  onClick={() => handleQuickChip(chip.query, chip.kind)}
                  className={`rounded px-1.5 py-0.5 font-mono transition-colors ${
                    isLight
                      ? 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                      : 'bg-[#1B2438] text-slate-300 hover:bg-[#222F43]'
                  }`}
                >
                  {chip.query}
                </button>
              ))}
            </div>
          )}
        </form>

        {siteProgress.length > 0 && (
          <div className="mt-3 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-500">
            <div className="flex items-center gap-2">
              <Clock className={`h-3.5 w-3.5 shrink-0 ${isSearching ? 'animate-pulse' : ''}`} />
              <span>
                {isSearching ? 'Searching' : 'Searched'}{' '}
                <strong className="font-mono tabular-nums">{elapsedSeconds}s</strong>
              </span>
            </div>
            {siteProgress.map((item) => (
              <div key={item.site} className="flex items-center justify-between gap-2 font-mono">
                <span className="truncate">{item.site}</span>
                <span>
                  {item.status === 'searching'
                    ? 'searching'
                    : item.status === 'error'
                    ? 'error'
                    : item.status === 'stopped'
                    ? 'stopped'
                    : `${item.count ?? 0} found`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Error notification */}
        {errorMessage && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] text-rose-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Results Feed List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Results summary header */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>
            {searchMode === 'datasheets'
              ? `${datasheetCandidates.length} Datasheets`
              : `${filteredOffers.length} Distributor Offers`}
          </span>
          {priceOffers.length > 0 && searchMode === 'links' && lowestPrice != null && (
            <span className="font-mono text-[#059669]">
              Low: ₹{lowestPrice.toFixed(2)}
            </span>
          )}
        </div>

        {!isSearching &&
          priceOffers.length > 0 &&
          filteredOffers.length === 0 &&
          (searchMode === 'links') && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-500 space-y-2">
              <p>No offers match the manufacturer, package, pitch, or note you typed.</p>
              <button
                type="button"
                onClick={() => setShowAllOffers(true)}
                className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white"
              >
                Show all offers
              </button>
            </div>
          )}

        {/* Price Scraper Offers */}
        {searchMode === 'links' &&
          filteredOffers.map((offer, idx) => {
            const offerPrice = offer.normalized_price_inr ?? offer.price;
            const isLowest = !offer.saved && offerPrice != null && offerPrice === lowestPrice;
            const isAdded = Boolean(addedIds[offer.link]);

            return (
              <div
                key={`${offer.link}-${idx}`}
                className={`rounded-lg border p-3 transition-all ${
                  isLight
                    ? isLowest
                      ? 'border-[#059669]/50 bg-white ring-1 ring-[#059669]/20'
                      : 'border-[#E2E8F0] bg-white hover:border-slate-300'
                    : isLowest
                    ? 'border-[#059669]/50 bg-[#151C2C] ring-1 ring-[#059669]/20'
                    : 'border-[#222F43] bg-[#151C2C] hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {offer.vendor}
                      </span>
                      {offer.saved && (
                        <span className="rounded px-1.5 py-0.2 text-[9px] font-bold font-mono uppercase bg-[#1D4ED8]/15 text-[#1D4ED8]">
                          Saved
                        </span>
                      )}
                      {offer.availability === 'out_of_stock' && (
                        <span className="rounded px-1.5 py-0.2 text-[9px] font-bold font-mono uppercase bg-amber-500/15 text-amber-600">
                          Out of stock
                        </span>
                      )}
                      {offer.availability === 'in_stock' && (
                        <span className="rounded px-1.5 py-0.2 text-[9px] font-bold font-mono uppercase bg-[#059669]/15 text-[#059669]">
                          In stock
                        </span>
                      )}
                      {isLowest && (
                        <span className="rounded px-1.5 py-0.2 text-[9px] font-bold font-mono uppercase bg-[#059669]/15 text-[#059669]">
                          Best Price
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold truncate mt-0.5">
                      {offer.title}
                    </h4>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-sm font-bold text-[#059669] tabular-nums">
                      {offerPrice != null ? `₹${offerPrice.toFixed(2)}` : '—'}
                    </span>
                  </div>
                </div>

                {offer.details && !offer.saved && (
                  <p className="mt-1 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {offer.details}
                  </p>
                )}
                {sheetNotes[offer.link] && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                    {sheetNotes[offer.link]}
                  </p>
                )}

                {/* Card Actions */}
                <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-current/5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={sheetBusyLink === offer.link}
                      onClick={() => handleOfferDatasheet(offer)}
                      className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
                        isLight ? 'text-slate-600 hover:text-[#1D4ED8]' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Eye className="h-3 w-3 text-amber-500" />
                      <span>{sheetBusyLink === offer.link ? 'Opening…' : 'Datasheet'}</span>
                    </button>

                    <a
                      href={offer.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
                      title="Open store link"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {activeProject && (
                  <button
                    type="button"
                    onClick={() => handleAddOffer(offer)}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      isAdded
                        ? 'bg-[#059669] text-white'
                        : 'bg-[#1D4ED8] text-white hover:bg-[#2563EB]'
                    }`}
                  >
                    {isAdded ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    <span>{isAdded ? 'Added' : 'Add to BOM'}</span>
                  </button>
                  )}
                </div>
              </div>
            );
          })}

        {/* Datasheet Candidates */}
        {searchMode === 'datasheets' &&
          datasheetCandidates.map((c, idx) => (
            <div
              key={`ds-${c.source}-${idx}`}
              className={`rounded-lg border p-3 transition-all ${
                isLight
                  ? 'border-[#E2E8F0] bg-white hover:border-slate-300'
                  : 'border-[#222F43] bg-[#151C2C] hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="font-semibold text-amber-500">Datasheet</span>
                    <span>·</span>
                    <span>{c.manufacturer || c.source}</span>
                    {c.package && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-[#1D4ED8]">{c.package}</span>
                      </>
                    )}
                  </div>
                  <h4 className="text-xs font-bold truncate mt-0.5">
                    {c.title} {c.mpn && c.mpn !== c.title ? `(${c.mpn})` : ''}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={() => handleViewCandidate(c)}
                  className="flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-semibold text-amber-500 hover:bg-amber-500/25 transition-colors shrink-0"
                >
                  <Eye className="h-3 w-3" />
                  <span>View PDF</span>
                </button>
              </div>

              {c.description && (
                <p className="mt-1 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {c.description}
                </p>
              )}
            </div>
          ))}

        {webBlockedUrl && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-500 space-y-2">
            <p>Google asked for a check, so web results could not be read.</p>
            <a href={webBlockedUrl} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
              Open this search on Google
            </a>
          </div>
        )}

        {webResults.map((result) => (
          <a
            key={result.link}
            href={result.link}
            target="_blank"
            rel="noopener noreferrer"
            className={`block rounded-lg border p-3 transition-all ${
              isLight
                ? 'border-[#E2E8F0] bg-white hover:border-slate-300'
                : 'border-[#222F43] bg-[#151C2C] hover:border-slate-600'
            }`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Web</div>
            <h4 className="text-xs font-bold mt-0.5">{result.title}</h4>
            {result.snippet && (
              <p className="mt-1 text-[11px] text-slate-400 line-clamp-3 leading-relaxed">{result.snippet}</p>
            )}
          </a>
        ))}

        {!isSearching &&
          priceOffers.length === 0 &&
          datasheetCandidates.length === 0 &&
          webResults.length === 0 &&
          !webBlockedUrl && (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <Search className="h-8 w-8 mx-auto opacity-30" />
            <p className="text-xs font-medium">Search for parts or SMD markings</p>
            <p className="text-[11px] opacity-70">
              Type a part name. Recent searches appear under Quick after you search.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
