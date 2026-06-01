import { isExpiredErrorMessage, isTokenExpired, refreshAuthToken } from "./auth.js";
import { validateJobPage } from "./jobPageValidation.js";
import { clearAuth, getAuth, getSettings } from "./storage.js";

export async function apiRequest(path, options = {}, canRefresh = true) {
  const settings = await getSettings();
  let auth = await getAuth();

  if (canRefresh && auth?.token && isTokenExpired(auth.token)) {
    auth = await refreshAuthToken();
  }

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
    if (
      res.status === 401 &&
      canRefresh &&
      auth?.token &&
      (isTokenExpired(auth.token) || isExpiredErrorMessage(body.detail))
    ) {
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
  const rawText = buildAnalysisText(page);
  const validation = validateJobPage(rawText, sourceUrl);
  if (!validation.isJobPage) {
    throw new Error(`${validation.reason}. Open a page with a full job description.`);
  }

  return apiRequest("/jobs/analyze", {
    method: "POST",
    body: JSON.stringify({
      raw_text: rawText,
      source_url: sourceUrl,
    }),
  });
}

export async function createApplicationForJobWithMatch(job, resume, matchScore = null) {
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
      resume_id: resume?.id,
      match_score: matchScore?.match_score ?? undefined,
      match_explanation: matchScore?.match_explanation ?? undefined,
    }),
  });
}

export async function getResumeMatchScores(jobId) {
  return apiRequest(`/jobs/${jobId}/resume-match-scores`);
}

export async function getJob(jobId) {
  return apiRequest(`/jobs/${jobId}`);
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
