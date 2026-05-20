# Midas Click Chrome Extension

MV3 extension for creating Midas jobs and applications from the current job posting page.

## Current Flow

1. Sign in through the web app auth bridge.
2. Sync resumes from Midas.
3. Create a job from the current tab URL and visible page text.
4. Select a resume.
5. Create an application for the created job.

Match-score fetching is intentionally not implemented in the popup while backend embeddings are disabled.

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
  user: {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress,
  },
});
```

The extension manifest already allows messages from:

```text
http://localhost:5173/*
https://midas-click.netlify.app/*
```

## Validate Auth

1. Start frontend and backend locally.
2. Load the unpacked extension.
3. Click **Sign in** in the extension popup.
4. Complete Clerk sign-in on `/extension-auth`.
5. The page should show `Midas Click extension is connected`.
6. Reopen the extension popup; it should show `Signed in`.
7. Click **Sync** to load resumes.

## Config

Edit `config.js` for local or deployed URLs:

```js
apiBaseUrl: "http://localhost:8000/api/v1",
webAppUrl: "http://localhost:5173",
```

For production:

```js
apiBaseUrl: "https://midas-click.onrender.com/api/v1",
webAppUrl: "https://midas-click.netlify.app",
```

## Future Resume Autofill

To attach the selected resume to third-party job forms, add:

1. Authenticated backend resume download endpoint.
2. Content script file-input detection.
3. Extension fetches resume bytes and creates a `File`.
4. Try assigning it to `<input type="file">`; fall back to downloading/opening the resume if blocked by the site.
