# Gym pass for Apple Wallet

Status: **Tabled**
Recorded: 2026-08-20

## Concept

Let a student scan the Codabar barcode on their physical SlugCard and add an unofficial, SlugSwap-branded gym pass to Apple Wallet. The goal is faster recreation-facility check-in without depending on the unreliable UC Santa Cruz Slugs athletics app.

## Decision

- Preserve the physical card's **Codabar** format exactly.
- Do **not** re-encode the SlugCard value as Code 128.
- Do not use or attempt to reproduce the athletics app's Code 128 credentials. Those values change after the app's barcode is cleared and the user signs in again.
- Do not implement the feature until Codabar Wallet passes are available on a stable iOS release and the result can be tested against a real UCSC recreation scanner.

## Privacy and product constraints

- Scan only the barcode; do not photograph, upload, or retain the full student ID.
- Treat the decoded barcode as a private campus credential.
- Prefer on-device decoding and storage. If a backend signs the Wallet pass, avoid persistent storage and logs containing the barcode value.
- Brand the pass as SlugSwap and clearly describe it as unofficial. Do not imitate the SlugCard or use UCSC marks without permission.
- Disable Wallet's Share control where possible, while recognizing that this does not completely prevent credential copying.

## Technical notes

- Codabar support for Apple Wallet passes was announced for iOS 27.
- A Wallet pass still needs an Apple Pass Type ID and a server-held signing certificate; the private key must not ship in the mobile app.
- The physical SlugCard barcode is stable and embeds the student's ID within a university/library barcode structure.
- The legacy UC Santa Cruz Slugs athletics app generates separate Code 128 credentials through its authenticated recreation system. Those credentials are out of scope.

## Conditions for revisiting

1. iOS 27 with Codabar Wallet support is generally available and suitable for SlugSwap's supported-device policy.
2. A signed test pass can be installed on a physical iPhone.
3. The test can be performed at an actual UCSC gym scanner.
4. UCSC branding, recreation policy, App Review, pass sharing, and issuer concerns have been evaluated.

## Test plan

1. Decode a consenting tester's physical SlugCard locally.
2. Generate a minimally branded Wallet pass using the exact Codabar payload.
3. Confirm that Wallet renders the barcode correctly on the target iOS version.
4. Test it at the gym while carrying the physical card as a fallback.
5. Only design and implement the full onboarding flow if the real scanner accepts the pass.

Reference: [Apple's iOS 27 Wallet barcode announcement](https://developer.apple.com/videos/play/wwdc2026/209/)
