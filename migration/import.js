/**
 * One-time data import: Supabase pg_dump  ->  Firebase Firestore.
 *
 * Reads the plain-text Postgres backup (COPY blocks), remaps the old Supabase
 * user UUIDs to the new Firebase UIDs, and writes the three collections to
 * Firestore using the Admin SDK (which bypasses Security Rules and lets us
 * preserve our chosen document IDs).
 *
 * PREREQUISITES (see migration/README.md for full steps):
 *   1. `npm install` in this migration/ folder.
 *   2. Put your Firebase service-account key here as `serviceAccount.json`
 *      (Firebase Console -> Project settings -> Service accounts -> Generate new private key).
 *   3. BOTH allowlisted users must have signed into the new Firebase web app at
 *      least once (real Google login) so their Firebase accounts/UIDs exist.
 *
 * RUN:  node import.js
 * Safe to re-run: every write uses .set() (overwrite), so it is idempotent.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccount.json');
const DUMP_PATH = path.join(__dirname, '..', 'db_cluster-23-08-2025@20-52-14.backup');
const BATCH_SIZE = 450; // Firestore batched writes allow up to 500 ops.

// ---------------------------------------------------------------------------
// COPY-block parsing (pg_dump plain-text format)
// ---------------------------------------------------------------------------

// Un-escape a single COPY field. The literal field "\N" means SQL NULL.
function unescapeCopyField(value) {
    if (value === '\\N') return null; // SQL NULL sentinel
    let out = '';
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '\\' && i + 1 < value.length) {
            const next = value[++i];
            switch (next) {
                case 'n': out += '\n'; break;
                case 't': out += '\t'; break;
                case 'r': out += '\r'; break;
                case '\\': out += '\\'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'v': out += '\v'; break;
                default:  out += next; // unknown escape -> keep the char
            }
        } else {
            out += ch;
        }
    }
    return out;
}

// Parse one `COPY public.<table> (cols...) FROM stdin; ... \.` block into row objects.
function parseCopyBlock(lines, tableName) {
    const headerRegex = new RegExp(
        '^COPY ' + tableName.replace(/\./g, '\\.') + ' \\(([^)]*)\\) FROM stdin;'
    );

    let start = -1;
    let cols = null;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(headerRegex);
        if (m) {
            cols = m[1].split(',').map(c => c.trim());
            start = i + 1;
            break;
        }
    }
    if (start === -1) {
        throw new Error(`COPY block for ${tableName} not found in dump`);
    }

    const rows = [];
    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        if (line === '\\.') break;   // end-of-data marker
        if (line === '') continue;
        const fields = line.split('\t');
        const obj = {};
        cols.forEach((col, idx) => {
            obj[col] = unescapeCopyField(fields[idx] !== undefined ? fields[idx] : '\\N');
        });
        rows.push(obj);
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Type converters
// ---------------------------------------------------------------------------

// pg timestamptz e.g. "2025-06-03 13:59:22.844227+00" -> Firestore Timestamp.
function toTimestamp(v) {
    if (v == null) return null;
    let s = v.trim().replace(' ', 'T');
    s = s.replace(/([+-]\d{2})$/, '$1:00'); // "+00" -> "+00:00"
    const d = new Date(s);
    if (isNaN(d.getTime())) {
        console.warn('  ⚠️  Could not parse timestamp:', v);
        return null;
    }
    return admin.firestore.Timestamp.fromDate(d);
}

function toInt(v) {
    return v == null ? null : parseInt(v, 10);
}

// purchase_date is a bare SQL `date` ("YYYY-MM-DD"); keep as a string to avoid TZ drift.
function toDateString(v) {
    return v == null ? null : v;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        throw new Error(`Missing service account key at ${SERVICE_ACCOUNT_PATH}. See migration/README.md.`);
    }
    if (!fs.existsSync(DUMP_PATH)) {
        throw new Error(`Backup file not found at ${DUMP_PATH}`);
    }

    admin.initializeApp({
        credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH))
    });
    const db = admin.firestore();

    // 1) Parse the dump.
    const content = fs.readFileSync(DUMP_PATH, 'utf8');
    const lines = content.split(/\r?\n/);

    const profileRows  = parseCopyBlock(lines, 'public.user_profiles');
    const bookRows     = parseCopyBlock(lines, 'public.shared_books');
    const progressRows = parseCopyBlock(lines, 'public.user_reading_progress');

    console.log(`Parsed: ${profileRows.length} profiles, ${bookRows.length} books, ${progressRows.length} progress rows`);

    // 2) Build old-UUID -> email (from the dump) and email -> new Firebase UID (from Auth).
    const oldUuidToEmail = {};
    profileRows.forEach(p => { if (p.email) oldUuidToEmail[p.id] = p.email.toLowerCase(); });

    const emailToUid = {};
    let pageToken;
    do {
        const page = await admin.auth().listUsers(1000, pageToken);
        page.users.forEach(u => { if (u.email) emailToUid[u.email.toLowerCase()] = u.uid; });
        pageToken = page.pageToken;
    } while (pageToken);

    // Verify every user referenced in the dump has logged into Firebase.
    const missing = Object.values(oldUuidToEmail).filter(email => !emailToUid[email]);
    if (missing.length) {
        throw new Error(
            `These users have not signed into the new Firebase app yet: ${[...new Set(missing)].join(', ')}.\n` +
            `Ask them to log in once, then re-run this import.`
        );
    }

    const remapUser = (oldUuid) => {
        const email = oldUuidToEmail[oldUuid];
        return email ? emailToUid[email] : undefined;
    };

    // Helper: commit an array of {ref, data} in chunks.
    async function writeBatched(label, items) {
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = db.batch();
            items.slice(i, i + BATCH_SIZE).forEach(({ ref, data }) => batch.set(ref, data));
            await batch.commit();
            console.log(`  ${label}: committed ${Math.min(i + BATCH_SIZE, items.length)}/${items.length}`);
        }
    }

    // 3) user_profiles -> doc id = new Firebase UID.
    const profileItems = [];
    for (const r of profileRows) {
        const uid = emailToUid[(r.email || '').toLowerCase()];
        if (!uid) { console.warn('  ⚠️  Skipping profile with no Firebase user:', r.email); continue; }
        profileItems.push({
            ref: db.collection('user_profiles').doc(uid),
            data: {
                email: r.email,
                full_name: r.full_name,
                avatar_url: r.avatar_url || '',
                created_at: toTimestamp(r.created_at)
            }
        });
    }
    await writeBatched('user_profiles', profileItems);

    // 4) shared_books -> doc id = old numeric id (as string).
    const bookItems = [];
    for (const r of bookRows) {
        const createdBy = remapUser(r.created_by);
        if (!createdBy) { console.warn('  ⚠️  Skipping book with unknown creator:', r.id, r.created_by); continue; }
        bookItems.push({
            ref: db.collection('shared_books').doc(String(r.id)),
            data: {
                name: r.name,
                author: r.author,
                category: r.category,
                cover_url: r.cover_url,
                summary: r.summary,
                total_pages: toInt(r.total_pages),
                created_at: toTimestamp(r.created_at),
                created_by: createdBy
            }
        });
    }
    await writeBatched('shared_books', bookItems);

    // 5) user_reading_progress -> doc id = `${newUid}_${bookId}`.
    const progressItems = [];
    for (const r of progressRows) {
        const uid = remapUser(r.user_id);
        if (!uid) { console.warn('  ⚠️  Skipping progress with unknown user:', r.id, r.user_id); continue; }
        progressItems.push({
            ref: db.collection('user_reading_progress').doc(`${uid}_${r.book_id}`),
            data: {
                user_id: uid,
                book_id: String(r.book_id),
                status: r.status || 'Not Read',
                current_page: toInt(r.current_page),
                purchase_date: toDateString(r.purchase_date),
                personal_notes: r.personal_notes,
                started_reading_at: toTimestamp(r.started_reading_at),
                finished_reading_at: toTimestamp(r.finished_reading_at),
                created_at: toTimestamp(r.created_at),
                updated_at: toTimestamp(r.updated_at)
            }
        });
    }
    await writeBatched('user_reading_progress', progressItems);

    console.log('\n✅ Import complete.');
    console.log(`   profiles: ${profileItems.length}, books: ${bookItems.length}, progress: ${progressItems.length}`);
}

main().catch(err => {
    console.error('\n❌ Import failed:', err.message);
    process.exit(1);
});
