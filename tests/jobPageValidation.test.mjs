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

// Accepts concise postings from common hosted job boards.
test("accepts a concise applytojob sales posting", () => {
  const text = `
Founding Sales Development Representative
Advatix is hiring a sales representative to support outbound pipeline.
Job type: full-time. Location: remote in the United States.
You will identify prospects, qualify leads, and partner with account executives.
Experience with CRM tools, cold outreach, and strong communication is required.
Submit your application to be considered for this role.
`;

  const result = validateJobPage(text, "https://advatixinc.applytojob.com/apply/example");

  assert.equal(result.isJobPage, true);
  assert.ok(result.signals.includes("known job board domain"));
});

// Accepts the extension capture format when the content script prefers <main>.
test("accepts job content captured from the main element", () => {
  const text = `
Page title: Senior Frontend Engineer
URL: https://company.example/jobs/frontend-engineer
Captured from: main

Senior Frontend Engineer
About the role
You will build React interfaces, collaborate with designers, and improve customer workflows.
Requirements include TypeScript, accessibility, API integration, and production experience.
This is a full-time hybrid role with compensation and benefits.
Apply now.
`;

  const result = validateJobPage(text, "https://company.example/jobs/frontend-engineer");

  assert.equal(result.isJobPage, true);
  assert.ok(result.signals.includes("careers or jobs URL path"));
});

// Accepts company careers landing pages that invite applicants but do not list a full role.
test("accepts a company careers landing page", () => {
  const text = `
AACI Group
Home
Who We Are
Case for Change
Partners
Careers
Careers
Join Our Team
We're always looking for talented professionals to join our team and become part of our growing organization dedicated to excellence in insurance and risk management.

Interested in Joining Us?
If you'd like to be part of our team, we'd love to hear from you.

Email Us
AACI develops technology, insurance, and protection systems that help property owners stay covered and communities stay resilient in the face of growing climate risk.
`;

  const result = validateJobPage(text, "https://aaci.example/careers");

  assert.equal(result.isJobPage, true);
  assert.ok(result.signals.includes("careers or jobs URL path"));
  assert.ok(result.signals.some((signal) => signal.includes("careers page signals")));
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
