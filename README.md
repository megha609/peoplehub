# PeopleHub - UI starter

A Vite + React front-end prototype for a lightweight employee register and attendance support tool.

## Requirements
- Node.js 18+ (20+ recommended)
- npm

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite, usually http://localhost:5173.

## Build
```bash
npm run build
npm run preview
```

## Current scope
- Firebase Authentication and Firestore are used for sign-in, employee records, and user profiles. Configure the `VITE_FIREBASE_*` environment variables before running the app.
- Admins and SuperAdmins can download an `.xlsx` employee template and preview imports before saving. Imports accept a single `Name` column or separate first, second, and optional third name columns; they validate active configured job roles, godowns, departments, and employment statuses, and skip same-name duplicates without overwriting existing records. Writes preserve legacy display fields and add stable catalogue IDs when the catalogue has been saved. Staff remains read-only.
- System roles are `SuperAdmin`, `Admin`, and `Staff`. SuperAdmin identity requires both membership in the protected UID list in `src/App.jsx` and `firestore.rules`, and a Firestore profile with `role: "SuperAdmin"` and `active: true`. All listed SuperAdmins have equal, company-wide operational permissions. Admin is the delegated HR/operations role with cross-godown employee, attendance, correction, and report access; Staff access is limited to one assigned godown.
- Only a verified SuperAdmin can create Staff/Admin profiles, change their roles, assignments, or active status. Admin profiles use `godown: null`; Staff profiles require one assigned godown. Every UID in the protected list is excluded from account-management changes in the UI and Firestore rules, including self-demotion, deactivation, and deletion. The account-registration form cannot create SuperAdmins. Staff account creation uses a secondary Firebase Auth app so it does not replace the signed-in SuperAdmin's primary session; profile writes still use the primary authenticated connection.
- Existing signed-in sessions subscribe to their own profile and update operational access when their role, godown, or active status changes. Firestore rules remain the server-side authority for every operation.
- Profile verification requires `active: true` and a valid role and godown before restoring access.
- The UI hides account management from Admin and Staff. Firestore rules enforce protected-UID-and-role SuperAdmin authorization, SuperAdmin-only profile creation and updates, role/godown combinations, and prohibit self-updates and modifications to protected profiles. Firebase client Auth account creation itself cannot be restricted by Firestore rules; use a trusted backend if unauthorized Auth-only accounts must also be prevented.
- Firestore rules are in `firestore.rules` and configured in `firebase.json`. Review and deploy them manually. The initial protected UID list contains only `ZYa131iL8AYn5fAZauhDH5R3ody2`; its profile must have `role: "SuperAdmin"`, `godown: null`, and `active: true`.
- To onboard a future HR SuperAdmin: (1) create the HR Firebase Authentication account; (2) obtain its actual Firebase UID; (3) add that UID to the protected SuperAdmin list in both `src/App.jsx` and `firestore.rules`; (4) set its Firestore profile to `role: "SuperAdmin"`, `active: true`, and `godown: null`; (5) build and deploy the frontend and deploy the Firestore rules; and (6) test HR login and SuperAdmin-protected account permissions. Do not use a placeholder UID or promote an ordinary account until its real UID is known.
- Attendance is loaded from Firestore's `attendance` collection. New records use `{encodedEmployeeId}_{YYYY-MM-DD}` document IDs and store employee details, status, editor display name, authenticated `updatedByUid`, `createdByUid`, and a server timestamp.
- Daily attendance queries the selected date. The calendar loads only its displayed month and follows the selected date; Reports query only the selected date range in pages of 50. Report status summaries and the record count describe loaded records only, not necessarily the complete selected period. Staff queries are restricted by their assigned legacy godown and, when present, stable godown ID; department filtering is applied only to already-scoped records.
- Attendance writes check for matching records with a narrowly scoped server query. The transaction reads an existing document only when one was found; creating a first attendance record does not read its missing deterministic document. New records include `createdByUid` so rules can reject a concurrent first submission by a different user; rules must require this field to match `request.auth.uid` on create and, when present, remain unchanged on update. The client rechecks after a permission-denied first write to report a concurrent submission when possible. Corrections update the existing attendance document and append an `attendanceAudit` document in the same transaction. An unchanged status creates no audit entry. Audit records retain the editor display name and store authenticated `changedByUid`, previous/new status, employee details, godown, date, and server timestamp.
- All five attendance statuses, including Overtime, are supported. No attendance is automatically created for unmarked employees.
- The deployed attendance rules must match `firestore.rules`: scope Staff access to their assigned godown, validate authenticated editor IDs and new-record `createdByUid`, preserve existing fields during corrections, require a linked audit entry for each correction, enforce the five supported statuses, and deny attendance/audit deletion. Without the immutable-creator rule, concurrent first submissions can still overwrite one another because the Firestore client SDK has no create-only write that avoids reading the missing document. Create any required composite indexes for the date/godown queries before enabling attendance management.
- Organisational options are managed in Settings and saved in the single `settings/catalogs` document. Its `godowns`, `jobRoles`, and `departments` maps use immutable stable IDs as keys; entries contain a display name, active state, and optional legacy aliases. The existing nine godowns and four job roles are available as local defaults without a setup script; the first SuperAdmin catalogue change writes those defaults together with the change. Departments start empty. Account permissions (`SuperAdmin`, `Admin`, `Staff`) remain separate from employee job titles.
- Active users may read `settings/catalogs`; Firestore rules permit changes only from the protected SuperAdmin UID and deny document deletion. New assignments use active catalog IDs, while unchanged assignments to archived entries and existing legacy string values remain compatible. Staff access is enforced by Firestore using their assigned godown ID or legacy assignment, never by the client-side department filter.
- Existing employee, user, attendance, and audit documents are not bulk migrated. Forms and imports preserve legacy display fields and add stable IDs for new or edited assignments once the catalogue is persisted. Historical attendance and audit snapshots are not rewritten. Department assignment is optional; department filters intersect with the existing godown-scoped employee and attendance sets.
- Deletion checks employee, user, attendance, and audit references before removing a catalog entry; referenced entries should be archived. This client-side check cannot be made atomic with concurrent writes under Firestore rules, so archiving remains the safe choice if data may be written concurrently. No seed or migration helper is part of the application.
- The catalogue is fetched once after sign-in and reused for the session; Settings provides an explicit refresh. Reference queries run only when a SuperAdmin requests deletion. Staff operational queries use the assigned legacy godown plus the assigned ID when available. `firestore.indexes.json` includes composites for godown/date attendance queries and godown-ID attendance-audit queries; deploy required indexes before enabling those query paths.

## Planned next phase
1. Add trusted server-side enforcement for SuperAdmin-only Authentication account creation.
2. Deploy and verify Firestore security rules for SuperAdmin, Admin, and assigned-godown access.
3. Add trusted backend enforcement and deployment configuration.
