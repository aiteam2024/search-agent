import React, { useState } from 'react';
import { Project, BOMItem, SavedDatasheet } from '../types/circuithub';
import {
  updateItemQuantity,
  removeBOMItem,
  removeDatasheetFromProject,
  exportBOMToCSV,
} from '../services/storage';
import { useTheme } from '../context/ThemeContext';
import {
  Download,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  AlertTriangle,
  Minus,
  Eye,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';

interface ProjectCanvasProps {
  project: Project;
  onProjectUpdated: (project: Project) => void;
  onOpenDatasheet: (filename: string, title: string, source: string) => void;
  onOpenNewProject: () => void;
}

export const ProjectCanvas: React.FC<ProjectCanvasProps> = ({
  project,
  onProjectUpdated,
  onOpenDatasheet,
  onOpenNewProject,
}) => {
  const { mode } = useTheme();
  const isLight = mode === 'light';

  const [activeTab, setActiveTab] = useState<'bom' | 'datasheets'>('bom');
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [customPartTitle, setCustomPartTitle] = useState('');
  const [customPartVendor, setCustomPartVendor] = useState('Local Stock');
  const [customPartPrice, setCustomPartPrice] = useState('10.00');
  const [customPartPkg, setCustomPartPkg] = useState('Standard');
  const [customPartQty, setCustomPartQty] = useState(1);

  // Duplicate titles warning
  const duplicateTitles = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of project.items) {
      const k = item.title.trim().toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const dups = new Set<string>();
    counts.forEach((c, title) => {
      if (c > 1) dups.add(title);
    });
    return dups;
  }, [project.items]);

  const totalBOMSum = project.items.reduce(
    (acc, item) => acc + item.unitPriceInr * item.qty,
    0
  );

  const handleQtyChange = (itemId: string, newQty: number) => {
    const updated = updateItemQuantity(project.id, itemId, newQty);
    if (updated) onProjectUpdated(updated);
  };

  const handleRemoveItem = (itemId: string) => {
    const updated = removeBOMItem(project.id, itemId);
    if (updated) onProjectUpdated(updated);
  };

  const handleRemoveDatasheet = (dsId: string) => {
    const updated = removeDatasheetFromProject(project.id, dsId);
    if (updated) onProjectUpdated(updated);
  };

  const handleAddCustomPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPartTitle.trim()) return;

    const unitPrice = parseFloat(customPartPrice) || 0;
    const newItem: BOMItem = {
      id: `bom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: customPartTitle.trim(),
      vendor: customPartVendor.trim() || 'Custom',
      unitPriceInr: unitPrice,
      qty: customPartQty || 1,
      link: '',
      package: customPartPkg.trim() || undefined,
      addedAt: new Date().toISOString(),
    };

    const updatedProject = {
      ...project,
      items: [...project.items, newItem],
      updatedAt: new Date().toISOString(),
    };
    onProjectUpdated(updatedProject);
    setCustomPartTitle('');
    setShowAddCustomModal(false);
  };

  return (
    <div
      className={`h-full flex flex-col rounded-xl border transition-colors ${
        isLight
          ? 'bg-white border-[#E2E8F0] shadow-sm'
          : 'bg-[#151C2C] border-[#222F43]'
      }`}
    >
      {/* Project Canvas Header */}
      <div className={`p-4 sm:p-5 border-b transition-colors ${isLight ? 'border-[#E2E8F0] bg-[#F8FAFC]' : 'border-[#222F43] bg-[#0B0F17]'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-[#1D4ED8] font-bold uppercase tracking-wider">
                Active Project BOM
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {project.items.length} Line Items
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight mt-0.5">
              {project.name}
            </h2>
            {project.description && (
              <p className="text-xs text-slate-400 max-w-xl truncate mt-0.5">
                {project.description}
              </p>
            )}
          </div>

          {/* Quick Metrics & Main Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Total BOM Price Badge in Emerald */}
            <div
              className={`rounded-lg border px-3.5 py-1.5 text-right transition-colors ${
                isLight ? 'bg-white border-[#E2E8F0]' : 'bg-[#151C2C] border-[#222F43]'
              }`}
            >
              <span className="block text-[9px] uppercase font-semibold text-slate-400 tracking-wider">
                Total BOM
              </span>
              <span className="font-mono text-base sm:text-lg font-bold text-[#059669] tabular-nums">
                ₹{totalBOMSum.toFixed(2)}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => exportBOMToCSV(project)}
                disabled={project.items.length === 0}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                  isLight
                    ? 'border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-50'
                    : 'border-[#222F43] bg-[#151C2C] text-slate-200 hover:bg-[#1B2438]'
                }`}
                title="Export Bill of Materials to CSV"
              >
                <Download className="h-3.5 w-3.5 text-slate-400" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAddCustomModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors"
                title="Add a custom part row manually"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Custom Part</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab switcher: BOM Table vs Saved Datasheets */}
        <div className="flex items-center gap-2 mt-4 pt-2 border-t border-current/10">
          <button
            type="button"
            onClick={() => setActiveTab('bom')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeTab === 'bom'
                ? isLight
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'bg-[#1B2438] text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>Bill of Materials ({project.items.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('datasheets')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeTab === 'datasheets'
                ? isLight
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'bg-[#1B2438] text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="h-3 w-3 text-amber-500" />
            <span>Archived Datasheets ({project.datasheets.length})</span>
          </button>
        </div>
      </div>

      {/* Duplicate warning banner */}
      {duplicateTitles.size > 0 && activeTab === 'bom' && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-500">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <strong>Duplicate BOM parts:</strong> {Array.from(duplicateTitles).join(', ')}. Quantities are calculated separately per line.
          </div>
        </div>
      )}

      {/* Main Canvas Viewport */}
      <div className="flex-1 overflow-auto p-4">
        {/* TAB 1: BOM TABLE */}
        {activeTab === 'bom' && (
          <div>
            {project.items.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <Layers className="h-10 w-10 mx-auto opacity-30" />
                <h3 className="text-sm font-semibold">BOM is currently empty</h3>
                <p className="text-xs max-w-sm mx-auto opacity-70">
                  Search components on the left panel and click <strong>"Add to BOM"</strong> to start assembling your build manifest.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddCustomModal(true)}
                  className="rounded-lg bg-[#1D4ED8] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB]"
                >
                  Add Custom Part
                </button>
              </div>
            ) : (
              <div className={`rounded-lg border overflow-hidden ${isLight ? 'border-[#E2E8F0]' : 'border-[#222F43]'}`}>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr
                      className={`border-b text-[10px] uppercase font-semibold tracking-wider ${
                        isLight
                          ? 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-500'
                          : 'border-[#222F43] bg-[#0B0F17] text-slate-400'
                      }`}
                    >
                      <th className="py-2.5 px-3 w-10">#</th>
                      <th className="py-2.5 px-3 font-semibold">Part Name / MPN</th>
                      <th className="py-2.5 px-3">Distributor</th>
                      <th className="py-2.5 px-3">Package</th>
                      <th className="py-2.5 px-3 text-right">Unit (₹)</th>
                      <th className="py-2.5 px-3 text-center w-28">Qty</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                      <th className="py-2.5 px-3 text-center w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#222F43]'}`}>
                    {project.items.map((item, index) => {
                      const isDup = duplicateTitles.has(item.title.trim().toLowerCase());
                      const lineTotal = item.unitPriceInr * item.qty;

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isDup
                              ? 'bg-amber-500/5 hover:bg-amber-500/10'
                              : isLight
                              ? 'hover:bg-slate-50'
                              : 'hover:bg-[#1B2438]/50'
                          }`}
                        >
                          {/* Line # */}
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                            {index + 1}
                          </td>

                          {/* MPN / Title */}
                          <td className="py-2.5 px-3 font-medium max-w-[260px]">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold truncate">
                                {item.title}
                              </span>
                              {isDup && (
                                <span className="rounded bg-amber-500/20 text-amber-500 text-[9px] font-mono px-1">
                                  dup
                                </span>
                              )}
                            </div>
                            {item.note && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {item.note}
                              </p>
                            )}
                          </td>

                          {/* Vendor */}
                          <td className="py-2.5 px-3 text-slate-400 text-xs">
                            <div className="flex items-center gap-1">
                              <span>{item.vendor}</span>
                              {item.link && (
                                <a
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-400 hover:text-[#1D4ED8] p-0.5"
                                  title="Store link"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Package */}
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[11px] text-[#1D4ED8]">
                              {item.package || '—'}
                            </span>
                          </td>

                          {/* Unit Price */}
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs">
                            ₹{item.unitPriceInr.toFixed(2)}
                          </td>

                          {/* Interactive Quantity Stepper */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleQtyChange(item.id, item.qty - 1)}
                                disabled={item.qty <= 1}
                                className={`rounded p-1 border transition-colors disabled:opacity-30 ${
                                  isLight
                                    ? 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                                    : 'border-[#222F43] bg-[#0F1523] hover:bg-[#1B2438] text-slate-300'
                                }`}
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val >= 1) handleQtyChange(item.id, val);
                                }}
                                className={`w-12 rounded border py-0.5 text-center font-mono text-xs tabular-nums focus:outline-none ${
                                  isLight
                                    ? 'border-slate-200 bg-white text-slate-900 focus:border-[#1D4ED8]'
                                    : 'border-[#222F43] bg-[#0F1523] text-white focus:border-[#1D4ED8]'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleQtyChange(item.id, item.qty + 1)}
                                className={`rounded p-1 border transition-colors ${
                                  isLight
                                    ? 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                                    : 'border-[#222F43] bg-[#0F1523] hover:bg-[#1B2438] text-slate-300'
                                }`}
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>

                          {/* Line Total in Emerald */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#059669] tabular-nums text-xs">
                            ₹{lineTotal.toFixed(2)}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenDatasheet(`${item.title}.pdf`, item.title, item.vendor);
                                }}
                                className="text-slate-400 hover:text-amber-500 p-1"
                                title="View Datasheet"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="text-slate-400 hover:text-rose-500 p-1"
                                title="Remove line item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr
                      className={`border-t font-semibold ${
                        isLight ? 'border-[#E2E8F0] bg-[#F8FAFC]' : 'border-[#222F43] bg-[#0B0F17]'
                      }`}
                    >
                      <td colSpan={6} className="py-3 px-4 text-right uppercase tracking-wider text-[11px] text-slate-400 font-semibold">
                        Total Project Estimate:
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-bold text-[#059669] tabular-nums">
                        ₹{totalBOMSum.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ARCHIVED DATASHEETS */}
        {activeTab === 'datasheets' && (
          <div>
            {project.datasheets.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <FileText className="h-10 w-10 mx-auto opacity-30 text-amber-500" />
                <h3 className="text-sm font-semibold">No datasheets saved yet</h3>
                <p className="text-xs max-w-sm mx-auto opacity-70">
                  When you preview datasheets from the search panel, you can click <strong>"Attach to Project"</strong> to archive verified component specs.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {project.datasheets.map((ds) => (
                  <div
                    key={ds.id}
                    className={`rounded-lg border p-3 flex flex-col justify-between transition-colors ${
                      isLight
                        ? 'border-[#E2E8F0] bg-white hover:border-slate-300'
                        : 'border-[#222F43] bg-[#151C2C] hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span className="font-semibold text-amber-500">{ds.source || 'Distributor'}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDatasheet(ds.id)}
                          className="text-slate-400 hover:text-rose-500 p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <h4 className="text-xs font-bold truncate">{ds.title}</h4>
                      <p className="font-mono text-[10px] text-slate-400 truncate mt-0.5">
                        {ds.filename}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-current/10 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => onOpenDatasheet(ds.filename, ds.title, ds.source)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8] hover:underline"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Preview PDF</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Add Custom Part */}
      {showAddCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div
            className={`w-full max-w-md rounded-xl border p-5 shadow-2xl transition-colors ${
              isLight ? 'bg-white border-[#E2E8F0] text-slate-800' : 'bg-[#151C2C] border-[#222F43] text-white'
            }`}
          >
            <h3 className="text-sm font-bold">Add Custom Part to BOM</h3>
            <p className="text-xs text-slate-400 mt-0.5">Add custom inventory, PCB fab, or unlisted parts</p>

            <form onSubmit={handleAddCustomPart} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Part Name / MPN *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 100nF 50V 0805 Ceramic Capacitor"
                  value={customPartTitle}
                  onChange={(e) => setCustomPartTitle(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-1.5 focus:outline-none ${
                    isLight
                      ? 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                      : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                    Vendor / Source
                  </label>
                  <input
                    type="text"
                    value={customPartVendor}
                    onChange={(e) => setCustomPartVendor(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-1.5 focus:outline-none ${
                      isLight
                        ? 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                        : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                    Package / Case
                  </label>
                  <input
                    type="text"
                    value={customPartPkg}
                    onChange={(e) => setCustomPartPkg(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-1.5 focus:outline-none ${
                      isLight
                        ? 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                        : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                    Unit Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={customPartPrice}
                    onChange={(e) => setCustomPartPrice(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-1.5 font-mono focus:outline-none ${
                      isLight
                        ? 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                        : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={customPartQty}
                    onChange={(e) => setCustomPartQty(parseInt(e.target.value, 10) || 1)}
                    className={`w-full rounded-lg border px-3 py-1.5 font-mono focus:outline-none ${
                      isLight
                        ? 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-900 focus:border-[#1D4ED8]'
                        : 'bg-[#0F1523] border-[#222F43] text-white focus:border-[#1D4ED8]'
                    }`}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-current/10">
                <button
                  type="button"
                  onClick={() => setShowAddCustomModal(false)}
                  className={`rounded-lg border px-3 py-1.5 font-medium transition-colors ${
                    isLight
                      ? 'border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-100'
                      : 'border-[#222F43] bg-[#151C2C] text-slate-300 hover:bg-[#1B2438]'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1D4ED8] px-4 py-1.5 font-semibold text-white hover:bg-[#2563EB]"
                >
                  Add to BOM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
