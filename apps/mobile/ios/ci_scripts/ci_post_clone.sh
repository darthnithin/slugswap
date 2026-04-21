#!/bin/bash
set -e
system_profiler SPHardwareDataType

echo "Running ci_post_clone.sh"
date
# cd out of ios/ci_scripts into main project directory
cd ../../

# install node
#HOMEBREW_NO_AUTO_UPDATE=1 brew install node
time brew install node

# install node modules
time npm install

# See note above about patching for GetEnv Issue
#npm i patch-package
#npx patch-package


time npx expo prebuild -p ios
echo "Prebuild complete"
date
