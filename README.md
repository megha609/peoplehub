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
- Admins can create Staff accounts, view their Firestore profiles, change assigned godowns, and activate or deactivate accounts. Staff profiles are stored at `users/{uid}`.
- Staff account creation uses a separate Firebase Auth app so it does not replace the signed-in Admin's primary session. Firestore profile writes still use the primary authenticated connection.
- Profile verification requires `active: true` and a valid role and godown before restoring access.
- The UI hides and guards staff management for non-Admins, but client-side checks do not securely restrict Authentication account creation. Use a trusted backend for that enforcement and deploy Firestore rules that restrict user-profile reads and writes to the intended principals.
- No Firestore security rules are included in this repository; verify the deployed rules permit Admins to list and update Staff profiles and create Staff profile documents before enabling this workflow.
- Attendance is loaded from Firestore's `attendance` collection. New records use `{encodedEmployeeId}_{YYYY-MM-DD}` document IDs and store employee details, status, editor display name, authenticated `updatedByUid`, `createdByUid`, and a server timestamp. The sample attendance array in `src/data.js` is not imported.
- Daily attendance queries the selected date. The calendar loads only its displayed month and follows the selected date; Reports query only the selected date range in pages of 50. Report status summaries and the record count describe loaded records only, not necessarily the complete selected period. Staff queries include their assigned godown, and no screen loads the entire attendance collection.
- Attendance writes check for matching records with a narrowly scoped server query. The transaction reads an existing document only when one was found; creating a first attendance record does not read its missing deterministic document. New records include `createdByUid` so rules can reject a concurrent first submission by a different user; rules must require this field to match `request.auth.uid` on create and, when present, remain unchanged on update. The client rechecks after a permission-denied first write to report a concurrent submission when possible. Corrections update the existing attendance document and append an `attendanceAudit` document in the same transaction. An unchanged status creates no audit entry. Audit records retain the editor display name and store authenticated `changedByUid`, previous/new status, employee details, godown, date, and server timestamp.
- All five attendance statuses, including Overtime, are supported. No attendance is automatically created for unmarked employees.
- No Firestore rules or indexes are included in this repository. Deployed attendance rules must scope Staff reads and writes to their assigned godown, allow a first-record create only for an employee in that godown, validate `updatedByUid`, `changedByUid`, and new-record `createdByUid` against `request.auth.uid`, preserve `createdByUid` on updates when present, enforce the five supported statuses, and allow audit creation while denying audit updates and deletes. Existing employee and user rules are not changed here. Without the immutable-creator rule, concurrent first submissions can still overwrite one another because the Firestore client SDK has no create-only write that avoids reading the missing document. Create any required composite indexes for the date/godown queries before enabling attendance management.

## Planned next phase
1. Add trusted server-side enforcement for Admin-only Authentication account creation.
2. Deploy and verify Firestore security rules for Admin and assigned-godown access.
3. Add trusted backend enforcement and deployment configuration.
