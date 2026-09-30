/**
 * CircuitHub Sourcing Agent - Professional EDA Workspace
 */

import React, { useState, useEffect } from 'react';
import {
  Project,
  DatasheetCandidate,
} from './types/circuithub';
import {
  loadProjects,
  getActiveProjectId,
  setActiveProjectId,
  deleteProject,
  addBOMItemToProject,
  addDatasheetToProject,
} from './services/storage';
import {
  testBackendConnection,
  downloadDatasheet,
  extractFilename,
  getPdfFileUrl,
  rememberSavedLink,
} from './services/api';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Header } from './components/Header';
import { SearchPanel } from './components/SearchPanel';
import { ProjectCanvas } from './components/ProjectCanvas';
import { DatasheetModal } from './components/DatasheetModal';
import { NewProjectModal } from './components/NewProjectModal';
import { ApiSettingsModal } from './components/ApiSettingsModal';

function AppContent() {
  const { mode } = useTheme();
  const isLight = mode === 'light';

  // Workspace & Project State
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [activeViewTab, setActiveViewTab] = useState<'workspace' | 'datasheets'>('workspace');

  // Modals & Overlay state
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [activeDatasheet, setActiveDatasheet] = useState<{
    filename: string;
    title: string;
    source: string;
    isPreview: boolean;
    remoteUrl?: string;
    candidate?: DatasheetCandidate;
  } | null>(null);

  // Backend connectivity status
  const [isBackendConnected, setIsBackendConnected] = useState<boolean | null>(null);

  // Load projects from storage on mount
  useEffect(() => {
    const loaded = loadProjects();
    setProjects(loaded);
    const activeId = getActiveProjectId();
    if (activeId && loaded.some((p) => p.id === activeId)) {
      setActiveProjectIdState(activeId);
    } else if (loaded.length > 0) {
      setActiveProjectIdState(loaded[0].id);
      setActiveProjectId(loaded[0].id);
    }

    testBackendConnection().then((res) => {
      setIsBackendConnected(res.ok);
    });
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  const handleSelectProject = (id: string | null) => {
    setActiveProjectIdState(id);
    setActiveProjectId(id);
  };

  const handleProjectUpdated = (updated: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleProjectCreated = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
    setActiveProjectIdState(newProject.id);
    setActiveProjectId(newProject.id);
  };

  const handleAddPartToBOM = (part: {
    title: string;
    vendor: string;
    unitPriceInr: number;
    link: string;
    package?: string;
    note?: string;
  }) => {
    if (!activeProjectId) return;

    const { project } = addBOMItemToProject(activeProjectId, {
      title: part.title,
      vendor: part.vendor,
      unitPriceInr: part.unitPriceInr,
      qty: 1,
      link: part.link,
      package: part.package,
      note: part.note,
    });

    handleProjectUpdated(project);
    if (part.link.startsWith('http')) {
      void rememberSavedLink(part.title, part.link).catch((err) => {
        console.warn('Saved link was not stored.', err);
      });
    }
  };

  const handleOpenDatasheet = (
    filename: string,
    title: string,
    source: string,
    candidate?: DatasheetCandidate,
    isPreview = false,
  ) => {
    setActiveDatasheet({ filename, title, source, candidate, isPreview });
  };

  const handleOpenAttachment = (title: string, source: string, url: string) => {
    setActiveDatasheet({ filename: '', title, source, isPreview: false, remoteUrl: url });
  };

  const handleDownloadDatasheet = async () => {
    if (!activeDatasheet?.candidate) return;
    const saved = await downloadDatasheet(activeDatasheet.candidate);
    const filename = extractFilename(saved.saved_path || '');
    setActiveDatasheet({
      ...activeDatasheet,
      filename,
      isPreview: false,
      candidate: saved,
    });
    if (activeProjectId && filename) {
      const updated = addDatasheetToProject(activeProjectId, {
        title: activeDatasheet.title,
        source: activeDatasheet.source,
        filename,
        package: saved.package,
        manufacturer: saved.manufacturer,
      });
      handleProjectUpdated(updated);
    }
    const link = document.createElement('a');
    link.href = getPdfFileUrl(filename);
    link.download = filename;
    link.click();
  };

  const handleSettingsChanged = () => {
    testBackendConnection().then((res) => setIsBackendConnected(res.ok));
  };

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-150 ${
        isLight
          ? 'bg-[#F8FAFC] text-[#0F172A]'
          : 'bg-[#0B0F17] text-[#F8FAFC]'
      }`}
    >
      {/* 1. Compact Fixed Top Bar */}
      <Header
        activeProject={activeProject}
        projects={projects}
        onSelectProject={handleSelectProject}
        onOpenNewProjectModal={() => setIsNewProjectModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        isBackendConnected={isBackendConnected}
        activeViewTab={activeViewTab}
        onSelectViewTab={setActiveViewTab}
      />

      {/* 2. Workspace Split View: Left (35%) Search, Right (65%) BOM Canvas */}
      <main className="flex-1 mx-auto w-full max-w-[1600px] px-3 sm:px-6 py-4 flex flex-col">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch min-h-[calc(100vh-6rem)]">
          <div className={`${activeProject ? 'lg:col-span-4' : 'lg:col-span-12'} h-full min-h-[500px]`}>
            <SearchPanel
              activeProject={activeProject}
              onAddPartToBOM={handleAddPartToBOM}
              onOpenDatasheet={(filename, title, source, candidate) =>
                handleOpenDatasheet(filename, title, source, candidate, true)
              }
              onOpenAttachment={handleOpenAttachment}
            />
          </div>
          {activeProject && (
            <div className="lg:col-span-8 h-full min-h-[500px]">
              <ProjectCanvas
                project={activeProject}
                onProjectUpdated={handleProjectUpdated}
                onOpenDatasheet={(filename, title, source) => {
                  handleOpenDatasheet(filename, title, source, undefined, false);
                }}
                onOpenNewProject={() => setIsNewProjectModalOpen(true)}
              />
            </div>
          )}
        </div>
      </main>

      {/* 3. Integrated Datasheet Modal */}
      {activeDatasheet && (
        <DatasheetModal
          isOpen={Boolean(activeDatasheet)}
          onClose={() => setActiveDatasheet(null)}
          filename={activeDatasheet.filename}
          title={activeDatasheet.title}
          source={activeDatasheet.source}
          manufacturer={activeDatasheet.candidate?.manufacturer}
          packageType={activeDatasheet.candidate?.package}
          isPreview={activeDatasheet.isPreview}
          pageUrl={activeDatasheet.candidate?.page_url}
          remoteUrl={activeDatasheet.remoteUrl}
          onDownload={
            activeDatasheet.candidate && !activeDatasheet.remoteUrl
              ? handleDownloadDatasheet
              : undefined
          }
          onAddToBOM={
            activeProject
              ? (partTitle, pkg) => {
                  handleAddPartToBOM({
                    title: partTitle,
                    vendor: activeDatasheet.source || 'Distributor',
                    unitPriceInr: 0,
                    link: activeDatasheet.candidate?.page_url || '',
                    package: pkg,
                  });
                }
              : undefined
          }
        />
      )}

      {/* Modals */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onProjectCreated={handleProjectCreated}
      />

      <ApiSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSettingsChanged={handleSettingsChanged}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
