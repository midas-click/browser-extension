import { isExpiredErrorMessage, isTokenExpired, refreshAuthToken } from "./auth.js";
import { validateJobPage } from "./jobPageValidation.js";
import { clearAuth, getAuth, getSettings } from "./storage.js";

export async function apiRequest(path, options = {}, canRefresh = true) {
  const settings = await getSettings();
  const { skipAuth = false, ...fetchOptions } = options;
  let auth = skipAuth ? null : await getAuth();

  if (!skipAuth && canRefresh && auth?.token && isTokenExpired(auth.token)) {
    auth = await refreshAuthToken();
  }

  const headers = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers || {}),
  };

  if (auth?.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }
  if (auth?.profileId) {
    headers["X-Profile-Id"] = auth.profileId;
  }

  const res = await fetch(`${settings.apiBaseUrl}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (
      res.status === 401 &&
      !skipAuth &&
      canRefresh &&
      auth?.token &&
      (isTokenExpired(auth.token) || isExpiredErrorMessage(body.detail))
    ) {
      await refreshAuthToken();
      return apiRequest(path, options, false);
    }
    if (res.status === 401) {
      await clearAuth();
      throw new Error(formatApiErrorDetail(body.detail, "Session expired. Sign in again."));
    }
    throw new Error(formatApiErrorDetail(body.detail, `HTTP ${res.status}`));
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function syncResumes() {
  return apiRequest("/resumes");
}

export async function createJobFromPage(page) {
  const sourceUrl = normalizeUrl(page.url);
  const greenhouseText = await fetchGreenhouseJobText(page);
  const rawText = buildAnalysisText(page, greenhouseText);
  const validation = validateJobPage(rawText, sourceUrl);
  if (!validation.isJobPage) {
    throw new Error(formatValidationError(validation, page));
  }

  return apiRequest("/jobs/analyze", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      raw_text: rawText,
      source_url: sourceUrl,
    }),
  }, false);
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

function buildAnalysisText(page, extraText = "") {
  return [
    `Page title: ${page.title || ""}`,
    `URL: ${page.url || ""}`,
    `Captured from: ${page.capture_source || "body"}`,
    page.greenhouse?.job_id ? `Greenhouse job id: ${page.greenhouse.job_id}` : "",
    "",
    page.text || "",
    extraText ? "\nGreenhouse embedded job content:" : "",
    extraText,
  ].join("\n").trim();
}

async function fetchGreenhouseJobText(page) {
  const jobId = page.greenhouse?.job_id || getQueryParam(page.url, "gh_jid");
  const boardToken = page.greenhouse?.board_token || inferGreenhouseBoardToken(page.url);
  if (!jobId || !boardToken) return "";

  const url = `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(boardToken)}&token=${encodeURIComponent(jobId)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const html = await response.text();
    return htmlToText(html).slice(0, 50000);
  } catch {
    return "";
  }
}

function getQueryParam(url, key) {
  try {
    return new URL(url).searchParams.get(key) || "";
  } catch {
    return "";
  }
}

function inferGreenhouseBoardToken(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const [subdomain] = hostname.split(".");
    return subdomain || "";
  } catch {
    return "";
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function formatApiErrorDetail(detail, fallback) {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object") {
    const message = detail.message || detail.reason || fallback;
    const parts = [message];
    if (typeof detail.confidence === "number") {
      parts.push(`confidence ${Math.round(detail.confidence * 100)}%`);
    }
    if (Array.isArray(detail.signals) && detail.signals.length) {
      parts.push(`signals: ${detail.signals.slice(0, 5).join(", ")}`);
    }
    return parts.join(". ");
  }
  return fallback;
}

function formatValidationError(validation, page) {
  const parts = [
    validation.reason,
    `captured from ${page.capture_source || "body"}`,
    `${(page.text || "").length} chars`,
    `confidence ${Math.round(validation.confidence * 100)}%`,
  ];
  if (validation.signals?.length) {
    parts.push(`signals: ${validation.signals.slice(0, 5).join(", ")}`);
  }
  parts.push("Open a job posting or company careers page.");
  return parts.join(". ");
}
