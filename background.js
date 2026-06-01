import {
  clearAuth,
  getAuth,
  getAuthStatus,
  getCachedResumes,
  getSettings,
  saveAuth,
  saveResumes,
  setAuthStatus,
} from "./storage.js";
import {
  createApplicationForJobWithMatch,
  createJobFromPage,
  getJob,
  getResumeMatchScores,
  syncResumes,
} from "./api.js";

const MATCH_STATUS_POLL_INTERVAL_MS = 2500;
const MATCH_STATUS_TIMEOUT_MS = 60000;

let currentJob = null;
let currentMatchScores = [];
let currentMatchStatus = "idle";
let currentMatchStatusMessage = "";
let matchStatusTimer = null;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== "MIDAS_AUTH_TOKEN") return false;

  saveAuth({
    token: message.token,
    profileId: message.profileId || null,
    profileName: message.profileName || null,
    user: message.user || null,
    receivedAt: Date.now(),
  })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "GET_STATE":
      return getState();
    case "SIGN_IN":
      return startSignIn();
    case "SIGN_OUT":
      await clearAuth();
      currentJob = null;
      currentMatchScores = [];
      resetMatchStatus();
      return getState();
    case "SYNC_RESUMES":
      return refreshResumes();
    case "CREATE_JOB":
      return createJob();
    case "CREATE_APPLICATION":
      return createApplication(message.resumeId);
    default:
      throw new Error("Unknown extension action");
  }
}

async function getState() {
  const [auth, authStatus, resumes, settings] = await Promise.all([
    getAuth(),
    getAuthStatus(),
    getCachedResumes(),
    getSettings(),
  ]);
  const activeUrl = await getActiveTabUrl();
  if (currentJob && !isSameUrl(currentJob.source_url, activeUrl)) {
    currentJob = null;
    currentMatchScores = [];
    resetMatchStatus();
  }

  return {
    signedIn: Boolean(auth?.token),
    auth,
    authStatus,
    resumes,
    lastJob: currentJob,
    matchScores: currentMatchScores,
    matchStatus: currentMatchStatus,
    matchStatusMessage: currentMatchStatusMessage,
    settings,
  };
}

async function startSignIn() {
  const settings = await getSettings();
  const authUrl = new URL("/extension-auth", settings.webAppUrl);
  authUrl.searchParams.set("extensionId", chrome.runtime.id);
  await setAuthStatus({
    state: "authenticating",
    message: "Waiting for sign in to finish...",
  });

  await chrome.tabs.create({ url: authUrl.toString() });
  return { opened: true };
}

async function refreshResumes() {
  const resumes = await syncResumes();
  await saveResumes(resumes);
  return resumes;
}

async function captureCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  }).catch(() => null);

  return chrome.tabs.sendMessage(tab.id, { type: "MIDAS_CAPTURE_PAGE" });
}

async function createJob() {
  const page = await captureCurrentPage();
  const job = await createJobFromPage(page);
  currentJob = job;
  currentMatchScores = [];
  startMatchScoreFlow(job.id);
  return job;
}

async function createApplication(resumeId) {
  const [activeUrl, resumes] = await Promise.all([getActiveTabUrl(), getCachedResumes()]);
  const lastJob = isSameUrl(currentJob?.source_url, activeUrl) ? currentJob : null;
  if (!lastJob) currentJob = null;
  if (!lastJob) throw new Error("Create a job first");

  const resume = resumes.find((item) => item.id === resumeId) || resumes[0];
  if (!resume) throw new Error("Upload at least one resume before creating applications");

  const matchScore = currentMatchScores.find((score) => score.resume_id === resume.id) || null;
  return createApplicationForJobWithMatch(lastJob, resume, matchScore);
}

async function safeGetResumeMatchScores(jobId) {
  try {
    return await getResumeMatchScores(jobId);
  } catch {
    return [];
  }
}

function startMatchScoreFlow(jobId) {
  resetMatchStatus();

  const initialStatus = currentJob?.embedding_status || "pending";
  if (initialStatus === "completed") {
    loadMatchScores(jobId);
    return;
  }
  if (initialStatus === "disabled") {
    setMatchStatus("disabled", "Matching is disabled for this environment.");
    return;
  }
  if (initialStatus === "failed") {
    setMatchStatus("failed", "Matching setup failed. You can still create an application.");
    return;
  }

  setMatchStatus("pending", "Preparing match scores in the background.");
  pollJobEmbeddingStatus(jobId, Date.now());
}

async function pollJobEmbeddingStatus(jobId, startedAt) {
  if (currentJob?.id !== jobId) return;
  if (Date.now() - startedAt > MATCH_STATUS_TIMEOUT_MS) {
    setMatchStatus("timeout", "Match scores are still processing. You can create an application now.");
    return;
  }

  try {
    const job = await getJob(jobId);
    if (currentJob?.id !== jobId) return;
    currentJob = job;

    if (job.embedding_status === "completed") {
      await loadMatchScores(jobId);
      return;
    }
    if (job.embedding_status === "failed") {
      setMatchStatus("failed", "Matching setup failed. You can still create an application.");
      return;
    }
    if (job.embedding_status === "disabled") {
      setMatchStatus("disabled", "Matching is disabled for this environment.");
      return;
    }

    const message = job.embedding_status === "processing"
      ? "Calculating job match data in the background."
      : "Preparing match scores in the background.";
    setMatchStatus(job.embedding_status || "pending", message);
  } catch {
    setMatchStatus("pending", "Preparing match scores in the background.");
  }

  matchStatusTimer = setTimeout(
    () => pollJobEmbeddingStatus(jobId, startedAt),
    MATCH_STATUS_POLL_INTERVAL_MS,
  );
}

async function loadMatchScores(jobId) {
  setMatchStatus("loading_scores", "Loading resume match scores.");
  const scores = await safeGetResumeMatchScores(jobId);
  if (currentJob?.id !== jobId) return;
  currentMatchScores = scores;
  if (scores.some((score) => score.match_score != null)) {
    setMatchStatus("completed", "Best matching resume selected automatically.");
    return;
  }
  setMatchStatus("unavailable", "Match scores are unavailable for these resumes.");
}

function setMatchStatus(status, message) {
  currentMatchStatus = status;
  currentMatchStatusMessage = message;
}

function resetMatchStatus() {
  if (matchStatusTimer) {
    clearTimeout(matchStatusTimer);
    matchStatusTimer = null;
  }
  currentMatchStatus = "idle";
  currentMatchStatusMessage = "";
}

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || "";
}

function isSameUrl(left, right) {
  if (!left || !right) return false;
  return normalizeUrl(left) === normalizeUrl(right);
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url || "";
  }
}
