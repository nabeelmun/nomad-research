# v1.2.0 test builds

Both GitHub Actions native builds passed. These are diagnostic test artifacts, not a production release. No physical-device testing has been performed.

| Platform | File | Bytes | Download |
|---|---|---:|---|
| Android | NomadLM-v1.2.0-bd474e9.apk | 150,230,798 | [GitHub artifact](https://github.com/nabeelmun/nomad-research/actions/runs/37360613915/artifacts/11366917398) |
| iOS | NomadLM-diagnostic-unsigned.ipa | 14,445,903 | [GitHub artifact](https://github.com/nabeelmun/nomad-research/actions/runs/37359351620/artifacts/11365049888) |

GitHub artifacts require a GitHub login, download as ZIP archives and expire after 14 days. Extract the APK or IPA before use. The workflows can regenerate artifacts from their recorded commits.

## Android

Built from `bd474e9c998bd96b721424055517daa30a7af6c1`. [Successful build](https://github.com/nabeelmun/nomad-research/actions/runs/37360613915). The APK contains ARM64 and x86-64 native libraries and its bundled JavaScript. It requires Android 7.0 / API 24 or later and a 64-bit device. The Nothing Phone (3a) Pro is an ARM64 device.

Google's apksig verifier validated the APK's v2 signature. Its certificate SHA-256 matches the published `NomadLM-v1.1.0.apk`: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Version code 4 is higher than the previous code 3, so it should install as an update for that signing identity. Upgrade installation and history migration remain physical-device checks; try updating without uninstalling.

The APK uses the template debug signing key for testing. A production release must use the project's persistent release key. The packaged manifest confirms package `xyz.nomad.research`, version 1.2.0, target API 36, Internet permission and disabled app-data backup. Model and corpus assets remain separate downloads/imports.

## iOS

Built from `a3cfbdd9783497733d23e94a1234a78af174b0dc`. [Successful build](https://github.com/nabeelmun/nomad-research/actions/runs/37359351620). Android-only workflow/build-helper changes after this commit do not change the iOS application source.

The IPA contains the ARM64 executable, bundled JavaScript and rnllama framework. Minimum iOS version: 16.4. It is **unsigned**, without an embedded provisioning profile. Re-sign it with a suitable sideloading tool and Apple account before installation; it is not a TestFlight or directly installable signed distribution.

## SHA-256

```text
9a2aea711a96f01b4454925ce482590a7ff6555de6b12e5407ffe4fb67edf99f  NomadLM-v1.2.0-bd474e9.apk
136b01ca61b3878466a355a2173a83d750ea8ec2d4ea6a34168f0d2d167dfc0b  NomadLM-diagnostic-unsigned.ipa
```

Follow [DEVICE_TESTING.md](DEVICE_TESTING.md) for setup, math/retrieval, download recovery, offline behavior, history and benchmark checks. Compilation and file verification do not establish phone performance, model compatibility or bounty acceptance.
