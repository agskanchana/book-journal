# 📚 Book Journal

A private, two-person reading tracker. Static PWA (vanilla JS + Onsen UI), hosted on
GitHub Pages. **Backend: Firebase** (Firestore database + Firebase Auth with Google login).
Book cover images are stored on **Cloudinary**.

> Migrated from Supabase → Firebase so the free tier no longer pauses on inactivity.
> See `migration/` for the one-time data import.

---

## Architecture

| Concern | Service |
|---|---|
| Database | Cloud Firestore (collections: `shared_books`, `user_reading_progress`, `user_profiles`) |
| Login | Firebase Auth (Google provider) |
| Access control | Firestore Security Rules (`firestore.rules`) — restricts to the two allowlisted emails |
| Image uploads | Cloudinary (unsigned upload preset — unchanged) |
| Hosting | GitHub Pages (static files) |

The browser talks to Firebase directly — there is **no backend server**.

---

## First-time setup (Firebase Console)

1. **Create a project** at <https://console.firebase.google.com>.
2. **Add a Web app** (`</>` icon). Copy the `firebaseConfig` object it shows you.
3. Paste those values into **`main-script.js`** at the top (`const firebaseConfig = { ... }`),
   replacing the `YOUR_...` placeholders.
4. **Authentication → Sign-in method →** enable **Google**, set a support email, Save.
5. **Authentication → Settings → Authorized domains →** add `agskanchana.github.io`
   (leave `localhost` in place for local testing).
6. **Firestore Database → Create database →** Production mode → pick a region.
7. **Firestore Database → Rules →** paste the contents of **`firestore.rules`** → **Publish**.

No composite indexes are required (the app only uses single-field ordering/equality, which
Firestore indexes automatically).

---

## Migrate the existing data (one time)

Your old data lives in the Supabase backup `db_cluster-23-08-2025@20-52-14.backup`.

1. **Both users must sign in once** to the new app (local or deployed) with Google. This
   creates their Firebase accounts/UIDs so the import can map old records to them.
2. Follow **`migration/README.md`** to run the importer:
   - drop a service-account key in `migration/serviceAccount.json`
   - `cd migration && npm install && node import.js`

The importer is idempotent — safe to re-run.

---

## Run locally

Serve over HTTP (not `file://`) so Google sign-in works (`localhost` is an authorized domain):

```bash
# any static server works, e.g.:
npx serve .
# or:  python -m http.server 8000
```

Open the printed `http://localhost:...` URL and sign in.

---

## Deploy

Push to the `working`/`main` branch that GitHub Pages serves. After deploying:

- The service worker cache version was bumped (`book-journal-v2.0.0`), so clients pick up the
  new Firebase scripts on next load.
- Verify login + add/edit/delete a book on the live URL.

---

## After everything works

- **Decommission the old Supabase project** (pause or delete it) and treat the old anon key as
  exposed — it is still in this repo's git history. Rotating/deleting it on Supabase's side is
  the real fix.

---

## Files

| File | Purpose |
|---|---|
| `index.html`, `theme.css`, `main-script.js` | The app |
| `pwa.js`, `sw.js`, `manifest.json`, `offline.html`, `icons/` | PWA shell |
| `firestore.rules` | Firestore Security Rules (deploy to Firebase) |
| `migration/` | One-time Supabase → Firestore import script |
| `db_cluster-...backup` | The Supabase data dump (import source; can be deleted after migrating) |
