# App Store screenshots

This folder contains a five-panel panoramic App Store screenshot set for the
6.9-inch iPhone listing. Each numbered output is a standalone 1320×2868 PNG;
together, the five files form one continuous visual across the App Store
carousel.

The generator uses Blender in headless mode to place each app screenshot onto
an iPhone 17 Pro Max model and render the blue metal, bezel, and camera-angle
perspective. It then builds and slices the five-panel panorama with Sharp.

## One-time setup

1. Install dependencies from the repository root with `npm install`.
2. Install Blender on macOS with `brew install --cask blender`.
3. Download the model named in `3d/iphone-17-pro-max/SOURCE.md` and place its
   Blender file at:

   ```text
   apps/mobile/store-assets/app-store/3d/iphone-17-pro-max/iphone-17-pro-max.blend
   ```

The licensed model and intermediate Blender renders are intentionally ignored
by Git. Source screenshots, the generator, and final App Store outputs are
versioned.

## Regenerate

1. Replace `source/01-home.png`, `source/02-dining.png`, and
   `source/03-map.png` with clean Release-build screenshots. Inputs must be
   exactly 1320×2868 and should already contain the iOS status bar and Dynamic
   Island. The renderer deliberately suppresses those parts of the 3D model.
   `04-rooms.png` and `05-launch.png` are retained as optional captures for a
   future layout but are not used by the current panorama.
2. From the repository root, run:

   ```bash
   npm run app-store:generate
   ```

3. Review `panorama-preview.png` and `panorama-cut-guide.png`.
4. Upload the files from `6.9-inch/` to App Store Connect in filename order.

The generator validates source dimensions, re-renders stale phone mockups, and
exports opaque PNGs. Edit the `PANELS` and `PHONES` configuration near the top
of `scripts/app-store-screenshots/generate-app-store-screenshots.ts` for the
next creative pass. Model attribution and licensing details are in
`3d/iphone-17-pro-max/SOURCE.md`.
