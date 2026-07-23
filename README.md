# TheSheilingData

An organized repository of school worksheets, sheets and study material for
**classes 6–10** — browsable by Class → Subject → Chapter, uploaded only by
admin-authorized teachers.

Built with **React (Vite)** + **Firebase** (Authentication, Firestore, Storage).
Deployable to **Vercel** or **Netlify**. Starts completely empty — every user,
file, log and count comes only from real usage.

---

## Running locally

```bash
npm install
npm run dev        # http://localhost:8791
```

Until you paste a Firebase config the app runs in **local preview mode**:
every feature works, but accounts and uploads live only in your browser
(localStorage + IndexedDB). This is for trying the site — connect Firebase
before real use.

## Connecting Firebase (go-live checklist)

1. **Create a Firebase project** at <https://console.firebase.google.com>.
2. **Authentication** → Sign-in method → enable **Email/Password** and **Google**.
3. **Firestore Database** → Create database (production mode).
4. **Storage** → Get started.
5. **Project settings → Your apps → Web app** → copy the config object into
   [`src/firebase-config.js`](src/firebase-config.js). The app switches to
   Firebase mode automatically.
6. **Deploy the security rules** — paste [`firestore.rules`](firestore.rules)
   into Firestore → Rules and [`storage.rules`](storage.rules) into
   Storage → Rules (or use `firebase deploy` with the CLI). *Do not skip this:
   the rules are what actually enforce roles server-side.*
7. **Create the first admin**: sign up normally in the app, then in the
   Firestore console open `users/<your-uid>` and change `role` from `student`
   to `admin`. Every later promotion can be done from the admin panel.

### Secure the admin panel (required before go-live)

The admin panel lives at a hidden route, protected by a second ID + password
check on top of your normal account sign-in. You can reach the panel two ways:

- **URL** — `/admin/login` (the `ADMIN_PATH` segment, default `admin`).
- **Secret gesture** — click the footer text **5 times within 2 seconds** on
  any page. No link to it appears anywhere in the navigation.

In [`src/config.js`](src/config.js) change:

- `ADMIN_PATH` — the URL segment for the panel (default `admin` →
  `/admin/login`). Pick a less-guessable string if you want more obscurity.
- `ADMIN_ID_SHA256` / `ADMIN_PASS_SHA256` — SHA-256 digests of the admin ID
  and password. **Shipped defaults are `registrar` / `change-me-now` — change
  them.** Generate a digest in any browser console:

  ```js
  crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-secret'))
    .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
  ```

The dashboard shows a red warning until the defaults are replaced. Note the
panel gate is a client-side deterrent + obscurity layer; the real enforcement
is the database/storage rules requiring `role == 'admin'`.

## Deploying

**Vercel:** import the repo → framework "Vite" → build `npm run build`,
output `dist`. `vercel.json` (SPA rewrites) is included.

**Netlify:** import the repo — `netlify.toml` already sets the build command,
publish dir and SPA redirect.

After deploying, add your production domain in Firebase → Authentication →
Settings → **Authorized domains** (needed for Google sign-in).

## How roles work

| Role | How obtained | Can |
|---|---|---|
| **student** | default on every signup | browse, search, preview, download, bookmark, report files |
| **teacher** | promoted by an admin in the panel | everything above + upload files (once email-verified) |
| **admin** | first one set in Firestore console; later ones promoted in the panel | everything + admin panel: manage users/roles, ban/unban, delete/move any file, review reports, view login logs, audit log, analytics |

Demoting or banning a user takes effect immediately (upload UI disappears and
the security rules reject writes; banned users are locked out at sign-in and
on their next page load).

## Data model (Firestore)

- `users/{uid}` — name, email, role, status, verified, createdAt, lastLoginAt
- `loginLogs/{id}` — userId, email, type (login/signup), success, device, at
- `files/{id}` — classNum, subject, chapter, fileName, fileType, size,
  storagePath, storageUrl, uploadedByUserId, uploaderName, uploadedAt,
  viewCount, downloadCount
- `bookmarks/{uid}/items/{fileId}` — savedAt
- `reports/{id}` — fileId, fileName, classNum, subject, reportedByUserId,
  reporterName, reason, status (open/dismissed/resolved), createdAt
- `adminAuditLog/{id}` — adminUserId, adminName, action, target ids, at

Storage layout: `worksheets/class-{n}/{subject-slug}/{uuid}-{filename}`.
(When an admin *moves* a file, its Firestore location changes; the storage
object keeps its original path — the path is organizational only.)

All collections start empty and are populated only by real app usage.

## Notes & known limits

- Failed sign-in attempts are logged without auth, so the `loginLogs` create
  rule allows unauthenticated writes with `success == false` — a deliberate
  trade-off so no event goes unrecorded.
- Signed-in users can read individual user profiles (needed for teacher
  pages); only admins can list all users.
- Search is client-side over file metadata — fine at school scale; swap in
  Algolia/Typesense if the library grows past tens of thousands of files.
