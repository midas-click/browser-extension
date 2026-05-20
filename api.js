import { getAuth, getSettings } from "./storage.js";

export async function apiRequest(path, options = {}) {
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
  const fallback = parseTitle(page.title, page.url);
  return apiRequest("/jobs", {
    method: "POST",
    body: JSON.stringify({
      title: fallback.title,
      company: fallback.company,
      description: page.text,
      location: null,
      remote: null,
      salary_range: null,
      source_url: sourceUrl,
      tags: [],
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

function parseTitle(title, url) {
  const cleanTitle = (title || "Untitled Job").trim();
  const parts = cleanTitle.split(/\s[-|@]\s/).map((part) => part.trim()).filter(Boolean);
  const host = safeHostname(url);
  return {
    title: parts[0] || cleanTitle,
    company: parts[1] || host || "Unknown",
  };
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown";
  }
}
