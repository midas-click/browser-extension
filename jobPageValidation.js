const JOB_BOARD_DOMAINS = new Set([
  "ashbyhq.com",
  "bamboohr.com",
  "boards.greenhouse.io",
  "careers.microsoft.com",
  "careers.google.com",
  "greenhouse.io",
  "indeed.com",
  "jobs.ashbyhq.com",
  "jobs.lever.co",
  "jobs.smartrecruiters.com",
  "applytojob.com",
  "icims.com",
  "jobvite.com",
  "linkedin.com",
  "myworkdayjobs.com",
  "recruitee.com",
  "smartrecruiters.com",
  "workable.com",
]);

const JOB_SECTION_PHRASES = new Set([
  "about the role",
  "about this role",
  "about the job",
  "about the team",
  "job summary",
  "role overview",
  "responsibilities",
  "what you'll do",
  "what you will do",
  "you will",
  "what we're looking for",
  "what we are looking for",
  "who you are",
  "qualifications",
  "requirements",
  "minimum qualifications",
  "preferred qualifications",
  "nice to have",
  "skills",
  "experience",
  "benefits",
  "perks",
  "compensation",
  "salary",
]);

const JOB_ACTION_PHRASES = new Set([
  "apply now",
  "apply for this job",
  "submit application",
  "submit your application",
  "job description",
  "job details",
  "job type",
  "employment type",
  "full-time",
  "part-time",
  "contract",
  "remote",
  "hybrid",
  "onsite",
  "equal opportunity",
]);

const HIRING_TERMS = new Set([
  "engineer",
  "developer",
  "manager",
  "designer",
  "analyst",
  "specialist",
  "coordinator",
  "associate",
  "director",
  "architect",
  "consultant",
  "representative",
  "sales",
  "executive",
  "technician",
  "administrator",
  "lead",
  "senior",
  "intern",
  "recruiter",
  "candidate",
  "applicant",
  "interview",
  "hiring",
]);

const NEGATIVE_PHRASES = new Set([
  "add to cart",
  "add to bag",
  "shopping cart",
  "checkout",
  "customer reviews",
  "product details",
  "product description",
  "related products",
  "subscribe to our newsletter",
  "leave a comment",
  "comments",
  "share this article",
  "read more",
  "privacy policy",
  "terms of service",
]);

const MIN_TEXT_LENGTH = 450;
const JOB_PAGE_THRESHOLD = 0.55;

export function validateJobPage(rawText, sourceUrl = "") {
  const text = normalizeText(rawText);
  const signals = [];
  let score = 0;
  const knownJobDomain = isKnownJobDomain(sourceUrl);

  if (knownJobDomain) {
    score += 0.3;
    signals.push("known job board domain");
  }

  if (text.length >= MIN_TEXT_LENGTH) {
    score += 0.15;
    signals.push("enough page text");
  } else if (text.length >= 180) {
    score += 0.05;
    signals.push("some page text");
  } else {
    signals.push("page text is too short");
  }

  const sectionMatches = countMatches(text, JOB_SECTION_PHRASES);
  if (sectionMatches) {
    score += Math.min(0.25, sectionMatches * 0.05);
    signals.push(`${sectionMatches} job section signals`);
  }

  const actionMatches = countMatches(text, JOB_ACTION_PHRASES);
  if (actionMatches) {
    score += Math.min(0.2, actionMatches * 0.04);
    signals.push(`${actionMatches} application/detail signals`);
  }

  const hiringMatches = countMatches(text, HIRING_TERMS);
  if (hiringMatches) {
    score += Math.min(0.15, hiringMatches * 0.025);
    signals.push(`${hiringMatches} hiring terms`);
  }

  if (hasSalarySignal(text)) {
    score += 0.08;
    signals.push("salary or compensation signal");
  }

  if (hasLocationSignal(text)) {
    score += 0.05;
    signals.push("location or remote signal");
  }

  const negativeMatches = countMatches(text, NEGATIVE_PHRASES);
  if (negativeMatches) {
    score -= Math.min(0.35, negativeMatches * 0.07);
    signals.push(`${negativeMatches} non-job page signals`);
  }

  const confidence = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  const signalCount = sectionMatches + actionMatches + hiringMatches;
  const hasRequiredContent =
    text.length >= MIN_TEXT_LENGTH ||
    sectionMatches + actionMatches >= 3 ||
    (knownJobDomain && text.length >= 180 && signalCount >= 2);
  const threshold = knownJobDomain ? 0.45 : JOB_PAGE_THRESHOLD;
  const isJobPage = confidence >= threshold && hasRequiredContent;

  return {
    isJobPage,
    confidence,
    reason: isJobPage
      ? "Page looks like a job description"
      : "This page does not look like a job description",
    signals,
  };
}

function normalizeText(text) {
  return (text || "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

function countMatches(text, phrases) {
  let matches = 0;
  for (const phrase of phrases) {
    if (text.includes(phrase)) matches += 1;
  }
  return matches;
}

function isKnownJobDomain(sourceUrl) {
  if (!sourceUrl) return false;
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
    for (const domain of JOB_BOARD_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function hasSalarySignal(text) {
  return text.includes("$") || text.includes("salary") || text.includes("compensation") || text.includes("pay range");
}

function hasLocationSignal(text) {
  return text.includes("location") || text.includes("remote") || text.includes("hybrid") || text.includes("onsite");
}
