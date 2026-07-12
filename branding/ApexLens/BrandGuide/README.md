# ApexLens Brand Guide

## The mark

An open "peak" (apex) stroke with a breakpoint-dot accent at the summit — two line segments and
one circle. No magnifying glass, no cloud icon: those read as generic "log analyzer" stock iconography
and too close to Salesforce's own cloud mark. The peak evokes "apex"; the dot is the same visual
language developers already read as a debugger breakpoint (VS Code, Apex debugger).

## Color palette

| Token        | Hex       | Use                                                              |
|--------------|-----------|-------------------------------------------------------------------|
| Primary blue | `#2563EB` | The mark's peak stroke on light backgrounds                       |
| Accent blue  | `#3B82F6` | The breakpoint-dot accent (all variants)                          |
| Dark navy    | `#0F172A` | App-icon container background, dark-surface text                 |
| Slate        | `#334155` | Secondary/structural elements (window-chrome dots, borders)       |
| White        | `#FFFFFF` | Mark + wordmark on dark or colored backgrounds                    |

This is the same hue family as `--c-debug` in the product's own `src/index.css`
(`#1d4ed8` light / `#60a5fa` dark) — the brand color and the in-app "debug" accent are deliberately
the same blue, not two unrelated colors.

**No gradients on the mark itself, ever.** A restrained navy gradient is permitted only on the square
app-icon container background (see `SVG/mark-square.svg`).

## Typography

**Inter**, Bold/Extrabold (700–800) for the wordmark. Already the product's UI typeface
(`@fontsource-variable/inter`) — no second font family. Wordmark tracking: `-2` (tight, geometric).

## Minimum size

- **Icon-only mark**: 16px absolute floor (favicon/toolbar). Legible down to 16px by design — verified
  during asset generation.
- **Full horizontal lockup** (mark + wordmark): 120px width recommended minimum; below that, use the
  icon-only mark alone instead of shrinking the full lockup.

## Clear space

Keep clear space around the mark equal to at least the breakpoint dot's diameter (≈8% of the mark's
height) on all sides — don't crop the peak's rounded feet or crowd the dot with adjacent UI/text.

## Incorrect usage

- Don't recolor the mark outside the palette above.
- Don't add drop shadows, outlines, or bevels to the mark.
- Don't stretch or skew the lockup — the mark and wordmark scale together, uniformly.
- Don't place the colored mark on a similar-hue blue background — use the white/mono variant instead
  (see `Logo/Dark/` and `Logo/Monochrome/`).
- Don't recreate the peak with a crossbar or literal "A" letterform — the open two-stroke shape is the
  mark; adding a crossbar turns it into a different (unapproved) glyph.

## Grid / construction

The mark is drawn on a 512×512 grid: peak vertex at (256, 130), feet at (92, 418) and (420, 418),
66px stroke weight, round caps/joins, breakpoint dot radius 42 centered on the vertex. See
`SVG/mark.svg` for the authoritative path data — all other variants are recolors/containers of this
same geometry, not independent redraws.

## File index

See `README.txt` at the root of this package for the full folder/file listing.
