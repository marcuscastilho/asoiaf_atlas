# Presentation Review - 2026-11-09

## Overview Performance Revision

- Zoom/detail browser checks: 20 passed, 0 failed
  (`zoom-detail-smoke.log`, strengthened checks executed after review).
- Unit tests: 22 passed. Presentation/cartography checks on the LOD code:
  21 and 34 passed respectively.
- Verified: progressive names, unchanged detailed typography and 4642px
  terrain, 245 raw locations, 208 catalog instances and 387 search entries.
- Explicit duplicate move/zoom/viewreset events add no layout pass when
  geometry is unchanged; legend geometry changes still recompute.
- Local placement measurements and limitations:
  `performance-review.json`, `performance-baseline.json`,
  `performance-after.json`. These are not total rendering/FPS measurements.
- No new full-suite run was performed for this performance revision.
  The full-suite timeout and earlier-log caveats below remain applicable.

## Earlier Full-Suite Caveat

- Label-layout browser checks: 21 passed, 0 failed (`label-layout-smoke.log`).
- Cartography browser checks: 34 passed, 0 failed (`cartography-smoke.log`).
- The dense Riverlands check covers fully onscreen, UI-unobscured labels;
  clipped or UI-covered edge cases are reported separately.
- The latest full smoke run did NOT complete: it timed out at
  `scripts/smoke.mjs:495` in the pending-Google-script scenario.
- `local-smoke.log` still records an EARLIER 75/75 run, not this final
  presentation revision. Do not treat it as a current full-suite pass.
- The isolated Google timeout diagnostic subsequently passed
  (`google-timeout-check.log`). This does not establish the cause of the
  full-suite timeout or replace a complete full-suite run.
