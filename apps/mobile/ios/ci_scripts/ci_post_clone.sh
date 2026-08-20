#!/bin/sh
set -e
system_profiler SPHardwareDataType

echo "Running ci_post_clone.sh"
date
# cd out of ios/ci_scripts into main slugswap directory
cd ../../../../

# install node
#HOMEBREW_NO_AUTO_UPDATE=1 brew install node
time HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 brew install node cocoapods

# Xcode Cloud does not read eas.json. Required EXPO_PUBLIC_* values must be
# assigned to this workflow through App Store Connect shared environment
# variables. Fail before archiving instead of shipping a bundle that crashes.
time node apps/mobile/scripts/validate-public-env.mjs

# install node modules
time npm ci --workspace @slugswap/mobile

cd ./apps/mobile

time npx expo prebuild -p ios
echo "Prebuild complete"
date
