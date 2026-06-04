import { validateJobPage } from "./jobPageValidation.js";

/**
 * Portable job capture and create-job client.
 *
 * Use captureJobPageFromDocument() in a content script/page context.
 * Use createJobFromCapturedPage() in a service worker/background script.
 */

export function captureJobPageFromDocument(doc = document, pageUrl = window.location.href) {
  const capture = capturePageText(doc);
  return {
    url: pageUrl,
    title: doc.title,
    text: capture.text,
    capture_source: capture.source,
    greenhouse: getGreenhouseContext(doc, pageUrl),
  };
}

export async function createJobFromCapturedPage({
  apiBaseUrl,
  page,
  fetchImpl = fetch,
}) {
  if (!apiBaseUrl) throw new Error("apiBaseUrl is required");
  if (!page?.url) throw new Error("Captured page URL is required");

  const sourceUrl = normalizeUrl(page.url);
  const greenhouseText = await fetchGreenhouseJobText(page, fetchImpl);
  const rawText = buildAnalysisText(page, greenhouseText);
  const validation = validateJobPage(rawText, sourceUrl);

  if (!validation.isJobPage) {
    throw new Error(formatValidationError(validation, page));
  }

  const response = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/jobs/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      raw_text: rawText,
      source_url: sourceUrl,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiErrorDetail(body.detail, `HTTP ${response.status}`));
  }

  return response.json();
}

export function buildAnalysisText(page, extraText = "") {
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

function capturePageText(doc) {
  const candidates = getContentCandidates(doc);
  const captures = candidates
    .map((root) => ({
      root,
      text: extractVisibleText(root, doc),
      source: describeRoot(root, doc),
    }))
    .filter((capture) => capture.text.length > 0)
    .sort((left, right) => scoreCapture(right, doc) - scoreCapture(left, doc));

  const best = captures[0];
  if (best && best.text.length >= 160) {
    return { text: best.text, source: best.source };
  }

  return { text: extractVisibleText(doc.body, doc), source: "body" };
}

function getContentCandidates(doc) {
  const selectors = [
    "main",
    "[role='main']",
    "article",
    "[id*='job' i]",
    "[class*='job' i]",
    "[id*='career' i]",
    "[class*='career' i]",
    "[id*='greenhouse' i]",
    "[class*='greenhouse' i]",
    "[id*='grnhse' i]",
    "[class*='grnhse' i]",
  ];

  const roots = [];
  for (const selector of selectors) {
    roots.push(...doc.querySelectorAll(selector));
  }
  roots.push(doc.body);

  return [...new Set(roots)].filter((root) => root && isVisible(root, { doc }));
}

function extractVisibleText(root, doc) {
  if (!root) return "";

  const renderedText = normalizeText(root.innerText || "");
  if (renderedText) return renderedText.slice(0, 50000);

  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS"]);
  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ignoredTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (!hasVisibleAncestor(parent, root, doc)) return NodeFilter.FILTER_REJECT;
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    },
  );

  const chunks = [];
  while (walker.nextNode()) {
    const text = normalizeText(walker.currentNode.textContent || "");
    if (text) chunks.push(text);
  }

  return chunks.join("\n").slice(0, 50000);
}

function getGreenhouseContext(doc, pageUrl) {
  const parsedUrl = new URL(pageUrl);
  const jobId = parsedUrl.searchParams.get("gh_jid") || parsedUrl.searchParams.get("token") || "";
  const boardToken = findGreenhouseBoardToken(doc, pageUrl);
  if (!jobId && !boardToken) return null;

  return {
    job_id: jobId,
    board_token: boardToken,
  };
}

function findGreenhouseBoardToken(doc, pageUrl) {
  const attrs = ["src", "href", "data-src"];
  const elements = doc.querySelectorAll("script, iframe, a");
  for (const element of elements) {
    for (const attr of attrs) {
      const value = element.getAttribute(attr);
      const token = extractGreenhouseBoardToken(value, pageUrl);
      if (token) return token;
    }
  }
  return "";
}

function extractGreenhouseBoardToken(value, pageUrl) {
  if (!value || !value.includes("greenhouse")) return "";
  try {
    const url = new URL(value, pageUrl);
    return url.searchParams.get("for") || "";
  } catch {
    const match = value.match(/[?&]for=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }
}

async function fetchGreenhouseJobText(page, fetchImpl) {
  const jobId = page.greenhouse?.job_id || getQueryParam(page.url, "gh_jid");
  const boardToken = page.greenhouse?.board_token || inferGreenhouseBoardToken(page.url);
  if (!jobId || !boardToken) return "";

  const url = `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(boardToken)}&token=${encodeURIComponent(jobId)}`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return "";
    const html = await response.text();
    return htmlToText(html).slice(0, 50000);
  } catch {
    return "";
  }
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

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function describeRoot(root, doc) {
  if (root === doc.body) return "body";
  const tag = root.tagName.toLowerCase();
  if (root.id) return `${tag}#${root.id}`;
  const className = typeof root.className === "string"
    ? root.className.trim().split(/\s+/).slice(0, 2).join(".")
    : "";
  return className ? `${tag}.${className}` : tag;
}

function scoreCapture(capture, doc) {
  const text = capture.text.toLowerCase();
  let score = Math.min(capture.text.length, 50000);
  if (capture.root === doc.body) score -= 500;
  if (text.includes("job description")) score += 3000;
  if (text.includes("apply for this job") || text.includes("apply now")) score += 2500;
  if (text.includes("responsibilities")) score += 1500;
  if (text.includes("qualifications") || text.includes("requirements")) score += 1500;
  return score;
}

function hasVisibleAncestor(element, root, doc) {
  let current = element;
  while (current && current !== root.parentElement) {
    if (!isVisible(current, { doc, allowZeroRect: current === root })) return false;
    if (current === root) return true;
    current = current.parentElement;
  }
  return true;
}

function isVisible(element, { allowZeroRect = false } = {}) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  if (style.display === "contents") return true;
  const rect = element.getBoundingClientRect();
  return allowZeroRect || (rect.width > 0 && rect.height > 0);
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
