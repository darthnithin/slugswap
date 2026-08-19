# SlugSwap general-tools redesign

This checkpoint preserves the approved direction for expanding SlugSwap from a
point-sharing utility into a broader set of everyday UCSC tools while keeping
the SlugSwap name.

## Product structure

The primary navigation is intentionally limited to four destinations:

1. **Home** — a personalized campus dashboard with dining, rooms, My GET, and
   point-sharing shortcuts.
2. **Dining** — dining-hall selection, day and meal filters, hours, and menus.
3. **Map** — a campus map with dining, study, and essentials categories.
4. **More** — study rooms, personal tools, notifications, product information,
   feedback, and account actions.

Study rooms, My GET, and point sharing are pushed detail screens rather than
permanent tabs. Meal claim remains a focused full-screen flow.

## Visual direction

- Tone: warm editorial campus guide rather than institutional dashboard.
- Canvas: cream paper-like surfaces with restrained borders and shallow depth.
- Display type: editorial serif for major titles and metrics.
- UI type: humanist sans for navigation, controls, and dense information.
- Illustration: simple UCSC-specific landmarks, paths, trees, map pins, and
  dining symbols.
- Shape language: mostly continuous 12–18 px corners; pills only for compact
  filters and status controls.

## Approved palette

- Forest: `#183D32`
- Gold: `#F4C332`
- Cream: `#F6F1E5`
- Soft white: `#FFFDF7`
- Coral: `#F06A4F`
- Muted sage: `#DDE2D1`
- Ink: `#102E27`

The production wordmark is an outlined, optically spaced Figtree Semibold
treatment. See `apps/mobile/assets/src/brand/` for the production SVGs, source
font, palette, and license.

## Reference boards

- `00-visual-direction-type-b.png` — the approved Type B brand and interface
  direction. Its generated logo is superseded by the production assets in
  `apps/mobile/assets/src/brand/`.
- `01-core.png` — signed-out entry, signed-in Home, and More.
- `02-public-tools.png` — Dining, Map, and Study rooms.
- `03-personal-tools.png` — My GET, Point sharing, and Meal claim.

These boards define information hierarchy and tone. Implementation should use
real app data and native interaction patterns rather than reproduce incidental
image-generation artifacts literally.
