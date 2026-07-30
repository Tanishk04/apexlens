# Releasing ApexLens

Releases are tag-driven. Pushing a `v*` tag runs
[`.github/workflows/release.yml`](.github/workflows/release.yml), which re-runs the full CI suite,
builds the extension, and publishes a GitHub Release with the installable zip attached.

## Cutting a release

1. **Bump the version in both files.** They must match the tag exactly — the workflow fails the
   build if they disagree, because Chrome rejects an upload whose `manifest.json` version is not
   greater than the previously published one.

   - `package.json` → `"version"`
   - `manifest.json` → `"version"`

2. **Add a `CHANGELOG.md` section** for the new version. The workflow extracts the text between
   this heading and the next one and uses it verbatim as the release notes, so write it for the
   people reading the Releases page — not as a commit dump. It fails the build if the section is
   missing.

   ```markdown
   ## [1.1.0] — 2026-07-25

   ### Added
   - ...
   ```

3. **Merge that to `main`**, then tag the merge commit and push:

   ```bash
   git checkout main && git pull
   git tag v1.1.0
   git push origin v1.1.0
   ```

4. **Watch the run** under Actions. On success the Release appears with `apexlens-1.1.0.zip`
   attached.

## Publishing to the Chrome Web Store

The workflow does *not* upload to the store — that stays manual, so a human decides when users
receive an update.

1. Download `apexlens-<version>.zip` from the GitHub Release.
2. Upload it in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Update the listing if the feature set changed — see
   [`docs/chrome-web-store-listing.md`](docs/chrome-web-store-listing.md).
4. Submit for review.

Keeping the same artifact in both places means what users install from the store is byte-identical
to what CI built from the tag.

## If a release fails

The tag stays, so fix forward rather than reusing a version number:

- **Version mismatch or missing changelog** — the build fails before publishing anything. Delete
  the tag (`git push --delete origin v1.1.0`), fix, re-tag.
- **A failure after the Release was created** — delete the Release in the GitHub UI, then the tag,
  then re-tag once fixed.
- **Already published to the store** — do not delete anything. Ship a patch version.
