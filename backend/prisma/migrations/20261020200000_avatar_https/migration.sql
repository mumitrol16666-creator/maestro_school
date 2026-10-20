-- Avatars uploaded behind the TLS proxy were saved with an http:// address, which a page served
-- over https loads as mixed content. Media of the school's own site is upgraded to https;
-- local development addresses stay as they are.
UPDATE "users"
SET "avatar" = regexp_replace("avatar", '^http://', 'https://')
WHERE "avatar" ~ '^http://[^/]+/api/v1/media/'
  AND "avatar" !~ '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?/';
