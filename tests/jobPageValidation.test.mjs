import assert from "node:assert/strict";
import { test } from "node:test";

import { validateJobPage } from "../jobPageValidation.js";

const jobDescription = `
Senior Backend Engineer
About the role
Responsibilities include building APIs, owning production services, and improving data pipelines.
Qualifications include Python, MongoDB, distributed systems, and strong communication.
Benefits include health insurance, remote work, and salary range $140,000 - $180,000.
Apply for this job.
`.repeat(3);

// Accepts real job descriptions from known job board domains.
test("accepts a known job board page with strong job-description text", () => {
  const result = validateJobPage(jobDescription, "https://jobs.lever.co/midas/123");

  assert.equal(result.isJobPage, true);
  assert.ok(result.confidence >= 0.55);
  assert.ok(result.signals.includes("known job board domain"));
});

// Accepts job descriptions hosted on unknown company career pages.
test("accepts an unknown domain when the text has enough job signals", () => {
  const result = validateJobPage(jobDescription, "https://company.example/careers/backend-engineer");

  assert.equal(result.isJobPage, true);
});

// Rejects obvious shopping pages before they reach backend analysis.
test("rejects ecommerce pages with strong non-job signals", () => {
  const text = `
Laptop stand product details customer reviews add to cart checkout related products
shipping options product description and subscribe to our newsletter.
`.repeat(10);

  const result = validateJobPage(text, "https://shop.example/products/laptop-stand");

  assert.equal(result.isJobPage, false);
  assert.ok(result.signals.some((signal) => signal.includes("non-job page signals")));
});

// Rejects short snippets that do not contain enough content to analyze reliably.
test("rejects very short text even when it has a job-like word", () => {
  const result = validateJobPage("Engineer apply", "https://company.example/jobs/engineer");

  assert.equal(result.isJobPage, false);
  assert.ok(result.signals.includes("page text is too short"));
});
