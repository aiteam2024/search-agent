import React, { useState } from 'react';
import { getPdfFileUrl, getPreviewFileUrl, extractFilename } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Plus,
  Check,
  RefreshCw,
} from 'lucide-react';

interface DatasheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  title: string;
  manufacturer?: string;
  packageType?: string;
  source?: string;
  pageUrl?: string;
  remoteUrl?: string;
  isPreview?: boolean;
  onDownload?: () => void;
  onAddToBOM?: (partTitle: string, packageType?: string) => void;
}

export const DatasheetModal: React.FC<DatasheetModalProps> = ({
  isOpen,
  onClose,
  filename,
  title,
  manufacturer,
  packageType,
  source,
  pageUrl,
  remoteUrl,
  isPreview = false,
  onDownload,
  onAddToBOM,
}) => {
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const [iframeKey, setIframeKey] = useState(0);
  const [added, setAdded] = useState(false);

  if (!isOpen || (!filename && !remoteUrl)) return null;

  const cleanFilename = extractFilename(filename);
  const pdfUrl = remoteUrl || (isPreview ? getPreviewFileUrl(cleanFilename) : getPdfFileUrl(cleanFilename));

  const handleAdd = () => {
    if (onAddToBOM) {
      onAddToBOM(title || cleanFilename.replace('.pdf', ''), packageType);
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6">
      <div
        className={`w-full max-w-5xl h-[88vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden transition-colors ${
          isLight
            ? 'bg-white border-[#E2E8F0] text-[#0F172A]'
            : 'bg-[#151C2C] border-[#222F43] text-[#F8FAFC]'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between border-b px-5 py-3.5 transition-colors ${
            isLight ? 'bg-[#F8FAFC] border-[#E2E8F0]' : 'bg-[#0B0F17] border-[#222F43]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold truncate">
                  {title || cleanFilename}
                </h3>
                {manufacturer && (
                  <span className="text-[11px] font-semibold text-slate-400 shrink-0">
                    · {manufacturer}
                  </span>
                )}
                {packageType && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                      isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-700'
                        : 'bg-[#1B2438] border-[#222F43] text-slate-300'
                    }`}
                  >
                    {packageType}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {remoteUrl ? 'Attachment' : `File: ${cleanFilename}`} {source ? `· Source: ${source}` : ''}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {onAddToBOM && (
              <button
                type="button"
                onClick={handleAdd}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  added
                    ? 'bg-[#059669]/20 text-[#059669] border border-[#059669]/40'
                    : 'bg-[#1D4ED8] text-white hover:bg-[#2563EB]'
                }`}
              >
                {added ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{added ? 'Added to BOM' : 'Add to BOM'}</span>
              </button>
            )}

            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB]"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIframeKey((prev) => prev + 1)}
              className={`p-1.5 rounded-lg border transition-colors ${
                isLight
                  ? 'border-[#E2E8F0] bg-white text-slate-600 hover:bg-slate-100'
                  : 'border-[#222F43] bg-[#151C2C] text-slate-400 hover:text-white'
              }`}
              title="Reload preview"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                isLight
                  ? 'border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-100'
                  : 'border-[#222F43] bg-[#151C2C] text-slate-300 hover:text-white'
              }`}
              title="Open standalone PDF tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Direct Tab</span>
            </a>

            {pageUrl && (
              <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  isLight
                    ? 'border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-100'
                    : 'border-[#222F43] bg-[#151C2C] text-slate-300 hover:text-white'
                }`}
                title="Distributor portal"
              >
                <span className="hidden md:inline">Portal</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isLight
                  ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  : 'text-slate-400 hover:bg-[#1B2438] hover:text-white'
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Embedded PDF Iframe */}
        <div className="relative flex-1 w-full bg-slate-900">
          <iframe
            key={iframeKey}
            src={pdfUrl}
            title={title || cleanFilename}
            className="w-full h-full border-0"
          />

          {/* Fallback helper footer */}
          <div
            className={`absolute bottom-3 right-3 max-w-sm rounded-lg border px-3 py-2 text-[11px] shadow-lg backdrop-blur-md transition-colors ${
              isLight
                ? 'bg-white/95 border-[#E2E8F0] text-slate-700'
                : 'bg-[#151C2C]/95 border-[#222F43] text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold">{remoteUrl ? 'Attachment' : 'Document'}:</span>
              <code className="font-mono text-[10px] text-[#1D4ED8] truncate">
                {remoteUrl || cleanFilename}
              </code>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {remoteUrl
                ? 'Shown from the product page. The file is not saved.'
                : 'Served via FastAPI backend on port 8000.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
