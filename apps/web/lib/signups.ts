// Sign-ups are closed while this is not "true": the sign-up form is hidden behind the waitlist
// and /api/auth/register and Google/GitHub sign-up refuse. Existing accounts can still log in.
// NEXT_PUBLIC_ so the modal can read it; changing it needs a rebuild.
export const SIGNUPS_OPEN = process.env.NEXT_PUBLIC_SIGNUPS_OPEN === "true"
