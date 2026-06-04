# Data migration: Supabase → Firestore

One-time import of the Supabase backup into Firebase Firestore. Run this **once**, after the
Firebase project is set up (see the root `README.md`).

## Prerequisites

1. **Node.js 18+** installed.
2. **Both allowlisted users have signed into the new Firebase app at least once** (real Google
   login). The import maps old Supabase user UUIDs → new Firebase UIDs by email, so the Firebase
   accounts must already exist. The script will stop with a clear error if one is missing.
3. A **service-account key**:
   - Firebase Console → ⚙️ Project settings → **Service accounts** → **Generate new private key**.
   - Save the downloaded JSON as **`migration/serviceAccount.json`** (this path is git-ignored —
     never commit it).
4. The backup file `db_cluster-23-08-2025@20-52-14.backup` is in the repo root (one level up).

## Run

```bash
cd migration
npm install
node import.js
```

Expected output ends with:

```
✅ Import complete.
   profiles: 2, books: 598, progress: 605
```

(Counts may differ slightly if rows reference users that never logged in — those are skipped
with a warning.)

## What it does

- Parses the three `COPY` blocks (`user_profiles`, `shared_books`, `user_reading_progress`) from
  the plain-text pg_dump. `\N` → `null`.
- Builds `email → Firebase UID` from `admin.auth().listUsers()`, and `old UUID → email` from the
  dump's `user_profiles`.
- Writes with preserved document IDs:
  - `user_profiles/{firebaseUid}`
  - `shared_books/{oldNumericId}`
  - `user_reading_progress/{firebaseUid}_{bookId}`
- Converts Postgres `timestamptz` → Firestore `Timestamp`; keeps `purchase_date` as a
  `"YYYY-MM-DD"` string.
- Uses the Admin SDK, which bypasses Security Rules and preserves the chosen IDs.

## Re-running

Safe. Every write is a `.set()` (overwrite), so re-running fixes/refreshes data without
creating duplicates.

## Verify

In the Firebase Console → Firestore → Data, confirm the three collections and a few documents
(e.g. `shared_books/205`, `shared_books/678`). `created_by` / `user_id` should be Firebase UIDs.
