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
  setStatus("Capturing page and creating job...");
  try {
    const job = await send({ type: "CREATE_JOB" });
    state.lastJob = job;
    render();
    setStatus("Job created. Choose a resume and create the application.", "ok");
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
  els.resumeSelect.innerHTML = "";
  for (const resume of resumes) {
    const option = document.createElement("option");
    option.value = resume.id;
    option.textContent = resume.original_filename;
    els.resumeSelect.append(option);
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
    els.jobMeta.textContent = [job.company, job.source_url].filter(Boolean).join(" · ");
  }

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
