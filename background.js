import {
  clearAuth,
  getAuth,
  getCachedResumes,
  getLastJob,
  getSettings,
  saveAuth,
  saveLastJob,
  saveResumes,
} from "./storage.js";
import {
  createApplicationForJob,
  createJobFromPage,
  syncResumes,
} from "./api.js";

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== "MIDAS_AUTH_TOKEN") return false;

  saveAuth({
    token: message.token,
    profileId: message.profileId || null,
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
      return getState();
    case "SYNC_RESUMES":
      return refreshResumes();
    case "CAPTURE_PAGE":
      return captureCurrentPage();
    case "CREATE_JOB":
      return createJob();
    case "CREATE_APPLICATION":
      return createApplication(message.resumeId);
    default:
      throw new Error("Unknown extension action");
  }
}

async function getState() {
  const [auth, resumes, lastJob, settings] = await Promise.all([
    getAuth(),
    getCachedResumes(),
    getLastJob(),
    getSettings(),
  ]);
  return {
    signedIn: Boolean(auth?.token),
    auth,
    resumes,
    lastJob,
    settings,
  };
}

async function startSignIn() {
  const settings = await getSettings();
  const authUrl = new URL("/extension-auth", settings.webAppUrl);
  authUrl.searchParams.set("extensionId", chrome.runtime.id);

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
  await saveLastJob(job);
  return job;
}

async function createApplication(resumeId) {
  const [lastJob, resumes] = await Promise.all([getLastJob(), getCachedResumes()]);
  if (!lastJob) throw new Error("Create a job first");

  const resume = resumes.find((item) => item.id === resumeId) || resumes[0];
  if (!resume) throw new Error("Upload at least one resume before creating applications");

  return createApplicationForJob(lastJob, resume);
}
