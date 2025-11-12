/**
 * Local storage utility with versioning and LRU cache management
 */

// Current schema version
const STORAGE_VERSION = 1;
const VERSION_KEY = 'jellos:storage:version';

// Storage keys
export const STORAGE_KEYS = {
  RECENT_PROJECTS: 'jellos:recentProjects',
  EXPANDED_PROJECTS: 'jellos:expandedProjects',
  USER_SETTINGS: 'jellos:userSettings',
} as const;

// Maximum items for LRU caches
const MAX_RECENT_PROJECTS = 5;
const MAX_EXPANDED_STATE = 50; // Keep last 50 project states

/**
 * Interface for expanded projects state
 */
export interface ExpandedProjectsState {
  [projectId: string]: {
    isExpanded: boolean;
    lastAccessed: number; // Timestamp for LRU
  };
}

/**
 * Interface for user settings
 */
export interface UserSettings {
  theme?: 'light' | 'dark' | 'system';
  sidebarCollapsed?: boolean;
  // Add more settings as needed
}

/**
 * Safe JSON parse with fallback
 */
function safeJSONParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Check if localStorage is available
 */
export function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current storage version
 */
function getStorageVersion(): number {
  if (!isStorageAvailable()) return STORAGE_VERSION;
  const version = localStorage.getItem(VERSION_KEY);
  return version ? parseInt(version, 10) : 0;
}

/**
 * Migrate storage if version changed
 */
export function migrateStorage(): void {
  if (!isStorageAvailable()) return;

  const currentVersion = getStorageVersion();

  // No migration needed
  if (currentVersion === STORAGE_VERSION) return;

  // Migration from v0 (no version) to v1
  if (currentVersion === 0) {
    // Initialize with current version
    localStorage.setItem(VERSION_KEY, STORAGE_VERSION.toString());
    return;
  }

  // Future migrations would go here
  // if (currentVersion === 1 && STORAGE_VERSION === 2) { ... }

  // Update version
  localStorage.setItem(VERSION_KEY, STORAGE_VERSION.toString());
}

/**
 * Get recent project IDs
 */
export function getRecentProjects(): string[] {
  if (!isStorageAvailable()) return [];
  const stored = localStorage.getItem(STORAGE_KEYS.RECENT_PROJECTS);
  return safeJSONParse(stored, []);
}

/**
 * Add project to recent projects (LRU)
 */
export function addToRecentProjects(projectId: string): void {
  if (!isStorageAvailable()) return;
  try {
    const recent = getRecentProjects();
    const filtered = recent.filter((id) => id !== projectId);
    const updated = [projectId, ...filtered].slice(0, MAX_RECENT_PROJECTS);
    localStorage.setItem(
      STORAGE_KEYS.RECENT_PROJECTS,
      JSON.stringify(updated)
    );
  } catch (error) {
    console.error('Error adding to recent projects:', error);
  }
}

/**
 * Get expanded projects state
 */
export function getExpandedProjects(): ExpandedProjectsState {
  if (!isStorageAvailable()) return {};
  const stored = localStorage.getItem(STORAGE_KEYS.EXPANDED_PROJECTS);
  return safeJSONParse(stored, {});
}

/**
 * Check if project is expanded
 */
export function isProjectExpanded(projectId: string): boolean {
  const state = getExpandedProjects();
  return state[projectId]?.isExpanded ?? false;
}

/**
 * Set project expanded state
 */
export function setProjectExpanded(
  projectId: string,
  isExpanded: boolean
): void {
  if (!isStorageAvailable()) return;
  try {
    let state = getExpandedProjects();

    // Update state
    state[projectId] = {
      isExpanded,
      lastAccessed: Date.now(),
    };

    // Apply LRU: Remove oldest entries if exceeding limit
    const entries = Object.entries(state);
    if (entries.length > MAX_EXPANDED_STATE) {
      // Sort by lastAccessed (oldest first)
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

      // Keep only the most recent MAX_EXPANDED_STATE entries
      const toKeep = entries.slice(-MAX_EXPANDED_STATE);
      state = Object.fromEntries(toKeep);
    }

    localStorage.setItem(
      STORAGE_KEYS.EXPANDED_PROJECTS,
      JSON.stringify(state)
    );
  } catch (error) {
    console.error('Error setting project expanded state:', error);
  }
}

/**
 * Get user settings
 */
export function getUserSettings(): UserSettings {
  if (!isStorageAvailable()) return {};
  const stored = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
  return safeJSONParse(stored, {});
}

/**
 * Update user settings
 */
export function updateUserSettings(settings: Partial<UserSettings>): void {
  if (!isStorageAvailable()) return;
  try {
    const current = getUserSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(updated));
  } catch (error) {
    console.error('Error updating user settings:', error);
  }
}

/**
 * Clear all storage (for debugging/logout)
 */
export function clearAllStorage(): void {
  if (!isStorageAvailable()) return;
  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
    localStorage.removeItem(VERSION_KEY);
  } catch (error) {
    console.error('Error clearing storage:', error);
  }
}

/**
 * Get storage usage estimate (in bytes)
 */
export function getStorageUsage(): number {
  if (!isStorageAvailable()) return 0;
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('jellos:')) {
        const value = localStorage.getItem(key);
        if (value) {
          total += key.length + value.length;
        }
      }
    }
    // Rough estimate: 2 bytes per character (UTF-16)
    return total * 2;
  } catch {
    return 0;
  }
}

// Initialize storage on import (only in browser)
if (typeof window !== 'undefined') {
  migrateStorage();
}
