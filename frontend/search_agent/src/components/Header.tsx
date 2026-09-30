import React, { useState, useRef, useEffect } from 'react';
import { Project } from '../types/circuithub';
import { getApiBaseUrl } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import {
  FolderKanban,
  ChevronDown,
  Plus,
  CheckCircle2,
  Sun,
  Moon,
  Settings2,
  Cpu,
  Layers,
} from 'lucide-react';

interface HeaderProps {
  activeProject: Project | null;
  projects: Project[];
  onSelectProject: (projectId: string | null) => void;
  onOpenNewProjectModal: () => void;
  onOpenSettingsModal: () => void;
  isBackendConnected: boolean | null;
  activeViewTab: 'workspace' | 'datasheets';
  onSelectViewTab: (tab: 'workspace' | 'datasheets') => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeProject,
  projects,
  onSelectProject,
  onOpenNewProjectModal,
  onOpenSettingsModal,
  isBackendConnected,
  activeViewTab,
  onSelectViewTab,
}) => {
  const { mode, toggleMode } = useTheme();
  const isLight = mode === 'light';
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors ${
        isLight
          ? 'bg-white/95 border-[#E2E8F0] text-[#0F172A]'
          : 'bg-[#0B0F17]/95 border-[#222F43] text-[#F8FAFC]'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 sm:px-6">
        
        {/* Left Zone: Brand Logo & Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1D4ED8] text-white shadow-sm shadow-[#1D4ED8]/20">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight">CircuitHub</span>
              <span className="hidden sm:inline-block ml-1.5 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                Sourcing Agent
              </span>
            </div>
          </div>

          {/* Backend Status Indicator */}
          <button
            onClick={onOpenSettingsModal}
            className={`hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-mono transition-colors ${
              isBackendConnected === true
                ? 'bg-[#059669]/10 text-[#059669] border border-[#059669]/20'
                : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
            }`}
            title="Click to configure the backend API endpoint"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isBackendConnected === true ? 'bg-[#059669] animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span>
              {isBackendConnected === true
                ? getApiBaseUrl().replace(/^https?:\/\//, '')
                : 'Offline (:8000)'}
            </span>
          </button>
        </div>

        {/* Center Zone: Active Project Selector Dropdown */}
        <div className="flex items-center gap-2" ref={dropdownRef}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isLight
                  ? 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-800 hover:border-slate-300'
                  : 'border-[#222F43] bg-[#151C2C] text-slate-200 hover:border-slate-600'
              }`}
            >
              <FolderKanban className="h-3.5 w-3.5 text-[#1D4ED8]" />
              <span className="max-w-[140px] sm:max-w-[240px] truncate">
                {activeProject ? activeProject.name : 'Casual Workspace'}
              </span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {isDropdownOpen && (
              <div
                className={`absolute left-0 mt-1.5 w-72 rounded-xl border p-1.5 shadow-2xl z-50 transition-colors ${
                  isLight
                    ? 'bg-white border-[#E2E8F0] text-slate-800 shadow-slate-200/50'
                    : 'bg-[#151C2C] border-[#222F43] text-slate-200 shadow-black/60'
                }`}
              >
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Select Workspace
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSelectProject(null);
                    setIsDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                    activeProject === null
                      ? 'bg-[#1D4ED8]/10 text-[#1D4ED8] font-bold'
                      : isLight
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-[#1B2438]'
                  }`}
                >
                  <span className="truncate">Casual Workspace (Temporary)</span>
                  {activeProject === null && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                </button>

                <div className={`my-1 border-t ${isLight ? 'border-slate-100' : 'border-[#222F43]'}`} />

                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Projects ({projects.length})
                </div>

                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onSelectProject(p.id);
                        setIsDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        activeProject?.id === p.id
                          ? 'bg-[#1D4ED8]/10 text-[#1D4ED8] font-bold'
                          : isLight
                          ? 'text-slate-700 hover:bg-slate-100'
                          : 'text-slate-300 hover:bg-[#1B2438]'
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {p.items.length} parts
                      </span>
                    </button>
                  ))}
                </div>

                <div className={`my-1 border-t ${isLight ? 'border-slate-100' : 'border-[#222F43]'}`} />

                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onOpenNewProjectModal();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/10 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create New Project</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenNewProjectModal}
            className={`hidden sm:flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isLight
                ? 'border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-50'
                : 'border-[#222F43] bg-[#151C2C] text-slate-300 hover:bg-[#1B2438]'
            }`}
            title="Create a new BOM project"
          >
            <Plus className="h-3.5 w-3.5 text-[#1D4ED8]" />
            <span>New</span>
          </button>
        </div>

        {/* Right Zone: View switch tabs, Dark/Light Mode toggle, Settings */}
        <div className="flex items-center gap-2">
          {/* Quick tab for Workspace vs Datasheet Vault */}
          <div
            className={`hidden md:flex items-center p-0.5 rounded-lg border transition-colors ${
              isLight ? 'bg-slate-100 border-[#E2E8F0]' : 'bg-[#151C2C] border-[#222F43]'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectViewTab('workspace')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeViewTab === 'workspace'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'bg-[#1B2438] text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <Cpu className="h-3 w-3" />
              <span>EDA Workspace</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectViewTab('datasheets')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeViewTab === 'datasheets'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'bg-[#1B2438] text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="h-3 w-3 text-amber-500" />
              <span>Project Datasheets</span>
              {activeProject && activeProject.datasheets.length > 0 && (
                <span className="font-mono text-[10px] tabular-nums px-1 rounded bg-[#1D4ED8]/20 text-[#1D4ED8]">
                  {activeProject.datasheets.length}
                </span>
              )}
            </button>
          </div>

          {/* Clean Dark / Light Mode Switch */}
          <button
            type="button"
            onClick={toggleMode}
            className={`flex items-center gap-1.5 rounded-lg border p-2 transition-colors ${
              isLight
                ? 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100'
                : 'border-[#222F43] bg-[#151C2C] text-amber-400 hover:bg-[#1B2438]'
            }`}
            title={`Switch to ${isLight ? 'Dark' : 'Light'} mode`}
          >
            {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          {/* API Settings Config */}
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className={`flex items-center gap-1 rounded-lg border p-2 transition-colors ${
              isLight
                ? 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-600 hover:bg-slate-100'
                : 'border-[#222F43] bg-[#151C2C] text-slate-400 hover:bg-[#1B2438]'
            }`}
            title="Configure FastAPI endpoint & test connection"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

      </div>
    </header>
  );
};
