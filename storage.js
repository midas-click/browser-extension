import { DEFAULT_CONFIG, LOCAL_DEV_CONFIG, STORAGE_KEYS } from "./config.js";

export async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const storedSettings = stored[STORAGE_KEYS.settings] || {};
  const settings = isOldLocalDefault(storedSettings) ? {} : storedSettings;

  return {
    ...DEFAULT_CONFIG,
    ...settings,
  };
}

export async function getAuth() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.auth);
  return stored[STORAGE_KEYS.auth] || null;
}

export async function getAuthStatus() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.authStatus);
  return stored[STORAGE_KEYS.authStatus] || { state: "idle" };
}

export async function saveAuth(auth) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.auth]: auth,
    [STORAGE_KEYS.authStatus]: { state: "idle", updatedAt: Date.now() },
  });
}

export async function clearAuth() {
  await chrome.storage.local.remove([STORAGE_KEYS.auth, STORAGE_KEYS.authStatus]);
}

export async function setAuthStatus(status) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.authStatus]: {
      ...status,
      updatedAt: Date.now(),
    },
  });
}

export async function clearAuthStatus() {
  await chrome.storage.local.remove(STORAGE_KEYS.authStatus);
}

export async function saveResumes(resumes) {
  await chrome.storage.local.set({ [STORAGE_KEYS.resumes]: resumes });
}

export async function getCachedResumes() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.resumes);
  return stored[STORAGE_KEYS.resumes] || [];
}

function isOldLocalDefault(settings) {
  return (
    settings.apiBaseUrl === LOCAL_DEV_CONFIG.apiBaseUrl &&
    settings.webAppUrl === LOCAL_DEV_CONFIG.webAppUrl
  );
}
