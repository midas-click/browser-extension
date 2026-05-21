import { getAuth, getSettings } from "./storage.js";

let refreshPromise = null;
const TOKEN_REFRESH_BUFFER_MS = 10 * 1000;

export function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;

  const expiresAtMs = payload.exp * 1000;
  return Date.now() >= expiresAtMs - TOKEN_REFRESH_BUFFER_MS;
}

export function isExpiredErrorMessage(message = "") {
  return message.toLowerCase().includes("expired");
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export async function refreshAuthToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = runRefreshAuthToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function runRefreshAuthToken() {
  const [settings, currentAuth] = await Promise.all([getSettings(), getAuth()]);
  const previousToken = currentAuth?.token || "";
  const authUrl = new URL("/extension-auth", settings.webAppUrl);
  authUrl.searchParams.set("extensionId", chrome.runtime.id);
  authUrl.searchParams.set("silent", "true");

  let authTabId = null;
  const waitForToken = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Session refresh timed out. Sign in again."));
    }, 30000);

    function cleanup() {
      clearTimeout(timeout);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    }

    function handleStorageChange(changes, areaName) {
      if (areaName !== "local" || !changes.midas_auth?.newValue?.token) return;
      const nextAuth = changes.midas_auth.newValue;
      if (nextAuth.token === previousToken) return;
      cleanup();
      resolve(nextAuth);
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
  });

  const tab = await chrome.tabs.create({ url: authUrl.toString(), active: false });
  authTabId = tab.id;

  try {
    const auth = await waitForToken;
    if (authTabId) {
      await chrome.tabs.remove(authTabId).catch(() => null);
    }
    return auth;
  } catch (error) {
    if (authTabId) {
      await chrome.tabs.update(authTabId, { active: true }).catch(() => null);
    }
    throw error;
  }
}
