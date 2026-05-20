chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "MIDAS_CAPTURE_PAGE") return false;

  sendResponse({
    url: window.location.href,
    title: document.title,
    text: extractVisibleText(),
  });
  return true;
});

function extractVisibleText() {
  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS"]);
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ignoredTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    },
  );

  const chunks = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.replace(/\s+/g, " ").trim();
    if (text) chunks.push(text);
  }

  return chunks.join("\n").slice(0, 50000);
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
