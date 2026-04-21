#!/bin/bash
set -e
echo "Running ci_post_clone.sh"

# cd out of ios/ci_scripts into main project directory
cd ../../

# install node and cocoapods
#HOMEBREW_NO_AUTO_UPDATE=1 brew install node cocoapods
brew install node cocoapods

# install node modules
npm install

# See note above about patching for GetEnv Issue
#npm i patch-package
#npx patch-package


npx expo prebuild -p ios
