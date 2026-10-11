# Cinematic consolidation cleanup manifest

Archive prerequisite: archive/cinematic-lab-smoke-final@fb84cac pushed, separate clean checkout126 tests/build/lint/diff PASS. Required current artwork/smoke/RIFE/runtime tests preserved. No new effect or performance experiment.

## Active tracked cleanup

Deleted obsolete isolated preview entry/config/build path: src/cinemaPreviewWorker.js, wrangler.cinema.jsonc, vite.cinema.config.js, scripts/cinematic/build-preview.mjs and package build:cinema-preview command. Same unchanged RIFE Range serving moved to src/server/cinematicMedia.js inside existing MAIN Worker.

Deleted rejected DEV inspector/sparse preview path: src/pages/SmokePreviewPage.jsx, src/components/cinematic/smokePreviewConfig.js, smoke-preview.css and test/cinematic-smoke-preview.test.js (tests for removed implementation). CinematicLabRoute now exclusively serves current cinematic. No src/test/scripts/config consumers of qa/ remain.

Kept all other cinematic tests and added cinematic-route tests for isolated lazy routing, root CSP preservation and existing RIFE Range/HEAD behavior. No test assertions removed to hide failures; archive native-scroll browser fixture corrected missing window.location/document/idle mocks with cleanup.

## Reviewed generated evidence (E/F/G/H/I)

After successful release, explicit per-file inventory removes historical benchmark scripts, raw traces/JSON, screenshots, logs, rejected source snapshots, duplicated built media and superseded reports in these subtrees:

accepted-runtime-phone-deploy; archive-ui-rnd; bloom-invalidation; bloom-pair-boundary; bloom-root-boundary; bloom-shared-alpha-audit; cinemalab-public-preview; cinematic-baseline-release; cinematic-chapter4-alignment; cinematic-copy-timing; cinematic-fast-scroll-perf; cinematic-frame-restore; cinematic-hfinal-integration; cinematic-horizontal-mask; cinematic-letter-reveal; cinematic-perf-v2; cinematic-performance-v3; cinematic-red-responsive; cinematic-responsive-frame-restore; cinematic-satin-aperture; cinematic-shared-image-box; cinematic-shared-layout; cinematic-smoke-forensics; cinematic-smoke-mvp; cinematic-smoke-scroll; cinematic-ui-polish; dev-smoke-preview; effect2-palette-flow; effect2-pink-parity; frame-bloom-targeted; frame-cache-targeted; phone-smoke-telemetry; progressive-smoke-readiness; rife-demux-audit; rife-deployed-churn; rife-reverse-completion; rife-watchdog-recovery; smoke-cleanup-final; smoke-handoff-attribution; smoke-phone-acceptance; smoke-reentry-attribution; smoke-startup-telemetry; staged-smoke-preload.

Inventory includes individual paths, size and category, validates resolved paths remain inside workspace, skips links/unknown extensions and never recursively follows junctions. Current audit evidence/helper is kept in ignored .wrangler/consolidation-audit, not application code. Generated QA ignored by .gitignore.

## Preserve A/B/C/D/J/K

MAIN homepage/Smart Bouquet/commerce/API source and all unrelated dirty user edits excluded from release. Public chapter/art/H-final PNG88/JPEG masters and existing R2 RIFE objects retained. Required cinematic regression tests, compact history, deployment audit and media identity manifests retained.

qa/phase9–phase13 are unrelated commerce evidence: KEEP. Existing dirty temporary release worktrees require preservation rather than deletion; move to ignored .wrangler/preserved-worktrees if safe, record original paths. Unknown local authoring scripts/media remain until reviewed. C:/lập trình/Hanapipi-old-preview remains untouched outside workspace. No broad reset/restore/clean.

## Release / cleanup result

Pending final public verification. Branch/service retirement occurs only afterward. Preview aliases are version URL access on ONE Worker, not separate services; disable preview URLs, retain historical versions and MAIN hostname. Dormant prod/staging service reservations and unrelated Worker retained.
