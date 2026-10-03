# Maestro School for Android

The Android application is a Trusted Web Activity wrapper for
`https://maestro-school.duckdns.org`.

## Release

1. Update `appVersionName`, `appVersion`, and `appVersionCode` in
   `twa-manifest.json`, and `versionName` / `versionCode` in `app/build.gradle`.
2. Set `JAVA_HOME` to JDK 17 and `ANDROID_HOME` to the installed Android SDK.
   Run `./gradlew --no-daemon assembleRelease` from this directory.
3. Align `app/build/outputs/apk/release/app-release-unsigned.apk` with
   Android build-tools `zipalign`, then sign it with `apksigner` and the
   existing Maestro release key. Pass passwords through environment variables,
   never command arguments or committed files.
4. Verify the APK with `apksigner verify --verbose --print-certs`.
5. Publish `app-release-signed.apk` as
   `web_app/public/downloads/maestro-school.apk`.
6. Update `web_app/public/downloads/maestro-school.json`.

The signing key and its credentials must stay outside this repository. Android
updates must always use the same key. For local builds, expose that key at
`.signing/maestro-release.keystore`; the `.signing` directory is ignored by Git.

## Brand resources

The launcher and splash use an unchanged copy of
`web_app/public/brand/guitar-avatar.png`. Android scales the xxxhdpi resource
for older launchers; the adaptive launcher places it inside a black background
with a 20% inset. Notifications use a separate monochrome music-note vector.

`twa-manifest.json`, the color values in `app/build.gradle`, and
`app/src/main/res/raw/web_app_manifest.json` must stay aligned with the web app.
`bubblewrap update` can overwrite the checked-in adaptive icon and notification
resources: review those changes before building a release.
