-- Staff can mark an address verified without a code (/admin/users, "Verify email"), on the word of
-- whoever asked. That proves nothing about who owns the inbox, so the address stays unproven: when the
-- owner proves it later (a Google/GitHub sign-in or a password reset code), the password, authenticator
-- and sessions the registrant set up are dropped, as for an account that was never verified. Cleared
-- once the inbox is proven.
alter table app.users add column email_verified_by_staff_at timestamptz;
