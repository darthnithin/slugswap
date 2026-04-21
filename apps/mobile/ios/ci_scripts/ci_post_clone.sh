#!/bin.bash
set -e
echo "Running ci_post_clone.sh"

# cd out of ios/ci_scripts into main project directory
cd ../../

# install node and cocoapods
brew install node cocoapods

# install node modules
npm install

# See note above about patching for GetEnv Issue
#npm i patch-package
#npx patch-package

# xcode cloud sets `CI` env var to 'TRUE':
# This causes a crash: Error: GetEnv.NoBoolean: TRUE is not a boolean.
# This is a workaround for that issue.
npx expo prebuild
