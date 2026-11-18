# Excel import and photo support — verification notes

## Source of data
- «Крым_4_дня_оптимизирован_все_листы.xlsx»
- «Архыз_4 дня.xlsx»

Only gear, food and first-aid lists were extracted; personal contacts, transport reservations and private routes were excluded.
The catalogue imports into a local browser database. Source-file data is stored in the public repository as a static compressed seed and should not be interpreted as a currently accurate personal inventory.

## Data counts
- Foods: 43
- Package variants: 43
- Gear: 113 input rows / 111 unique gear records after matching
- Medical names: 27
- Historical medical pack records: 54
- Source references: 9
- External photographs fetched: **0** (unavailable Google Drive folder / LighterPack URLs)

## Photos
- File upload uses the browser only; accepted MIME types: JPEG, PNG and WebP.
- Images are resized to no more than 640px on the longest side with a four-per-record limit.
- PhotoData is validated and saved on the same IndexedDB library record; no network upload.
- Edits preserve photoData. Library JSON and full backup v2 include photoData.
- CSV does not carry image bytes.
- Keep regular offline backup copies: browser cache eviction removes local photos too.

## External blockers
- Google Drive folder 1bsheOi134N0or6DekxmtK-eaIFlxyPf3 returned 404 for both connected Google accounts.
- LighterPack a9cua5, 4pg9c9, gdl4a, 0lr1s5 could not be fetched; no product photographs or specifications from those pages were asserted.
- If access is later restored, match product-specific photos to exact models and record image rights/license before importing.

## QA
- Tests: tests/seed-photos.spec.ts for one-time seed, repeat merge and photo persistence.
- Tests: existing project TypeScript, unit and browser E2E suites.
- Final Actions run IDs to be attached after CI completion.
