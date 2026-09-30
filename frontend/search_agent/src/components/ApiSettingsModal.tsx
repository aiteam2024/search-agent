import React, { useEffect, useState } from 'react';
import {
  defaultApiBaseUrl,
  getApiBaseUrl,
  setApiBaseUrl,
  testBackendConnection,
  listPriceSites,
  saveSiteOrder,
  learnPriceSite,
  savePriceSite,
  deletePriceSite,
  ApiError,
} from '../services/api';
import type { LearnedShop, SiteEntry } from '../types/circuithub';
import { useTheme } from '../context/ThemeContext';
import { X, Server, CheckCircle2, AlertCircle, RefreshCw, Terminal, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChanged,
}) => {
  const { mode } = useTheme();
  const isLight = mode === 'light';

  const [url, setUrl] = useState(getApiBaseUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sites, setSites] = useState<SiteEntry[]>([]);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [searchUrl, setSearchUrl] = useState('');
  const [sampleQuery, setSampleQuery] = useState('1k resistor');
  const [learning, setLearning] = useState(false);
  const [learned, setLearned] = useState<LearnedShop | null>(null);
  const [savingSite, setSavingSite] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    listPriceSites()
      .then(setSites)
      .catch((err) => setSiteError(err instanceof ApiError ? err.detail : 'Could not load sites.'));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setApiBaseUrl(url);
    onSettingsChanged();
    onClose();
  };

  const moveSite = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sites.length) return;
    const next = [...sites];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    setSites(next);
    setSiteError(null);
    try {
      setSites(await saveSiteOrder(next.map((site) => site.domain)));
    } catch (err) {
      setSiteError(err instanceof ApiError ? err.detail : 'Could not save the site order.');
    }
  };

  const handleLearn = async () => {
    setLearning(true);
    setLearned(null);
    setSiteError(null);
    try {
      setLearned(await learnPriceSite(searchUrl, sampleQuery));
    } catch (err) {
      setSiteError(err instanceof ApiError ? err.detail : 'Could not open that search page.');
    } finally {
      setLearning(false);
    }
  };

  const handleConfirmSite = async () => {
    if (!learned?.config) return;
    setSavingSite(true);
    setSiteError(null);
    try {
      setSites(await savePriceSite(learned.domain, learned.config));
      setLearned(null);
      setSearchUrl('');
    } catch (err) {
      setSiteError(err instanceof ApiError ? err.detail : 'Could not save that shop.');
    } finally {
      setSavingSite(false);
    }
  };

  const handleRemoveSite = async (domain: string) => {
    setSiteError(null);
    try {
      setSites(await deletePriceSite(domain));
    } catch (err) {
      setSiteError(err instanceof ApiError ? err.detail : 'Could not remove that shop.');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setApiBaseUrl(url);
    const res = await testBackendConnection();
    setTestResult(res);
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border p-6 shadow-2xl transition-colors ${
          isLight
            ? 'bg-white border-[#ded7c7] text-slate-800'
            : 'bg-[#0e1834] border-slate-800 text-white'
        }`}
      >
        <div className={`flex items-center justify-between border-b pb-4 ${isLight ? 'border-[#ded7c7]' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#981228]/10 border border-[#981228]/20 text-[#981228]">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Backend API Settings
              </h2>
              <p className="text-xs text-slate-400">Configure connection to your Python Camoufox crawler</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-xs">
          {/* Base URL input */}
          <div>
            <label className="mb-1.5 block font-semibold text-slate-400 uppercase tracking-wider">
              API Base URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder="http://localhost:8000"
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-mono focus:outline-none transition-colors ${
                  isLight
                    ? 'border-[#ded7c7] bg-[#f1ece0] text-slate-900 placeholder-slate-400 focus:border-[#981228]'
                    : 'border-slate-800 bg-[#091226] text-white placeholder-slate-600 focus:border-red-400'
                }`}
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 font-medium transition-colors disabled:opacity-50 ${
                  isLight
                    ? 'border-[#ded7c7] bg-white text-slate-700 hover:bg-slate-100'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {testing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span>Test Ping</span>
                )}
              </button>
            </div>
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                onClick={() => setUrl(defaultApiBaseUrl())}
                className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
              >
                Reset to {defaultApiBaseUrl()}
              </button>
              <span className="text-slate-400">·</span>
              <button
                type="button"
                onClick={() => setUrl('http://127.0.0.1:8000')}
                className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
              >
                Use 127.0.0.1:8000
              </button>
            </div>
          </div>

          {/* Test connection output */}
          {testResult && (
            <div
              className={`flex items-start gap-2.5 rounded-lg p-3 ${
                testResult.ok
                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                  : 'border border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              )}
              <div className="flex-1">
                <p className="font-semibold">{testResult.ok ? 'Connection Successful' : 'Server Not Reachable'}</p>
                <p className="mt-0.5 text-[11px] opacity-90">{testResult.message}</p>
              </div>
            </div>
          )}

          <div className={`rounded-lg border p-3 ${isLight ? 'border-[#ded7c7]' : 'border-slate-800'}`}>
            <p className="font-semibold">Site priority</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Higher sites appear first in link results, even when another shop is cheaper.
            </p>
            <div className="mt-2 space-y-1">
              {sites.map((site, index) => (
                <div key={site.domain} className="flex items-center justify-between gap-2">
                  <span className="font-mono truncate">
                    {index + 1}. {site.domain}
                    {site.custom ? ' · custom' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => moveSite(index, -1)} className="p-1 text-slate-400" title="Move up">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => moveSite(index, 1)} className="p-1 text-slate-400" title="Move down">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {site.custom && (
                      <button type="button" onClick={() => handleRemoveSite(site.domain)} className="p-1 text-rose-400" title="Remove shop">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-semibold">Add a shop</p>
            <p className="text-[11px] text-slate-400">
              Paste a results URL that already contains the sample part. If the shop shows a check, complete it in the browser window. The wait is 120 seconds.
            </p>
            <input
              type="url"
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="https://shop.example/search?q=1k+resistor"
              className={`w-full rounded-lg border px-3 py-2 font-mono ${
                isLight ? 'border-[#ded7c7] bg-[#f1ece0]' : 'border-slate-800 bg-[#091226]'
              }`}
            />
            <input
              type="text"
              value={sampleQuery}
              onChange={(e) => setSampleQuery(e.target.value)}
              placeholder="1k resistor"
              className={`w-full rounded-lg border px-3 py-2 ${
                isLight ? 'border-[#ded7c7] bg-[#f1ece0]' : 'border-slate-800 bg-[#091226]'
              }`}
            />
            <button
              type="button"
              disabled={learning || !searchUrl.trim()}
              onClick={handleLearn}
              className="rounded-lg bg-[#1D4ED8] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {learning ? 'Opening the shop…' : 'Check this page'}
            </button>
            {learning && (
              <p className="text-[11px] text-amber-500">
                Complete the check in the browser window if one appears.
              </p>
            )}
            {learned && (
              <div className="rounded-lg border border-slate-700 p-2 space-y-2">
                <p className={learned.recognized ? 'text-emerald-500' : 'text-amber-500'}>{learned.message}</p>
                {learned.samples.map((sample) => (
                  <p key={sample.link} className="text-[11px]">
                    {sample.title}
                    {sample.price != null ? ` · ₹${sample.price}` : ''}
                  </p>
                ))}
                {learned.recognized && learned.config && (
                  <button
                    type="button"
                    disabled={savingSite}
                    onClick={handleConfirmSite}
                    className="rounded-lg bg-[#059669] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Save this shop
                  </button>
                )}
              </div>
            )}
            {siteError && <p className="text-[11px] text-rose-500">{siteError}</p>}
          </div>

          {/* Terminal Hint */}
          <div
            className={`rounded-lg border p-3 transition-colors ${
              isLight ? 'border-[#ded7c7] bg-white' : 'border-slate-800 bg-[#091226]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Terminal className="h-3 w-3" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Terminal command</span>
            </div>
            <code
              className={`block rounded px-2 py-1 font-mono text-[11px] select-all ${
                isLight ? 'bg-slate-100 text-slate-800' : 'bg-black/40 text-emerald-400'
              }`}
            >
              uvicorn api.main:app --port 8000 --reload
            </code>
          </div>
        </div>

        <div className={`mt-6 flex justify-end gap-2.5 border-t pt-4 ${isLight ? 'border-[#ded7c7]' : 'border-slate-800'}`}>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
              isLight
                ? 'border-[#ded7c7] bg-white text-slate-700 hover:bg-slate-100'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[#981228] px-4 py-2 text-xs font-semibold text-white hover:bg-[#b91c1c] transition-colors"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
