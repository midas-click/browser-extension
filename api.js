import { refreshAuthToken } from "./auth.js";
import { clearAuth, getAuth, getSettings } from "./storage.js";

export async function apiRequest(path, options = {}, canRefresh = true) {
  const settings = await getSettings();
  const auth = await getAuth();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (auth?.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }
  if (auth?.profileId) {
    headers["X-Profile-Id"] = auth.profileId;
  }

  const res = await fetch(`${settings.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && canRefresh) {
      await refreshAuthToken();
      return apiRequest(path, options, false);
    }
    if (res.status === 401) {
      await clearAuth();
      throw new Error(body.detail || "Session expired. Sign in again.");
    }
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function syncResumes() {
  return apiRequest("/resumes");
}

export async function createJobFromPage(page) {
  const sourceUrl = normalizeUrl(page.url);
  return apiRequest("/jobs/analyze", {
    method: "POST",
    body: JSON.stringify({
      raw_text: buildAnalysisText(page),
      source_url: sourceUrl,
    }),
  });
}

export async function createApplicationForJob(job, resume) {
  return apiRequest("/applications", {
    method: "POST",
    body: JSON.stringify({
      job_id: job.id,
      job_title: job.title,
      company: job.company,
      location: job.location || "",
      source_url: job.source_url || undefined,
      salary_expectation: job.salary_range || undefined,
      tags: job.tags || [],
      notes: job.description || undefined,
      resume_id: resume?.id,
    }),
  });
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function buildAnalysisText(page) {
  return [
    `Page title: ${page.title || ""}`,
    `URL: ${page.url || ""}`,
    "",
    page.text || "",
  ].join("\n").trim();
}
