-- Security log events for password reset, password change and account deletion.
alter table app.auth_events drop constraint auth_events_event_check;
alter table app.auth_events add constraint auth_events_event_check check (event in (
  'register', 'login', 'login_failed', 'logout',
  'code_sent', 'email_verified', 'verify_failed',
  'reset_requested', 'reset_failed', 'password_reset', 'password_changed',
  'sessions_revoked', 'profile_updated', 'account_deleted'));
