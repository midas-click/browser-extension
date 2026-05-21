# Midas Click Chrome Extension

MV3 extension for creating Midas jobs and applications from the current job posting page.

## Current Flow

1. Sign in through the web app auth bridge.
2. Sync resumes from Midas.
3. Create a job from the current tab URL and visible page text.
4. Return the created job immediately while matching is prepared in the background.
5. Select a resume. The highest scored resume is selected automatically when scores are available.
6. Create an application for the created job.

After job creation, the extension polls the job embedding status and only fetches resume match scores when the job is ready. If matching takes a while or is unavailable, the popup explains that state and still allows manual resume selection.

## Load Locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extension/` directory.

## Auth Bridge

The extension opens:

```text
{webAppUrl}/extension-auth?extensionId={chrome.runtime.id}
```

The web app authenticates with Clerk, gets the session token, then sends it to the extension:

```js
chrome.runtime.sendMessage(extensionId, {
  type: "MIDAS_AUTH_TOKEN",
  token,
  profileId,
  profileName,
  user: {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress,
  },
});
```

The extension manifest already allows messages from:

```text
https://midas-click.netlify.app/*
```

## Validate Auth

1. Load the unpacked extension.
3. Click **Sign in** in the extension popup.
4. Complete Clerk sign-in on `/extension-auth`.
5. The page should show `Midas Click extension is connected`.
6. Reopen the extension popup; it should show `Signed in`.
7. Click **Sync** to load resumes.

## Config

`config.js` defaults to production:

```js
apiBaseUrl: "https://midas-click.onrender.com/api/v1",
webAppUrl: "https://midas-click.netlify.app",
```

For local development, temporarily set:

```js
apiBaseUrl: "http://localhost:8000/api/v1",
webAppUrl: "http://localhost:5173",
```

## Future Resume Autofill

To attach the selected resume to third-party job forms, add:

1. Authenticated backend resume download endpoint.
2. Content script file-input detection.
3. Extension fetches resume bytes and creates a `File`.
4. Try assigning it to `<input type="file">`; fall back to downloading/opening the resume if blocked by the site.
