# Hanapipi deployment audit — 2026-10-11

Read-only audit used installed Wrangler CLI and authenticated Cloudflare Workers API. All requested inventory endpoints succeeded. No web-search inference. Account has two executable scripts and four service records. 85 Hanapipi versions existed before consolidation. No custom domains and no zone routes were attached to Hanapipi.

|Service / object|Public URL|Current version before task|Purpose / source|Active traffic|Decision|
|---|---|---|---|---|---|
|hanapipi-flower (Worker)|https://hanapipi-flower.hutstudio.workers.dev/|af3f7932-d1f7-4bf3-9885-a7ebc2c837c2|MAIN. Source annotation absent; SmartBouquet bundle identifies experiment/smart-bouquet-25d@0ec1f30 as closest recoverable source.|100%|KEEP; consolidate cinematic path here|
|cinemalab (version alias, not service)|https://cinemalab-hanapipi-flower.hutstudio.workers.dev/|efa03c1e-4ff0-4b56-af27-5785a869b80f|Accepted cinematic / ba70c84|Preview only|Retire access AFTER MAIN verification|
|smoke-progressive-test (version alias)|https://smoke-progressive-test-hanapipi-flower.hutstudio.workers.dev/|c5168638-1ee2-43ca-85eb-d7e103927051|Partial progressive / e3dab01|Preview only|Retire access AFTER MAIN verification|
|smoke-staged-test (version alias)|https://smoke-staged-test-hanapipi-flower.hutstudio.workers.dev/|d6daf190-4a42-4905-a873-3ef1e3787ad3|Staged phone candidate / 7247348|Preview only|Retire access AFTER MAIN verification|
|Immutable version URLs|https://VERSIONPREFIX-hanapipi-flower.hutstudio.workers.dev/|85 retained versions|Historical Worker versions, not permanent services|Preview only|Retain versions; disable preview URL access after verification|
|hanapipi-flower-prod (empty service record)|No enabled hostname|script:null|Legacy default config target; no executable script/routes|None|KEEP dormant config reservation; not a cinematic duplicate|
|hanapipi-flower-staging (empty service record)|No enabled hostname|script:null|Legacy reservation; no executable script/routes|None|KEEP dormant; no public deployment to retire|
|vn-invest-assistant|Unrelated account Worker|Not audited further|Unrelated project|Outside scope|KEEP untouched|

## Protected MAIN baseline

- Active deployment before task: 861804ad-3c86-4cf6-af47-58fd8ac93bc7, version af3f7932, 100%; created 2026-09-28.
- Existing deployed bindings use staging D1 and hanapipi-media-staging R2. Keep bindings and API flags; never expose secrets.
- Existing build/deploy: npm run build:staging / npm run deploy:staging. Generated Wrangler config must resolve name hanapipi-flower. Default production config name is NOT the intended target.
- GET /, /shop, /build-bouquet, /flower-finder, /cart, /delivery-information: 200 SPA HTML. /api/health: pre-existing 404 JSON. /cinematic-lab was 200 HTML fallback, not proof of a cinematic route.
- HTML SHA256 fdd63fa853e7c2ae2bbe31b7a0aa5ca43a8f6a156bf05cd5dea62f41d71dcd49.
- Main JS index-Cc_LGifb.js SHA256 ace8e17f93cce00e014e23a9117a972f28e444067567d2260541d8ce6b5c6cf1; CSS index-CXETTYa2.css SHA256 ea368e8a59c5f018126bd4b14a7001feb9ae6d22191c33d9583bea4752f1bb12.
- SmartBouquetPage-Bd5tK30U.js and SmartBouquetPage-nceNsnX2.css identify the Smart Bouquet route lineage. Exact original source commit is NOT verified from deployment metadata. Root/browser behavior must match before deployment.
- Desktop1440×900/mobile390×844 baseline: 0 runtime errors,18 images. Root text/links/image assets/geometry recorded; screenshots saved in ignored audit workspace.

## Git audit / archive

Root test/smoke-progressive-readiness@7247348 contains unrelated dirty user work; excluded from release. main/cinemalab@a8ae71e lack deployed Smart Bouquet; do not replace MAIN with those branches.

|Branch|HEAD before task|Purpose|Action|
|---|---|---|---|
|main / cinemalab|a8ae71e|Historical foundation/preview|Retire old cinematic branch after migration; main reference retained|
|experiment/smart-bouquet-25d|0ec1f30|MAIN route lineage|Retain unrelated source history|
|experiment/hut-flower-3d|ba70c84|Accepted old cinematic|Archive contains lineage; retire branch after route verification|
|test/smoke-progressive-readiness|7247348|Latest staged candidate; unrelated worktree edits|Archive latest meaningful runtime; preserve dirty working tree|
|archive/cinematic-lab-smoke-final|fb84cac|ONE current old-cinematic archive|Pushed; separate CLEAN checkout passed126 tests/build/lint/diff|
|development/cinematic-lab|Integration from0ec1f30 + archive|ONE authoritative development route|Keep after verified release|

Archive includes progressive readiness, re-entry fix, watchdog, staged candidate, PNG88/artwork, timing1150/220/380. Staged/performance status remains PARTIAL, not globally accepted performance PASS. Two native-scroll test fixture browser globals were missing; fixed mocks only, assertions unchanged. Archive production build needs locked dependencies and existing staging publishable environment; RIFE media stays in unchanged R2 prefix documented in docs/cinematic/rife-preview-media.json.

## Retirement mechanism

There are no separate cinemalab/smoke Worker services to delete. Safe intended mechanism: keep MAIN workers.dev enabled; disable preview URLs on this same Worker after verified deployment, covering aliases and immutable preview access. Historical versions retained. No new service/infrastructure.

## Release receipt

Pending route verification and exact pushed-commit deployment. Do not retire aliases until this receipt records successful MAIN and cinematic checks.

## Completed checkpoint — 2026-10-11T01:40:27.176Z

- Exact pushed/verified runtime development/cinematic-lab@40c30a532fc7ab402d73f484168f2bac36a4a472 deployed to existing hanapipi-flower version2bfc6ad7-b489-4954-879e-00126a8d5c3f at100%. No new Worker. Subsequent receipt/config commit adds no runtime or media change.
- MAIN desktop1440×900/mobile390×844 text/links/image assets/geometry match baseline; screenshot review matches. No cinematic heavy requests on root. Cinematic direct/refresh PASS,0runtime errors,smoke draw/re-entry31/31,forward+reverse RIFE readyState3. Public initial bundle asset hashes equal the verified build.
- Existing API vars and D1/R2 bindings exactly match protected af3f7932 version (22 bindings). Root CSP unchanged; image-data mask allowance scoped only to cinematic navigation. RIFE Range mapping/objects unchanged.452 protected source/media files equal archive Git identities.
- Workers.dev enabled:true,previews_enabled:false verified via API. All three aliases and immutable version preview returned404; MAIN / and /cinematic-lab returned200. Historical versions retained,unrelated Worker untouched. Dormant prod/staging records remain without executable script/hostname/routes.
- Local cinemalab,experiment/hut-flower-3d,test/smoke-progressive-readiness retired after ancestry/remote archive checks. Remote experiment/hut-flower-3d and test/smoke-progressive-readiness retired with exact-SHA leases; cinemalab remote did not exist. MAIN/Smart Bouquet references retained for their unrelated production lineage.
- Active checkout now development/cinematic-lab;37 original user changed-line deltas match the preserved pre-switch patch exactly,none staged/pushed/deployed. One small router conflict resolved by retaining public lazy import and existing user copy edits.
- Remaining cleanup constraint: all five qa/temp registered worktree moves were denied by Windows. Four are dirty; keep all unchanged/ignored,not force-deleted. Unknown local authoring/media and unrelated phase9–13 preserved.
- preview_urls:false recorded in existing Wrangler config so future deployments do not re-enable duplicate public previews. Deployment commands continue to target verified staging-generated name hanapipi-flower.
