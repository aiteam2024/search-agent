import React, { useState } from 'react';
import { Project } from '../types/circuithub';
import { createProject } from '../services/storage';
import { useTheme } from '../context/ThemeContext';
import { X, FolderPlus } from 'lucide-react';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const { mode } = useTheme();
  const isLight = mode === 'light';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a project name');
      return;
    }

    const created = createProject(name, description);
    setName('');
    setDescription('');
    setError('');
    onProjectCreated(created);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-md rounded-xl border p-6 shadow-2xl transition-colors ${
          isLight
            ? 'bg-white border-[#ded7c7] text-slate-800'
            : 'bg-[#0e1834] border-slate-800 text-white'
        }`}
      >
        <div className={`flex items-center justify-between border-b pb-4 ${isLight ? 'border-[#ded7c7]' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#981228]/10 border border-[#981228]/20 text-[#981228]">
              <FolderPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Create New Project</h2>
              <p className="text-xs text-slate-400">Organize your BOM parts and saved datasheets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Project Name <span className="text-[#981228]">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. 5V 3A Synchronous Buck Converter"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              className={`w-full rounded-lg border px-3 py-2 text-xs focus:outline-none transition-colors ${
                isLight
                  ? 'border-[#ded7c7] bg-[#f1ece0] text-slate-900 placeholder-slate-400 focus:border-[#981228]'
                  : 'border-slate-800 bg-[#091226] text-white placeholder-slate-600 focus:border-red-400'
              }`}
            />
            {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Target specs, PCB revision, application notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full resize-none rounded-lg border px-3 py-2 text-xs focus:outline-none transition-colors ${
                isLight
                  ? 'border-[#ded7c7] bg-[#f1ece0] text-slate-900 placeholder-slate-400 focus:border-[#981228]'
                  : 'border-slate-800 bg-[#091226] text-white placeholder-slate-600 focus:border-red-400'
              }`}
            />
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
              type="submit"
              className="rounded-lg bg-[#981228] px-4 py-2 text-xs font-semibold text-white hover:bg-[#b91c1c] transition-colors"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
