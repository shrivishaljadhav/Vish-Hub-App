# VISH HUB project layout

The project root is also the static site root. Keep the student and admin entry pages and Firebase CLI configuration files there so existing URLs, relative asset paths, and Firebase tooling continue to work.

```text
VISHU/
├── index.html                 Student app entry page
├── admin.html                 Admin panel entry page
├── auth-client.js             Student Firebase Auth integration
├── firebase-client.js         Shared Firebase app, Auth, and Firestore setup
├── firebase-config.js         Firebase web configuration
├── firebase.json              Firebase CLI configuration
├── firestore.rules            Firestore security rules
├── admin/                     Admin panel JavaScript and styles
├── admin-tools/               Trusted Admin SDK utility
├── css/                       App styles and SVG design assets
├── js/                        App behavior and vendor libraries
├── resources/                 Images, books, and onboarding experience
└── docs/                       Setup guides and project documentation
```

Keep user-facing pages at the root; moving them or the referenced asset folders changes paths used by the static app. Place new setup notes and maintenance documentation in `docs/`.
