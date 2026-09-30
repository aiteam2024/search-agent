/**
 * CircuitHub Storage Service
 * Manages Projects, BOM items, Datasheets, and Search Preferences in localStorage.
 */

import { Project, BOMItem, SavedDatasheet, SearchFormState, ComponentKind } from '../types/circuithub';

const PROJECTS_STORAGE_KEY = 'circuithub_projects_v1';
const ACTIVE_PROJECT_ID_KEY = 'circuithub_active_project_id';
const SEARCH_PREFS_KEY = 'circuithub_last_search_prefs';
const CASUAL_HISTORY_KEY = 'circuithub_casual_history';

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading projects from localStorage', err);
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (err) {
    console.error('Error saving projects to localStorage', err);
  }
}

export function getProjectById(id: string): Project | null {
  const projects = loadProjects();
  return projects.find((p) => p.id === id) || null;
}

export function createProject(name: string, description: string = ''): Project {
  const projects = loadProjects();
  const newProject: Project = {
    id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim(),
    description: description.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [],
    datasheets: [],
  };

  const updated = [newProject, ...projects];
  saveProjects(updated);
  setActiveProjectId(newProject.id);
  return newProject;
}

export function updateProject(updatedProject: Project): void {
  const projects = loadProjects();
  const index = projects.findIndex((p) => p.id === updatedProject.id);
  if (index >= 0) {
    projects[index] = {
      ...updatedProject,
      updatedAt: new Date().toISOString(),
    };
    saveProjects(projects);
  }
}

export function deleteProject(id: string): void {
  const projects = loadProjects();
  const filtered = projects.filter((p) => p.id !== id);
  saveProjects(filtered);

  if (getActiveProjectId() === id) {
    setActiveProjectId(null);
  }
}

export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_ID_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveProjectId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_PROJECT_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
    }
  } catch {
    // ignore
  }
}

// -------------------------------------------------------------
// BOM & Datasheet Helpers
// -------------------------------------------------------------

export function addBOMItemToProject(
  projectId: string,
  item: Omit<BOMItem, 'id' | 'addedAt'>
): { project: Project; addedItem: BOMItem; hasDuplicate: boolean } {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const newItem: BOMItem = {
    ...item,
    id: `bom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    addedAt: new Date().toISOString(),
  };

  // Check if duplicate title exists
  const hasDuplicate = project.items.some(
    (existing) => existing.title.toLowerCase().trim() === item.title.toLowerCase().trim()
  );

  project.items.push(newItem);
  project.updatedAt = new Date().toISOString();
  saveProjects(projects);

  return { project, addedItem: newItem, hasDuplicate };
}

export function updateItemQuantity(
  projectId: string,
  itemId: string,
  newQty: number
): Project | null {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  const item = project.items.find((i) => i.id === itemId);
  if (item) {
    item.qty = Math.max(1, newQty);
    project.updatedAt = new Date().toISOString();
    saveProjects(projects);
  }
  return project;
}

export function removeBOMItem(projectId: string, itemId: string): Project | null {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  project.items = project.items.filter((i) => i.id !== itemId);
  project.updatedAt = new Date().toISOString();
  saveProjects(projects);
  return project;
}

export function addDatasheetToProject(
  projectId: string,
  datasheet: Omit<SavedDatasheet, 'id' | 'savedAt'>
): Project {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const exists = project.datasheets.some((d) => d.filename === datasheet.filename);
  if (!exists) {
    const newEntry: SavedDatasheet = {
      ...datasheet,
      id: `ds-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      savedAt: new Date().toISOString(),
    };
    project.datasheets.push(newEntry);
    project.updatedAt = new Date().toISOString();
    saveProjects(projects);
  }

  return project;
}

export function removeDatasheetFromProject(projectId: string, datasheetId: string): Project | null {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  project.datasheets = project.datasheets.filter((d) => d.id !== datasheetId);
  project.updatedAt = new Date().toISOString();
  saveProjects(projects);
  return project;
}

// -------------------------------------------------------------
// Search Form Preferences (Remember last manufacturer & package)
// -------------------------------------------------------------

export interface SearchPreferences {
  manufacturer: string;
  package: string;
}

export function loadSearchPreferences(): SearchPreferences {
  try {
    const raw = localStorage.getItem(SEARCH_PREFS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return { manufacturer: '', package: '' };
}

export function saveSearchPreferences(prefs: SearchPreferences): void {
  try {
    localStorage.setItem(SEARCH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export interface RecentSearch {
  query: string;
  kind: ComponentKind;
}

/** Return the latest searches, newest first. */
export function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(CASUAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentSearch =>
        item &&
        typeof item.query === 'string' &&
        (item.kind === 'normal' || item.kind === 'smd'),
    );
  } catch {
    return [];
  }
}

/** Store a search at the front and keep the latest eight. */
export function rememberRecentSearch(query: string, kind: ComponentKind): RecentSearch[] {
  const name = query.trim();
  if (!name) return loadRecentSearches();
  const next = [
    { query: name, kind },
    ...loadRecentSearches().filter((item) => item.query.toLowerCase() !== name.toLowerCase()),
  ].slice(0, 8);
  try {
    localStorage.setItem(CASUAL_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

// -------------------------------------------------------------
// CSV BOM Export
// -------------------------------------------------------------

export function exportBOMToCSV(project: Project): void {
  const headers = ['Line #', 'Part Title', 'Vendor', 'Package', 'Notes', 'Unit Price (INR)', 'Quantity', 'Total (INR)', 'Store Link'];
  const rows = project.items.map((item, index) => {
    const lineTotal = (item.unitPriceInr * item.qty).toFixed(2);
    return [
      index + 1,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.vendor || '').replace(/"/g, '""')}"`,
      `"${(item.package || '').replace(/"/g, '""')}"`,
      `"${(item.note || '').replace(/"/g, '""')}"`,
      item.unitPriceInr.toFixed(2),
      item.qty,
      lineTotal,
      `"${(item.link || '').replace(/"/g, '""')}"`,
    ];
  });

  const totalSum = project.items
    .reduce((sum, item) => sum + item.unitPriceInr * item.qty, 0)
    .toFixed(2);

  const summaryRow = ['', 'PROJECT TOTAL', '', '', '', '', '', totalSum, ''];

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(',')), summaryRow.join(',')].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeProjectName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  link.setAttribute('href', url);
  link.setAttribute('download', `BOM_${safeProjectName}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
