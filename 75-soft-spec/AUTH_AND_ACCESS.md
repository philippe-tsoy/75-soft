# 75 Soft — Authentication and Access Subspec

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md), [DATA_MODEL.md](./DATA_MODEL.md)

## 1. Access model

The app has one cohort and one private group:

| Actor | Access |
|-------|--------|
| Anonymous visitor | Invite validation, signup, login, password recovery |
| Authenticated non-member | No group data; may finish an invite-backed signup |
| Active member | Own data plus shared group tracker, feed, board, and Person views |
| Admin member | Member access plus invite, moderation, invalidation, and removal actions |
| Removed member | No group access; existing content retention follows admin policy |

The client may hide controls for convenience, but the server and RLS must enforce this matrix.

## 2. Invite lifecycle

There is exactly one reusable active group code at a time.

```text
created → active → rotated
                   └─ old code becomes invalid
```

- Validation never consumes the code.
- A successful signup consumes no one-time token; it creates one membership.
- Rotation invalidates the old code immediately and creates a new code.
- The raw code must not be written to application logs or analytics.
- An invite link opens `/invite?code=<code>`. After validation, replace the browser URL so the code is not left in navigation history where practical.
- An invalid or rotated code keeps the user on Invite and does not create an app account.

The invite code is an access credential for a private group, not a password. Store a cryptographic hash for validation where possible; show the clear value only when an admin creates or rotates it.

## 3. Signup flows

### 3.1 Email and password

```text
/invite
  → validate reusable code
  → /signup
  → enter email + password
  → enter display name + profile photo + timezone
  → create/confirm Auth identity
  → create profile and active membership
  → /today
```

Required server checks:

- invite is active at the moment of completion;
- email is normalized for lookup but the provider retains its canonical form;
- password meets the Auth provider's policy;
- display name is non-empty after trimming;
- photo is an allowed image and within the configured size limit;
- timezone is a valid IANA identifier;
- no active membership already exists for this identity.

If email confirmation is enabled, create a pending signup intent rather than an active membership. The confirmation callback must revalidate the intent and invite before activating the profile and membership.

### 3.2 Google

The Invite page validates the code before the OAuth redirect. Store a short-lived, signed, HttpOnly invite intent containing:

```text
invite_code_hash
intent_created_at
nonce
```

The OAuth `state` value is bound to that intent. On callback:

1. exchange the code with Supabase Auth;
2. verify `state`, nonce, and intent expiry;
3. revalidate the invite;
4. resolve the authenticated identity;
5. create the profile/membership only if the invite intent is valid;
6. redirect to Today.

An existing active member may use Google login without an invite. A new or non-member Google identity without a valid invite intent must not gain group access; show the Invite entry point instead.

OAuth may create an Auth identity before the app-level membership is completed. Such an orphaned identity must have no profile, membership, or group-data access. A scheduled cleanup or an admin process may remove abandoned identities; it is not a reason to bypass invite verification.

## 4. Existing accounts and identity linking

The same verified email must not result in two app profiles.

- Email/password login for an existing account goes directly to the app; it does not require an invite.
- A user logged in with email/password can choose **Link Google** in Me. Use the provider's supported identity-linking flow; require the current session and a fresh reauthentication if available.
- If Google reports an email already attached to an email/password identity, do not silently merge Auth users. Tell the user to log in with email/password and link Google from Me.
- Do not merge accounts solely from a client-supplied email or an unverified provider claim.
- If a provider's email is already linked to a different active app identity, return a generic conflict and require support/admin resolution rather than choosing an account.

The link flow must preserve the existing profile, membership, posts, day logs, and achievements.

## 5. Login and recovery

### Login

Available methods:

- Continue with Google
- Email + password

Login errors should be generic enough not to expose whether an email is registered. Successful login always evaluates membership before redirecting:

```text
active member → Today
authenticated, no membership → Invite
removed member → access denied with support/admin direction
```

### Forgot password

`/forgot-password` accepts an email and asks Supabase Auth to send a reset link. Always show the same success message whether the address exists. The reset callback returns to a password form, then redirects to Login or Today.

There is no in-app notification center and no product-generated email other than provider password reset and account-confirmation messages.

## 6. Profile completion and updates

At signup, collect:

- display name;
- profile photo;
- IANA timezone.

From Me, a member may update name, photo, and timezone. A profile update must:

- trim and validate display name;
- validate image type and size before upload;
- replace/delete the old photo only after the new photo is stored;
- retain historical local dates on existing day and post records;
- return the updated profile and signed avatar URL.

Changing timezone changes the user's definition of current day and future local mutations. It must not rewrite historical `local_date` values or change the join local date.

## 7. Session and route protection

The Next.js proxy refreshes the Supabase session and protects the app route group. The protected layout performs the membership check; it must not rely only on the proxy because membership is application data.

Required redirect behavior:

| Condition | Destination |
|-----------|-------------|
| No session on protected route | Login |
| Session but no active membership | Invite/access state |
| Active member on auth route | Today |
| Member opens admin route without admin role | Not found or forbidden state |
| Expired session during mutation | 401, preserve form draft, prompt login |

OAuth and password-reset callbacks must validate their own state and redirect targets. Never accept an arbitrary `next` URL; allowlist internal paths.

## 8. Authorization matrix

| Resource/action | Member | Admin |
|----------------|--------|-------|
| Read active group tracker | Own group | Own group |
| Read feed/board/Person | Active members only | Active members only |
| Write own current/yesterday day | Yes | Yes |
| Write another member's day | No | No |
| Manage own profile/goals/containers | Yes | Yes |
| Create/delete own post | Yes | Yes |
| Delete another member's post | No | Yes |
| Comment/react | Yes | Yes |
| View/rotate invite | No | Yes |
| Invalidate a member day | No | Yes |
| Remove member | No | Yes |

## 9. Abuse resistance

- Rate-limit invite validation and auth endpoints.
- Apply password policy and provider MFA/security settings where available.
- Use secure, HttpOnly, SameSite cookies for invite intents and sessions.
- Do not expose service-role credentials to the browser.
- Keep admin actions behind a fresh role lookup and record them in the audit log.
- Avoid account enumeration in login, reset, and invite error messages.

## 10. Acceptance criteria

- Invalid invite code never creates a profile or active membership.
- A reusable valid code can be used by multiple people until rotation.
- Rotating the code invalidates the previous code for new signup completion.
- Email signup, confirmation, and Google signup all land on Today after profile/membership completion.
- Existing members can log in without entering the invite again.
- A new Google identity without an invite cannot read group data.
- Matching email identities are linked through an authenticated link flow, not duplicate profiles or insecure silent merges.
- A removed member cannot read or mutate group data.
- Profile timezone changes affect future date calculation but do not rewrite history.

