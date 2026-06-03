chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "MIDAS_CAPTURE_PAGE") return false;

  const capture = capturePageText();
  sendResponse({
    url: window.location.href,
    title: document.title,
    text: capture.text,
    capture_source: capture.source,
    greenhouse: getGreenhouseContext(),
  });
  return true;
});

function capturePageText() {
  const candidates = getContentCandidates();
  const captures = candidates
    .map((root) => ({
      root,
      text: extractVisibleText(root),
      source: describeRoot(root),
    }))
    .filter((capture) => capture.text.length > 0)
    .sort((left, right) => scoreCapture(right) - scoreCapture(left));

  const best = captures[0];
  if (best && best.text.length >= 160) {
    return { text: best.text, source: best.source };
  }

  return { text: extractVisibleText(document.body), source: "body" };
}

function getContentCandidates() {
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
    roots.push(...document.querySelectorAll(selector));
  }
  roots.push(document.body);

  return [...new Set(roots)].filter((root) => root && isVisible(root));
}

function extractVisibleText(root = document.body) {
  const renderedText = normalizeText(root.innerText || "");
  if (renderedText) return renderedText.slice(0, 50000);

  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS"]);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ignoredTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (!hasVisibleAncestor(parent, root)) return NodeFilter.FILTER_REJECT;
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

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function describeRoot(root) {
  if (root === document.body) return "body";
  const tag = root.tagName.toLowerCase();
  if (root.id) return `${tag}#${root.id}`;
  const className = typeof root.className === "string"
    ? root.className.trim().split(/\s+/).slice(0, 2).join(".")
    : "";
  return className ? `${tag}.${className}` : tag;
}

function scoreCapture(capture) {
  const text = capture.text.toLowerCase();
  let score = Math.min(capture.text.length, 50000);
  if (capture.root === document.body) score -= 500;
  if (text.includes("job description")) score += 3000;
  if (text.includes("apply for this job") || text.includes("apply now")) score += 2500;
  if (text.includes("responsibilities")) score += 1500;
  if (text.includes("qualifications") || text.includes("requirements")) score += 1500;
  return score;
}

function hasVisibleAncestor(element, root) {
  let current = element;
  while (current && current !== root.parentElement) {
    if (!isVisible(current, { allowZeroRect: current === root })) return false;
    if (current === root) return true;
    current = current.parentElement;
  }
  return true;
}

function isVisible(element, options = {}) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  if (style.display === "contents") return true;
  const rect = element.getBoundingClientRect();
  return options.allowZeroRect || (rect.width > 0 && rect.height > 0);
}

function getGreenhouseContext() {
  const pageUrl = new URL(window.location.href);
  const jobId = pageUrl.searchParams.get("gh_jid") || pageUrl.searchParams.get("token") || "";
  const boardToken = findGreenhouseBoardToken();
  if (!jobId && !boardToken) return null;

  return {
    job_id: jobId,
    board_token: boardToken,
  };
}

function findGreenhouseBoardToken() {
  const attrs = ["src", "href", "data-src"];
  const elements = document.querySelectorAll("script, iframe, a");
  for (const element of elements) {
    for (const attr of attrs) {
      const value = element.getAttribute(attr);
      const token = extractGreenhouseBoardToken(value);
      if (token) return token;
    }
  }
  return "";
}

function extractGreenhouseBoardToken(value) {
  if (!value || !value.includes("greenhouse")) return "";
  try {
    const url = new URL(value, window.location.href);
    return url.searchParams.get("for") || "";
  } catch {
    const match = value.match(/[?&]for=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }
}
