# VISH HUB Admin Panel · Phase 1

## Access and deployment

Open `../admin.html` from the same site origin as `../index.html`. The panel imports `../firebase-client.js`, which is also used by the student Auth client, so both interfaces share the project’s Firebase Web configuration and one default Firebase app per page runtime.

Admin access requires both a verified Firebase Auth email and the trusted `admin: true` custom claim in the refreshed ID token. Firestore profile fields and browser storage are not used for authorization. Provision claims only from a trusted environment with the Admin SDK using the tool in `../admin-tools/`; never place Admin SDK credentials in this web project.

The static files can be served from the existing site root on Vercel. Firebase Authentication must allow the chosen localhost and production hostnames. No Firebase Console changes or deployments were made for this phase.

## Trusted dashboard data

The dashboard reads, but never writes, these optional server-owned records:

- `admin/overview`: numeric fields `totalStudents`, `resourceCount`, `storageObjects`, and `actionsToday`.
- `adminActivity/{eventId}`: `action`, `description`, `actorEmail`, and a Firestore `createdAt` timestamp.

Until a trusted backend writes those records, values remain `—` and activity is shown as empty. Student totals must be calculated by trusted server code; the Admin UI does not list or count private `users` documents. R2 metrics must be supplied by a trusted Cloudflare Worker/backend, never by exposing R2 credentials to the browser. Activity records are read-only to browser clients and should be written by trusted server code using the Admin SDK.

The local Firestore rules allow verified custom-claim Admins to read these admin records and deny client writes. Review and deploy the rules separately before expecting the panel to load Firestore data. Vercel domain authorization and any trusted aggregate/activity writers remain configuration tasks.
