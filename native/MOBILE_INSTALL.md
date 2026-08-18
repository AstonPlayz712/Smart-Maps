# Installing Smart Maps A/E from GitHub Actions — mobile-only guide

No PC, no Android Studio, no Xcode, no macOS. Everything builds in GitHub CI;
you download and install from your phone/tablet.

## Where the builds come from

| Workflow | Runs on | Artifact | File |
|---|---|---|---|
| **Android release build** (`android-build.yml`) | every push touching `native/android/`, or manual | `smart-maps-ae-release-apk` | `app-release.apk` |
| **iOS build** (`ios-build.yml`) | every push touching `native/ios/`, or manual | `smart-maps-ae-unsigned-ipa` | `SmartMapsAE-unsigned.ipa` |

Manual trigger from mobile: open the repo in a mobile browser → **Actions** →
pick the workflow → **Run workflow** (use "Request desktop site" if the button
doesn't show in the mobile layout).

## 1. Downloading artifacts on mobile

1. Open `github.com/AstonPlayz712/Smart-Maps` in your mobile browser
   (Chrome / Safari — the GitHub mobile *app* can view runs but the browser is
   more reliable for artifact downloads).
2. Tap **Actions** → tap the latest green run of the workflow you want.
3. Scroll to **Artifacts** at the bottom of the run page.
4. Tap the artifact — it downloads as a **.zip**.
5. Unzip it with your file manager (Android: Files by Google or the built-in
   manager; iPadOS: the Files app unzips with one tap). Inside is the
   `.apk` / `.ipa`.

> Artifacts require being signed in to GitHub, and expire after 30 days —
> re-run the workflow if the artifact has expired.

## 2. Installing the APK on Android

1. Unzip → tap `app-release.apk`.
2. Android will ask to allow installs from your browser/file manager:
   **Settings → Install unknown apps → allow** for that app (one-time).
3. Tap Install. Done — the app appears as **Smart Maps A/E**.

Notes:
- The release APK is signed with the CI **debug key** — fine for personal
  installs and testing; replace with a real keystore before any Play upload.
- Updating: install the new APK over the old one (same key, so it upgrades in
  place).

## 3. Installing the IPA on iPadOS (AltStore / SideStore)

The CI IPA is **unsigned by design** — AltStore/SideStore sign it on-device
with your free Apple ID (no paid developer account needed).

**One-time setup (AltStore classic needs a PC briefly; SideStore does not):**
- **SideStore** (fully PC-free after initial pairing) or **AltStore** — follow
  the official install guide for your setup: altstore.io / sidestore.io.
- TrollStore (if your iPadOS version supports it) installs unsigned IPAs
  directly with no re-signing at all.

**Installing:**
1. Download + unzip the artifact so `SmartMapsAE-unsigned.ipa` is in Files.
2. Share/Open the `.ipa` with AltStore/SideStore (or use their **My Apps →
   + → pick file**).
3. It signs with your Apple ID and installs. Free-account signatures last
   **7 days** — AltStore/SideStore auto-refresh when opened periodically.
4. First launch: **Settings → General → VPN & Device Management** → trust
   your certificate if prompted.

## Why the iOS build is unsigned (and why that's correct)

Exporting a signed IPA in CI (`xcodebuild -exportArchive` + provisioning
plist) requires an Apple Developer account and provisioning profiles. This
pipeline is explicitly account-free, so CI disables code signing and packages
the raw `.app` into `Payload/*.ipa` — exactly the form AltStore, SideStore,
and TrollStore expect, since they apply their own signature at install time.
