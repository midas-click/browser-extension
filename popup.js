const els = {
  authBadge: document.querySelector("#authBadge"),
  signedOut: document.querySelector("#signedOut"),
  signedIn: document.querySelector("#signedIn"),
  signInBtn: document.querySelector("#signInBtn"),
  signOutBtn: document.querySelector("#signOutBtn"),
  syncBtn: document.querySelector("#syncBtn"),
  createJobBtn: document.querySelector("#createJobBtn"),
  createApplicationBtn: document.querySelector("#createApplicationBtn"),
  jobStatus: document.querySelector("#jobStatus"),
  resumeDropdown: document.querySelector("#resumeDropdown"),
  resumeDropdownBtn: document.querySelector("#resumeDropdownBtn"),
  resumeOptions: document.querySelector("#resumeOptions"),
  selectedResumeName: document.querySelector("#selectedResumeName"),
  matchStatus: document.querySelector("#matchStatus"),
  jobPreview: document.querySelector("#jobPreview"),
  jobTitle: document.querySelector("#jobTitle"),
  jobMeta: document.querySelector("#jobMeta"),
  status: document.querySelector("#status"),
};

let state = null;
let selectedResumeId = "";
let resumeDropdownOpen = false;
let stateRefreshTimer = null;
let resumeManuallySelected = false;
let busy = false;

els.signInBtn.addEventListener("click", () => run("Opening sign in...", "SIGN_IN"));
els.signOutBtn.addEventListener("click", signOut);
els.syncBtn.addEventListener("click", syncResumes);
els.createJobBtn.addEventListener("click", createJob);
els.createApplicationBtn.addEventListener("click", createApplication);
els.resumeDropdownBtn.addEventListener("click", toggleResumeDropdown);
document.addEventListener("click", closeResumeDropdownOnOutsideClick);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.midas_auth) {
    refreshState();
  }
});

init();

async function init() {
  await refreshState();
  if (state?.signedIn) {
    await syncResumes({ quiet: true });
  }
}

async function refreshState() {
  const response = await send({ type: "GET_STATE" });
  state = response;
  render();
}

async function syncResumes(options = {}) {
  if (!options.quiet) setStatus("Syncing resumes...");
  try {
    const resumes = await send({ type: "SYNC_RESUMES" });
    state.resumes = resumes;
    render();
    if (!options.quiet) setStatus("Resumes synced.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function createJob() {
  setBusy(true);
  setJobStatus("Capturing page and analyzing job...", "info");
  setStatus("");
  try {
    const job = await send({ type: "CREATE_JOB" });
    state.lastJob = job;
    resumeManuallySelected = false;
    await refreshState();
    render();
    setJobStatus("Job created.", "ok");
  } catch (error) {
    setJobStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function createApplication() {
  const resumeId = selectedResumeId;
  setBusy(true);
  setStatus("Creating application...");
  try {
    await send({ type: "CREATE_APPLICATION", resumeId });
    setStatus("Application created.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function signOut() {
  setStatus("Signing out...");
  try {
    await send({ type: "SIGN_OUT" });
    await refreshState();
    setStatus("");
    setJobStatus("");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function run(status, type) {
  setStatus(status);
  try {
    await send({ type });
    await refreshState();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function render() {
  const signedIn = Boolean(state?.signedIn);
  els.signedOut.classList.toggle("hidden", signedIn);
  els.signedIn.classList.toggle("hidden", !signedIn);
  els.authBadge.textContent = signedIn ? getSignedInLabel(state?.auth) : "Signed out";
  els.authBadge.className = signedIn ? "badge ok" : "badge muted";

  const resumes = state?.resumes || [];
  const matchScores = state?.matchScores || [];
  const scoreByResumeId = new Map(matchScores.map((score) => [score.resume_id, score]));
  const bestResumeId = getBestResumeId(matchScores);

  if (!resumes.length) {
    selectedResumeId = "";
    resumeDropdownOpen = false;
    resumeManuallySelected = false;
  } else if (bestResumeId && !resumeManuallySelected) {
    selectedResumeId = bestResumeId;
  } else if (!selectedResumeId && resumes.length) {
    selectedResumeId = resumes[0].id;
  } else if (selectedResumeId && !resumes.some((resume) => resume.id === selectedResumeId)) {
    selectedResumeId = resumes[0]?.id || "";
    resumeManuallySelected = false;
  }

  renderResumeDropdown(resumes, scoreByResumeId);

  const job = state?.lastJob;
  els.jobPreview.classList.toggle("hidden", !job);
  if (job) {
    els.jobTitle.textContent = job.title;
    els.jobMeta.textContent = [job.company, formatSalary(job)].filter(Boolean).join(" - ");
  }
  els.matchStatus.textContent = getMatchStatusText(job, resumes, matchScores);
  els.matchStatus.className = `match-status ${getMatchStatusClass(state?.matchStatus)}`;

  els.createJobBtn.disabled = busy || Boolean(job);
  els.createApplicationBtn.disabled = busy || !job || !resumes.length;
  scheduleStateRefreshIfNeeded();
}

function setBusy(isBusy) {
  busy = isBusy;
  const hasJob = Boolean(state?.lastJob);
  const hasResumes = Boolean((state?.resumes || []).length);
  els.createJobBtn.disabled = busy || hasJob;
  els.createApplicationBtn.disabled = busy || !hasJob || !hasResumes;
  els.syncBtn.disabled = busy;
}

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${kind}`;
}

function setJobStatus(message, kind = "") {
  els.jobStatus.textContent = message || "";
  els.jobStatus.className = `section-status ${kind}`;
}

function formatSalary(job) {
  return job.salary_range || job.salary || "";
}

function getSignedInLabel(auth) {
  const name = auth?.profileName || auth?.user?.name || auth?.user?.email || "";
  return name ? `Signed in as ${name}` : "Signed in";
}

function renderResumeDropdown(resumes, scoreByResumeId) {
  const selectedResume = resumes.find((resume) => resume.id === selectedResumeId);

  els.resumeDropdownBtn.disabled = resumes.length === 0;
  els.selectedResumeName.textContent = selectedResume?.original_filename || "No resumes synced";
  els.resumeDropdownBtn.classList.toggle("open", resumeDropdownOpen);
  els.resumeDropdownBtn.setAttribute("aria-expanded", resumeDropdownOpen ? "true" : "false");
  els.resumeOptions.classList.toggle("hidden", !resumeDropdownOpen);
  els.resumeOptions.innerHTML = "";

  for (const resume of resumes) {
    const score = scoreByResumeId.get(resume.id);
    const option = document.createElement("button");
    option.type = "button";
    option.className = `resume-option${resume.id === selectedResumeId ? " active" : ""}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", resume.id === selectedResumeId ? "true" : "false");
    option.dataset.resumeId = resume.id;

    const main = document.createElement("span");
    main.className = "resume-option-main";

    const name = document.createElement("span");
    name.className = "resume-option-name";
    name.textContent = resume.original_filename;

    main.append(name);
    option.append(main);
    if (score?.match_score != null) {
      const chip = document.createElement("span");
      chip.className = "resume-score";
      chip.textContent = formatResumeScoreChip(score);
      option.append(chip);
    }
    option.addEventListener("click", () => selectResume(resume.id));
    els.resumeOptions.append(option);
  }
}

function selectResume(resumeId) {
  selectedResumeId = resumeId;
  resumeManuallySelected = true;
  resumeDropdownOpen = false;
  render();
}

function toggleResumeDropdown(event) {
  event.stopPropagation();
  if (els.resumeDropdownBtn.disabled) return;
  resumeDropdownOpen = !resumeDropdownOpen;
  render();
}

function closeResumeDropdownOnOutsideClick(event) {
  if (!resumeDropdownOpen || els.resumeDropdown.contains(event.target)) return;
  resumeDropdownOpen = false;
  render();
}

function formatResumeScoreChip(score) {
  return `${score.match_score}%`;
}

function getBestResumeId(matchScores) {
  const bestScore = [...matchScores]
    .filter((score) => score.match_score != null)
    .sort((left, right) => right.match_score - left.match_score)[0];
  return bestScore?.resume_id || "";
}

function getMatchStatusText(job, resumes, matchScores) {
  if (!job || !resumes.length) return "";
  if (state?.matchStatusMessage) return state.matchStatusMessage;
  if (matchScores.some((score) => score.match_score != null)) {
    return "Best matching resume selected automatically.";
  }
  return "";
}

function scheduleStateRefreshIfNeeded() {
  if (stateRefreshTimer) {
    window.clearTimeout(stateRefreshTimer);
    stateRefreshTimer = null;
  }

  if (!shouldRefreshStateForMatchStatus(state?.matchStatus)) return;
  stateRefreshTimer = window.setTimeout(refreshState, 1500);
}

function shouldRefreshStateForMatchStatus(status) {
  return ["pending", "processing", "loading_scores"].includes(status);
}

function getMatchStatusClass(status) {
  if (["completed"].includes(status)) return "success";
  if (["failed"].includes(status)) return "error";
  if (["timeout", "unavailable", "disabled"].includes(status)) return "warning";
  if (["pending", "processing", "loading_scores"].includes(status)) return "info";
  return "";
}

function send(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Extension action failed"));
        return;
      }
      resolve(response.result);
    });
  });
}
