# Firebase Authentication setup notes

The browser app uses the Firebase Web SDK from Google’s hosted SDK modules. Its Firebase web configuration is public project-identification data; do not put service-account credentials in this project or in browser code.

## Local development

Serve the project root (`..`) over HTTP, for example with a local static file server, and open its `http://localhost:<port>` address. Firebase Auth does not work reliably from `file://` because browser origins and iframe messaging require an HTTP origin. The app explicitly uses Firebase local session persistence so a signed-in session survives reloads until the user signs out or clears site data.

In Firebase Console, add `localhost` to Authentication → Settings → Authorized domains. This is a manual Console step and has not been changed by this patch. Google popup sign-in is used first; redirect is only the popup-blocked fallback.

## Vercel

The same Firebase Web app config can be used for a Vercel static deployment. Once the production hostname is known, add that exact hostname to Firebase Authentication → Authorized domains and to the Google OAuth authorized JavaScript origins. Confirm the Firebase-managed callback `https://vish-hub.firebaseapp.com/__/auth/handler` is present in the OAuth client’s authorized redirect URIs. Vercel preview hostnames also need authorization if they are used for sign-in.

The app uses popup sign-in by default, which avoids depending on third-party redirect storage for the normal flow. If production browsers require redirect sign-in, configure Firebase’s recommended auth-domain proxy or a project-owned auth domain for the deployed host before enabling that path. No Vercel/Firebase Console settings or deployments were changed here.

## Admin claim provisioning

The client cannot assign `admin`. To grant or revoke the trusted custom claim, install the isolated Admin SDK dependency in `../admin-tools`, authenticate the operator through Application Default Credentials for the `vish-hub` project, then run these commands from the project root:

```sh
cd admin-tools
npm install
gcloud auth application-default login
npm run grant-admin -- <firebase-auth-uid> grant
```

Use `revoke` in place of `grant` to remove the claim while preserving any other custom claims. Granting requires the target account to have a verified email. The user must refresh their ID token before the new claim is visible. Never commit a service-account key.

## Rules deployment

`firestore.rules` in the project root is updated locally only. New student profiles require only their Auth UID and the default `Student` profile role; course and class labels come from `js/student-config.js`. Division, roll number, PRN, contact details, bio, avatar, electives, and setup state are optional. Existing course/class fields and unknown legacy fields are preserved; rules validate fields a student actually changes. Publish the reviewed rules separately before expecting these permissions to affect the live database. No rules were deployed and no Firebase Console setting was changed.
