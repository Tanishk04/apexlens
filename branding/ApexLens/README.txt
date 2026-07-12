ApexLens — Brand Asset Package
==============================

Full production branding system for the ApexLens Chrome extension (AI-assisted
Salesforce Apex debug log analysis). See BrandGuide/README.md for the palette,
typography, minimum sizes, and usage rules.

FOLDER GUIDE
------------
SVG/          Hand-authored master vector files (source of truth). Every PNG in
              this package is rasterized from these. Wordmark text uses
              font-family="Inter" — opens correctly in Figma/Illustrator/Inkscape
              if Inter is installed; for portable rendering elsewhere the
              generation script embeds the real Inter font at raster time.

Icons/        The icon-only mark, rasterized at every size a browser extension
              conventionally needs: 16, 18, 19, 20, 24, 32, 48, 64, 128, 256,
              512, 1024 (one icon.png per <size>/ folder).

Favicons/     favicon-{16,32,48}.png, a multi-resolution favicon.ico (packs all
              three), and favicon.svg (the vector source).

ICO/          Copy of favicon.ico for convenience.

Logo/
  Horizontal/   Mark + wordmark side-by-side — light-bg and dark-bg versions.
  Vertical/     Mark above wordmark, stacked.
  Dark/         Everything intended for placement ON a dark background.
  Light/        Everything intended for placement ON a light background.
  Monochrome/   Single-color black and white mark variants.

ChromeStore/    Chrome Web Store listing assets:
  - app-icon-square-{512,128}.png, app-icon-circle-512.png (rounded-square /
    circular app-icon treatments)
  - promo-small.png (440x280), promo-large.png (920x680), promo-marquee.png
    (1400x560) — Chrome Web Store promotional tile sizes
  - screenshots/  Two PLACEHOLDER screenshot frames (1280x800). These are
    branded placeholder frames, not real captured UI — swap for actual app
    screenshots before submitting to the Web Store.

BrandGuide/     Usage guidelines: palette, typography, minimum size, clear
                space, incorrect usage, construction grid.

PNG/            Flat copy of every rasterized PNG in one folder, for convenience.

WHAT'S DELIBERATELY NOT INCLUDED
---------------------------------
No PDF exports — nothing in a Chrome extension consumes PDF logos; it's a
print/marketing-collateral format with no real use here. All master files are
vector SVG, which any design tool can export to PDF directly if ever needed.

REGENERATING THIS PACKAGE
--------------------------
node branding/scripts/generate-assets.mjs
(run from the repository root; requires the `sharp` devDependency, already in
package.json)
