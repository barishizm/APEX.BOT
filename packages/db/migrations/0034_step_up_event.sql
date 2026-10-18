-- 'step_up': a staff member confirmed destructive admin actions with an authenticator code
-- (/api/admin/step-up), so the security log shows who unlocked them and from where, not only the
-- wrong codes.
alter table app.auth_events drop constraint auth_events_event_check;
alter table app.auth_events add constraint auth_events_event_check check (event in (
  'register', 'login', 'login_failed', 'logout',
  'code_sent', 'email_verified', 'verify_failed',
  'reset_requested', 'reset_failed', 'password_reset', 'password_changed',
  'sessions_revoked', 'profile_updated', 'account_deleted',
  'two_factor_enabled', 'two_factor_disabled', 'two_factor_failed', 'recovery_codes_created',
  'access_blocked', 'step_up'));
