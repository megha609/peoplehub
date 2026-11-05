# PeopleHub Security Review

Inspection-only audit of the PeopleHub React and Firebase application, completed 2026-11-05. No application code, Firebase configuration, rules, or deployment settings were changed as part of the audit.

## Findings

### Medium — Staff deactivation is not refreshed in active sessions

**File and functions:** `src/App.jsx` — the `onAuthStateChanged` listener (approximately lines 479–600) loads the user profile and checks `active` at authentication restoration; `updateStaffAccount` (approximately lines 700–715) updates the Staff profile's active state.

The client checks `active === true` when it restores a session, so reloading verifies current profile state. It does not subscribe to later profile changes or revalidate the session when an Admin deactivates the account. Consequently, an already-open Staff client retains its previously loaded role and UI access until its state is refreshed or its session ends. Whether Firestore requests are denied immediately depends on deployed rules, which are not in this repository and could not be inspected.

**Recommendation:** Enforce active-user and godown checks in deployed Firestore rules for every protected operation. For prompt UI revocation, listen for changes to the signed-in user's profile or otherwise force session refresh/sign-out after deactivation. Do not rely on client UI state as authorization.

### Medium — Staff Authentication account creation is client-invocable

**Files and functions:** `src/App.jsx` — `createStaffAccount` (approximately lines 634–656); `src/firebase.js` — initialization and export of `staffAccountAuth` (lines 4–18).

The SPA checks whether the current account is Admin, then calls `createUserWithEmailAndPassword` through the secondary Auth instance. This prevents the new account from replacing the Admin's primary session, but Admin authorization is only a client-side check. If email/password registration is enabled, a caller can invoke Firebase Authentication's client API outside the UI to create accounts. The subsequent profile write uses the primary authenticated Firestore connection; with suitable rules, this may prevent the created account from receiving PeopleHub data access, but does not prevent Auth account creation itself.

**Recommendation:** Move Auth account creation to a trusted backend that verifies Admin authorization. Disable public email/password registration if it is not required.

## Critical and high-priority issues

No critical or high-priority findings were confirmed in the inspected source. This does not establish that deployed Firestore rules are secure.

## Firestore rules and access scope

The repository contains no Firestore rules file; `firebase.json` configures Hosting only. Therefore, deployed rules could not be checked for:

- Admin-wide versus Staff assigned-godown access.
- Protection of user profiles, employee records, attendance, and audit records against direct client API access.
- Whether inactive users are denied server-side on every operation.
- Whether attendance and audit rules accept the fields and transaction writes made by the application.

The React UI applies role/godown filters, but client-side checks are not a security boundary. Do not consider Firestore access protected until the deployed rules are independently reviewed and tested.

## Configuration and already-secure observations

- Firebase client configuration is read from `import.meta.env.VITE_FIREBASE_*`. Firebase web API configuration is client-visible by design and is not an Admin credential. No secret values are reproduced in this report.
- `staffAccountAuth` is a secondary Firebase app/Auth instance, allowing Admin account creation without replacing the primary signed-in session.
- The authentication restoration flow retrieves the signed-in user's Firestore profile and checks its `active` state, role, and Staff godown before setting the current application user. This provides a refresh-time check, subject to the missing-profile error handling and deployed rules.
- Staff-only navigation and operations are guarded in the client, but these controls must be backed by Firestore rules.

## Scope and limitations

This was a static source/configuration review. No files other than this report were changed for the follow-up, and no Firebase rules or deployments were modified. Deployed rules, Firebase Console settings, Authentication registration settings, and production behavior were not available for verification.
