# CraftOrbit — Setup Guide

This is a static site (`index.html`, `style.css`, `app.js`) — no build step needed.
It uses Firebase Auth + Firestore for the admin/upload flow, and the YouTube Data
API v3 to verify subscriptions before unlocking downloads.

Before it works end-to-end, you need to configure four things: Google Cloud OAuth,
the YouTube Data API, Firebase Firestore, and Render.com hosting.

---

## 1. Google Cloud Console — OAuth consent screen & credentials

Firebase Auth's Google provider runs on a Google Cloud OAuth client under the hood,
so this project needs a properly configured OAuth consent screen and authorized
origins.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and select
   the project tied to your Firebase project (`netchat-52007`).
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (unless you have a Google Workspace org).
   - App name: `CraftOrbit`, support email: your admin email.
   - **Scopes**: add `.../auth/userinfo.email`, `.../auth/userinfo.profile`, and
     `https://www.googleapis.com/auth/youtube.readonly` (this is the scope
     `app.js` requests — it's required for the subscription check).
   - **Test users**: while the app is in "Testing" publishing status, add every
     Google account that needs to log in (including your own). Move the app to
     "In production" once you're ready for the public — YouTube-scoped apps go
     through Google's verification review before that's fully unrestricted.
3. **APIs & Services → Credentials**
   - Open the **OAuth 2.0 Client ID** that Firebase created for you (or create a
     "Web application" client if none exists).
   - **Authorized JavaScript origins**: add
     - `https://<your-site>.onrender.com`
     - `http://localhost:5500` (or whatever you use for local testing)
   - **Authorized redirect URIs**: add
     - `https://netchat-52007.firebaseapp.com/__/auth/handler` (Firebase's
       standard auth handler — required)
     - `https://<your-site>.onrender.com/__/auth/handler` if you use a custom
       domain with Firebase Hosting; not needed for pure Render static hosting
       since `signInWithPopup` redirects through the `authDomain` above.

## 2. Enable the YouTube Data API v3

1. In the same Google Cloud project: **APIs & Services → Library**.
2. Search **YouTube Data API v3** → click **Enable**.
3. No separate API key is needed for the subscription check — `app.js` calls
   `subscriptions.list` using the **user's own OAuth access token** (obtained via
   `GoogleAuthProvider.addScope('youtube.readonly')`), not a server-side API key.
4. Be aware of quota: `subscriptions.list` costs 1 unit per call against the
   default 10,000 units/day project quota — plenty for a subscriber-gate feature,
   but monitor it if traffic grows (**APIs & Services → YouTube Data API v3 → Quotas**).

## 3. Firebase setup

### 3.1 Enable Google sign-in
**Firebase Console → Authentication → Sign-in method → Google → Enable.**
Confirm the support email matches your admin email.

### 3.2 Create the Firestore database
**Firebase Console → Firestore Database → Create database** (production mode,
pick a region). The app writes/reads a single top-level `worlds` collection.

### 3.3 Firestore Security Rules
Only the admin email may create/update/delete worlds; anyone (including signed-out
visitors) may read the list. Paste this into **Firestore → Rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /worlds/{worldId} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.token.email == "akmalsomirzaev64@gmail.com"
                   && request.auth.token.email_verified == true;
    }
  }
}
```

This mirrors the client-side admin check in `app.js`, so even if someone tampers
with the front-end JS, Firestore itself still rejects writes from non-admin
accounts.

> Note: download links and preview images are stored as plain fields, not files —
> "secure" here means access to them is gated behind the subscription-check UI
> flow, not that they're encrypted at rest. Anyone with the direct download URL
> (e.g. a Google Drive link) can still open it if shared outside the site.

## 4. Deploying to Render.com (Static Site)

1. Push `index.html`, `style.css`, and `app.js` to a GitHub repo.
2. In Render: **New → Static Site** → connect the repo.
3. Build command: leave blank (no build step).
4. Publish directory: `.` (repo root) or wherever the three files live.
5. Deploy. Render gives you a URL like `https://craftorbit.onrender.com` —
   add that exact origin to the **Authorized JavaScript origins** list from
   step 1 above (do this *before* testing login, or the OAuth popup will fail
   with a `redirect_uri_mismatch` / `idpiframe_initialization_failed` error).
6. If you later attach a custom domain in Render, add that domain to the
   authorized origins too.

## 5. Quick local test checklist

- [ ] Open the site, click **Login with Google** → popup appears, consent
      screen lists the YouTube readonly scope.
- [ ] Log in with `akmalsomirzaev64@gmail.com` → **Admin Dashboard** appears,
      publishing a world shows up instantly in the grid (Firestore real-time sync).
- [ ] Log in with a different Google account → no admin panel; clicking
      **Unlock Download** opens the modal.
- [ ] Click **Verify Subscription** while *not* subscribed → channel opens in
      a new tab, button flips to **Check Again**.
- [ ] Subscribe, click **Check Again** → button turns into a glowing
      **Download World** link.

---

**Files in this delivery:** `index.html`, `style.css`, `app.js`, `README.md`.
