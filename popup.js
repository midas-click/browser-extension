const els = {
  authBadge: document.querySelector("#authBadge"),
  signedOut: document.querySelector("#signedOut"),
  signedIn: document.querySelector("#signedIn"),
  signInBtn: document.querySelector("#signInBtn"),
  signOutBtn: document.querySelector("#signOutBtn"),
  syncBtn: document.querySelector("#syncBtn"),
  createJobBtn: document.querySelector("#createJobBtn"),
  createApplicationBtn: document.querySelector("#createApplicationBtn"),
  resumeSelect: document.querySelector("#resumeSelect"),
  matchStatus: document.querySelector("#matchStatus"),
  jobPreview: document.querySelector("#jobPreview"),
  jobTitle: document.querySelector("#jobTitle"),
  jobMeta: document.querySelector("#jobMeta"),
  status: document.querySelector("#status"),
};

let state = null;

els.signInBtn.addEventListener("click", () => run("Opening sign in...", "SIGN_IN"));
els.signOutBtn.addEventListener("click", () => run("Signing out...", "SIGN_OUT"));
els.syncBtn.addEventListener("click", syncResumes);
els.createJobBtn.addEventListener("click", createJob);
els.createApplicationBtn.addEventListener("click", createApplication);
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
  setStatus("Capturing page and analyzing job...");
  try {
    const job = await send({ type: "CREATE_JOB" });
    state.lastJob = job;
    await refreshState();
    render();
    setStatus("Job created. Resume match scores requested.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function createApplication() {
  const resumeId = els.resumeSelect.value;
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
  els.authBadge.textContent = signedIn ? "Signed in" : "Signed out";
  els.authBadge.className = signedIn ? "badge ok" : "badge muted";

  const resumes = state?.resumes || [];
  const matchScores = state?.matchScores || [];
  const scoreByResumeId = new Map(matchScores.map((score) => [score.resume_id, score]));
  const bestResumeId = getBestResumeId(matchScores);
  els.resumeSelect.innerHTML = "";
  for (const resume of resumes) {
    const score = scoreByResumeId.get(resume.id);
    const option = document.createElement("option");
    option.value = resume.id;
    option.textContent = formatResumeOption(resume, score);
    els.resumeSelect.append(option);
  }
  if (bestResumeId) {
    els.resumeSelect.value = bestResumeId;
  }
  if (!resumes.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No resumes synced";
    els.resumeSelect.append(option);
  }

  const job = state?.lastJob;
  els.jobPreview.classList.toggle("hidden", !job);
  if (job) {
    els.jobTitle.textContent = job.title;
    els.jobMeta.textContent = [job.company, formatSalary(job)].filter(Boolean).join(" - ");
  }
  els.matchStatus.textContent = getMatchStatusText(job, resumes, matchScores);

  els.createApplicationBtn.disabled = !job || !resumes.length;
}

function setBusy(isBusy) {
  els.createJobBtn.disabled = isBusy;
  els.createApplicationBtn.disabled = isBusy || !state?.lastJob || !(state?.resumes || []).length;
  els.syncBtn.disabled = isBusy;
}

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${kind}`;
}

function formatSalary(job) {
  return job.salary_range || job.salary || "";
}

function formatResumeOption(resume, score) {
  if (!score) return resume.original_filename;
  if (score.match_score == null) return `${resume.original_filename} - match pending`;
  return `${resume.original_filename} - ${score.match_score}% match`;
}

function getBestResumeId(matchScores) {
  const bestScore = [...matchScores]
    .filter((score) => score.match_score != null)
    .sort((left, right) => right.match_score - left.match_score)[0];
  return bestScore?.resume_id || "";
}

function getMatchStatusText(job, resumes, matchScores) {
  if (!job || !resumes.length) return "";
  if (!matchScores.length) return "Match scores unavailable until embeddings are ready.";
  if (matchScores.some((score) => score.match_score != null)) {
    return "Best matching resume selected automatically.";
  }
  return "Match scores are pending while embeddings finish.";
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
