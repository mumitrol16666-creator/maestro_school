# Maestro School for Android

The Android application is a Trusted Web Activity wrapper for
`https://maestro-school.duckdns.org`.

## Release

1. Update `appVersionName` and `appVersionCode` in `twa-manifest.json`.
2. Run `bubblewrap update`.
3. Run `bubblewrap build` and sign with the Maestro release key.
4. Verify the APK with `apksigner verify --verbose --print-certs`.
5. Publish `app-release-signed.apk` as
   `web_app/public/downloads/maestro-school.apk`.
6. Update `web_app/public/downloads/maestro-school.json`.

The signing key and its credentials must stay outside this repository. Android
updates must always use the same key. For local builds, expose that key at
`.signing/maestro-release.keystore`; the `.signing` directory is ignored by Git.
