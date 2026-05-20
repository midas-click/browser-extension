import { DEFAULT_CONFIG, STORAGE_KEYS } from "./config.js";

export async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return {
    ...DEFAULT_CONFIG,
    ...(stored[STORAGE_KEYS.settings] || {}),
  };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function getAuth() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.auth);
  return stored[STORAGE_KEYS.auth] || null;
}

export async function saveAuth(auth) {
  await chrome.storage.local.set({ [STORAGE_KEYS.auth]: auth });
}

export async function clearAuth() {
  await chrome.storage.local.remove(STORAGE_KEYS.auth);
}

export async function saveResumes(resumes) {
  await chrome.storage.local.set({ [STORAGE_KEYS.resumes]: resumes });
}

export async function getCachedResumes() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.resumes);
  return stored[STORAGE_KEYS.resumes] || [];
}

export async function saveLastJob(job) {
  await chrome.storage.local.set({ [STORAGE_KEYS.lastJob]: job });
}

export async function getLastJob() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.lastJob);
  return stored[STORAGE_KEYS.lastJob] || null;
}
