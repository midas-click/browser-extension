# Portable Job Capture Logic

Use `portableJobCapture.js` when porting Midas job creation into another
extension. It contains the business logic for:

- extracting visible job text from the current page
- preferring job/career/main/Greenhouse content roots
- detecting Greenhouse embedded jobs
- validating the captured text
- posting to `POST /jobs/analyze`

## Content Script

Run this in the page context:

```js
import { captureJobPageFromDocument } from "./portableJobCapture.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CAPTURE_JOB_PAGE") return false;
  sendResponse(captureJobPageFromDocument());
  return true;
});
```

## Background / Service Worker

Run this after receiving the captured page:

```js
import { createJobFromCapturedPage } from "./portableJobCapture.js";

async function createJob(page) {
  return createJobFromCapturedPage({
    apiBaseUrl: "https://api.movup.pro/api/v1",
    page,
  });
}
```

The backend endpoint is public for job creation. Do not attach auth unless the
target backend changes that contract.

## Captured Page Shape

```js
{
  url: "https://company.example/jobs/role",
  title: "Senior Engineer",
  text: "visible job text...",
  capture_source: "main#content",
  greenhouse: {
    job_id: "4700893005",
    board_token: "hyperproof"
  }
}
```

## Backend Request

```http
POST /api/v1/jobs/analyze
Content-Type: application/json
```

```json
{
  "raw_text": "Page title...\nURL...\nCaptured from...\n...",
  "source_url": "https://company.example/jobs/role"
}
```
