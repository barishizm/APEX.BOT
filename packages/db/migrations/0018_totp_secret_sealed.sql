-- Authenticator secrets are now stored encrypted ("v1.<iv>.<tag>.<ciphertext>", AES-256-GCM under
-- TOTP_ENCRYPTION_KEY). A plain base32 secret saved before this is still accepted and is
-- encrypted the first time it is used.
alter table app.users drop constraint users_totp_secret_check;
alter table app.users add constraint users_totp_secret_check check (
  totp_secret is null
  or totp_secret ~ '^[A-Z2-7]{32}$'
  or (totp_secret ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and length(totp_secret) <= 200));
