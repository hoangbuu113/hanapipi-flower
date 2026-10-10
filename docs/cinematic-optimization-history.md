# Cinematic optimization history

Keep evidence and rejected directions here so later tasks do not repeat them without a new causal hypothesis. Runtime and fresh measurements remain authoritative.

## Current authoritative checkpoint

- Accepted Chapter entry: frame1150ms, label220ms, headline start380ms (updated2026-10-10; prior1050ms retained in historical entries).
- Existing accepted SVG runtime/artwork retained.
- Per-petal raster Cache A REJECT; Cache B REJECT; Cache C INVALID / NOT VERIFIED. Do not continue the same cache strategy without new evidence.
- Earlier report: [frame/cache pass](../qa/frame-cache-targeted/REPORT.md).

## 2026-10-10 ? Shared-layer attribution, final STOP

# Chapter 1 shared-layer attribution � STOPPED

STATUS: PARTIAL / NOT PASS. Attribution completed for the accepted isolated ChapterImages SVG runtime. E1 REJECT (visual); no candidate promoted, no production source edits, no second experiment, no commit/deploy. User stopped further measurement/verification on 2026-10-10.

### Baseline / methodology

Actual accepted ChapterImages/BloomIris and CSS, direct flushSync React publication; no cache replacement. Same prior order/prewarm: fresh Chrome profile per viewport/repetition, fonts +700ms, yellow .40 +800ms; first repetition visits .50 +180ms/screenshot then .40 +350ms; later repetitions yellow-only. Four-second .40?.60 linear QA sweep. Metrics below cover .44?.56 (2400ms), gap selection by previous progress. Three runs per1920�1080DPR1 and3840�2160DPR1. All six use identical trace categories; this differs from older first-run-only tracing, so compare within this pass, not directly to older untraced medians. Audit proxies are off in benchmark runs.

Chrome153/headless/new, Windows GPU/D3D11, rAF can reach�120Hz. Isolated fixture exercises production ChapterImages; it does not reproduce the full native wheel/master-scroll page. Mobile screenshots are viewport emulation390�844DPR3, not a physical phone. No full-route parent audit was completed.

|Viewport|Run|p50 ms|p95|p99|worst|Raster ms|Raster/window|RasterTask count|Paint count|Style invalidations|React commits|max main JS task ms|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|1920�1080|1|25.0|33.4|41.8|41.8|2345.8|97.7%|388|40|3146|100|7.2|
|1920�1080|2|25.0|33.4|66.8|66.8|2342.4|97.6%|372|40|3050|97|7.2|
|1920�1080|3|25.0|33.4|58.4|58.4|2346.7|97.8%|384|37|3136|100|7.5|
|3840�2160|1|75.0|91.7|91.8|91.8|2392.1|99.7%|155|40|1121|35|6.3|
|3840�2160|2|75.0|91.6|108.3|108.3|2391.4|99.6%|155|37|1154|36|6.8|
|3840�2160|3|75.0|91.6|100.0|100.0|2391.5|99.6%|159|37|1185|37|6.6|

Do not discard variability:1920 worst41.8/66.8/58.4ms;4K91.8/108.3/100.0ms. Max flushSync callback6.5�6.7ms at1920 and5.5�5.9ms at4K. Main-thread RunTask maxima6.3�7.5ms. These are not the�50ms main-thread JS stalls that would explain the observed presentation gaps.

Raster metric is trace RendererRasterWorker duration clipped to2400ms; in checked first runs these slices execute on CrGpuMain, not a set of CPU worker threads. Treat as serialized GPU raster activity/window, not total machine CPU utilization. At1920 run1,376/388 RasterTasks target actual iris layer10; at4K run1,140/155 target actual iris layer6. DOM ownership is independently established below; raster_id is never used as a SVG identifier.

### Mutation/invalidation/layer findings

- DOM.enable +DOM.getDocument +LayerTree.enable and DOM.describeNode/backendNodeId map the expensive layer to **.chapter-bloom-iris**. Its reasons are Trivial3DTransform and WillChangeTransform. Layer IDs vary by run.31 incoming .chapter-bloom-pigment HTML opacity owners have no independent drawing layers in the baseline.
- The color interval has stationary geometry: radius0/twist1. Both endpoint artworks are static SVG gradients/paths; overlay opacity is the changing property.
- 1920 audit:97 color frames,3007 incoming-opacity writes (=31�97), all actual changes, zero redundant opacity writes. Two extra rect-opacity writes occur at entry; total3009.
- 4K audit:36 frames,1116 incoming-opacity writes (=31�36), all actual changes, zero redundant opacity writes. Two entry rect-opacity writes; total1118.
- Each repeated opacity owner changes once per observed React frame. No evidence of duplicate unchanged writes, or multiple writes/owner/frame. Each write includes old/new/input/timestamp, element/group/petal index and layer-subtree membership in runs/*-audit.json; mutation-attribution.json groups frequency and changed/redundant counts.
- Transform changes occur at the first sampled entry frame only:30 writes at each width. At1920,28 normalize to the same stored value; at4K,5 do.4K also has two base-path d writes at entry. This one-frame boundary behavior cannot explain raster across almost the whole color interval.
- After the entry frame, every sampled iris/base/petal/incoming bounding box is constant. No sustained SVG fill/stroke/gradient-stop/d, transform, clip/mask/filter, size/origin/z-index/stacking writes are observed. Photo hidden state swaps once (two actual writes at mix�.5).
- StyleRecalcInvalidationTracking timestamps correlate with actual opacity mutation; React call stacks reach setValueForStyle. React commit count tracks requested frames, but memoized SVG drawings do not receive continual pigment/path rewrites.
- Distinguish **Paint record generation from raster replay**: baseline37�40 Paint events mainly cluster at color entry (incoming groups emerge from opacity0), plus the one hidden-photo swap. They are not proof of complete SVG path recording every frame. Shared surface raster activity nevertheless remains�97.6�99.7% through the interior while alpha changes recur.
- Narrow supported attribution: repeated real opacity updates in overlapping descendants of the shared iris raster surface cause expensive reraster/compositing work for this fixture. The exact Chromium/Skia internal invalidation policy is not proven. Full-page --active-base CSS-variable changes exist in source; the isolated baseline keeps that parent fixed, so those writes are not necessary to reproduce this bottleneck. Do not claim all full-route parent/tile causes have been exhaustively ruled out.

### E1: compositor-boundary counterfactual

Hypothesis written before execution: promote exactly the31 existing incoming HTML opacity owners with .chapter-bloom-pigment{will-change:opacity}; preserve SVG paths, palette, order/alpha nesting, geometry and timing. No raster caches or asset replacements. QA stylesheet only, never production.

The initial paired attempt recorded1920 BASE (p9541.6/worst50.0ms,raster2335.9ms/tasks352), then E1 trace finalization timed out. That paired candidate trace is **NOT VERIFIED**, not a valid repeated A/B result. One bounded fresh-session counterfactual then finalized successfully at1920 and3840; no broad follow-up/retry after the user STOP.390 has only a prewarm image, no completed counterfactual trace, therefore NOT VERIFIED.

|Fresh-session E1 (single run only)|p50|p95|p99|worst|Raster ms /2400|RasterTasks|Paint|React commits|max main JS task|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|1920|8.3|8.4|8.5|8.5|31.4|20|5|288|6.4|
|3840|8.3|8.4|16.7|33.3|120.5|30|8|281|8.7|

Mapped layer inventory increases6?67 (drawing4?65) across the sweep. Additional warm/adjacent surfaces also promote automatically; the CSS hint is not a guarantee of exactly31 new layers. The trace reduction supports the alpha/layer-boundary attribution even though React commits rise. **Not a performance acceptance result**: only one complete candidate run per width, visual output differs, physical-mobile/reverse/memory gates are unverified. No claim of persistent-memory neutrality.

### Visual � REJECT

Same native resolution, same accepted geometry/progress: BASE vsPROMOTE at color .44/.47/.50/.53/.56 and full-motion0/.25/.50/.75/1, on390DPR3/1920DPR1/3840DPR1. PNGs and numeric differences are in visual/. No extra filters/upscale.

At4K color100%, mean absolute RGB-channel difference7.462/255, max84;42.221% channels differ by>1 and22.159% by>8. The native crop visibly shifts pink surfaces toward warm/yellow; it is not merely edge antialiasing. See visual/3840-detail-original-candidate-diff8x.png (left BASE, middle E1, right absolute difference�8).1920/mobile also differ slightly. Mechanism of the visual drift was not investigated further. Quality gate fails decisively.

E1 **REJECT**. Do not retry this promotion direction without new evidence explaining and preventing the visual regression. No candidate2. No accepted runtime change.

### Preservation / verification / stop

Frame1050ms, label220ms, headline380ms retained. BloomIris/bloomReveal/bloomPalette/ChapterImages/layout/headline/timeline hashes match the prior authoritative source snapshot; all109 monitored production media hashes match (chapter art,H-final,RIFE included). HEAD remains a8ae71ee645db6f50ad8742af91062befee02ea0.

Important provenance limit: before-hashes.json source values derive from the preceding authoritative QA report, not a fresh byte snapshot of every file at this pass start. Final hash check matches162/164 source references; artistic-preview.css and ArtisticEditorialTransitions.jsx differ. Their observed last-write times19:19:11 and19:20:04 are after the18:56:58 QA snapshot file; this agent did not edit either file. Preserve those outside edits. Their origin and full-route impact are unverified; do not claim the entire working tree is unchanged or revert them. Their hashes are retained in preservation.json.

No new full tests/build/lint run: explicitly cancelled by the user's STOP because no runtime candidate was accepted. git diff --check exit0 (existing LF/CRLF notices only). QA server stopped; owned measurement Chrome sessions closed. Existing unrelated working-tree edits preserved. No commit/deploy/public-preview update.

NEXT: stop this pass. Keep accepted SVG runtime. Any future targeted work needs new evidence; neither per-petal cache replay nor this failed opacity-promotion direction should be automatically retried.

### Evidence / reproduction

- measure.mjs: six baseline traces; --audit: QA-only synchronous write/observer audit (audited gaps are not benchmark medians).
- runs/*: native prewarm images, measurements, compressed Chrome traces; summary.json, mutation-attribution.json, layer-probe.json.
- HYPOTHESIS.md: pre-experiment causal hypothesis.
- measure-e1.mjs: initial paired attempt, stopped on finalization failure; counterfactual.mjs: fresh-session trace attempt. These are historical reproduction scripts, not instructions to resume the rejected direction.
- visual.mjs/detail.mjs and visual/: native comparisons/crops; comparison.html: gallery.
- before-hashes.json/preservation.json: monitored hashes and explicit drift; git-status-before.txt.

Evidence: [full report](../qa/bloom-invalidation/REPORT.md), [summary](../qa/bloom-invalidation/summary.json), [mutation attribution](../qa/bloom-invalidation/mutation-attribution.json), [native comparison](../qa/bloom-invalidation/comparison.html), [hashes](../qa/bloom-invalidation/preservation.json).


## 2026-10-10 — P1 whole warm/incoming pair boundary: REJECT

### Hypothesis / approach

Read this history and prior attribution before implementation. Additional earlier exclusion found in qa/frame-bloom-targeted/REPORT.md: B4 global incoming-opacity grouping was already REJECT because semitransparent curl/rim blending changed. Do not retry that grouping without materially new evidence.

New P1 boundary: retain each consecutive warm SVG + incoming SVG pair and its original inner opacity. QA-only CSS .chapter-bloom-base,.chapter-bloom-petal{will-change:transform}; no hint on the31 pigment-opacity owners, no DOM/art/cache replacement. This tests the pair parent, unlike rejected E1 incoming-only boundaries. Hypothesis: localize opacity-driven raster to paired surfaces while retaining consecutive source-over composition. Group opacity stays1; normal premultiplied source-over associativity predicts mathematical equivalence. It does not establish bit-identical finite rasterization or explain E1's color drift. Exact pre-probe note: qa/bloom-pair-boundary/HYPOTHESIS.md.

### Cheap probe / evidence

Exactly one3840x2160 DPR1 BASE and one P1 in fresh Chrome sessions; accepted SVG runtime, no production edit. Same fonts/yellow/pink prewarm/order as previous run1; same four-second .40->.60 sweep and2400ms .44->.56 focus, trace categories and hardware. Native screenshots .44/.50/.56 after500ms settle. One run each: not a repeated performance gate. No mobile/desktop expansion after rejection.

|4K single probe|p95 gap ms|worst gap ms|Raster/window ms|Raster/window %|RasterTask count|Mapped drawing layers|
|---|---:|---:|---:|---:|---:|---:|
|BASE|91.7|100.1|2391.2 /2400|99.63%|159|4|
|P1 paired boundaries|66.6|83.4|2344.9 /2400|97.70%|2391|34|

Mapped layer inventory6->37. Backend DOM ownership confirms the31 whole-pair parent layers (base +30 petals), rather than independently promoted pigment owners. No recorded browser exceptions. Alpha/style/transform/gradient-stop values and SVG/path counts agree at all three checkpoints after excluding the intentional parent will-change difference. See summary.json and runs/*-properties.json.

Raster decreases only46.3ms (1.94% relative), remaining nearly continuous; task count grows15.0x. Lower p95/worst in this single run does not satisfy the material raster-reduction gate or prove repeatability. The surface split increases available frame cadence while redistributing, not eliminating, almost all raster work. No persistent-memory neutrality claim.

### Visual

Native crop review: overall endpoint/intermediate palette and geometry stay consistent; no E1-style broad pink-to-yellow shift. Pixel-identical equivalence is NOT achieved: mean absolute RGB-channel delta .346/.340/.355 for .44/.50/.56, max34/28/28, >8 differences .121%/.100%/.136%. Inspected largest-difference crops show chiefly curl/rim/edge AA and subtle surface sampling differences. This is NOT a full visual PASS; no quality/detail/alpha gate was waived. Visual evidence: detail-*.png and comparison.html.

### Decision / preservation / stop

**REJECT: no material raster reduction.** Do not polish or promote P1. Do not automatically retry whole-pair will-change:transform under the same architecture; only new evidence showing why per-pair reraster would be avoided can justify revisiting it. No second hypothesis/candidate, no expensive verification for a losing probe.

Fresh SHA256 snapshots:164/164 monitored source files unchanged,109/109 media unchanged. This pass's snapshot is freshly measured, unlike the earlier prior-report hash reference. Accepted SVG/palette/geometry/gradients/count/detail, image sharpness, Chapter timing1050/220/380ms, layout/text, smoke/H-final/RIFE and scroll/timeline budget remain untouched. Existing outside Effect2 edits are included in the fresh baseline and preserved. No production runtime change, commit, deploy or preview update. QA server stopped and owned Chrome sessions closed.

Full tests/build/scoped lint not run because the candidate lost the cheap gate. git diff --check exit0; this is whitespace verification, not cinematic regression acceptance. Memory/reverse/re-entry/mobile gate NOT VERIFIED and deliberately not pursued.

NEXT: retain accepted SVG. A separately authorized future pass could attribute which unchanged SVG drawing operations dominate raster within the paired surfaces; do not infer a hotspot from raster_id, repeat this boundary hint, or restart rejected caching/grouping/E1 directions. No further work in this pass.

Evidence: [P1 hypothesis](../qa/bloom-pair-boundary/HYPOTHESIS.md), [P1 summary](../qa/bloom-pair-boundary/summary.json), [P1 native comparison](../qa/bloom-pair-boundary/comparison.html), [P1 fresh hashes](../qa/bloom-pair-boundary/preservation.json). Scripts/trace gzip/native screenshots retained under qa/bloom-pair-boundary/ for reproduction only.


## 2026-10-10 — Frame1150ms PASS; R1 root-only compositor-hint removal REJECT

### Part A — accepted timing adjustment: PASS

Only chapterEntryAnimation.js frameDuration1050->1150 and the focused duration assertion changed. Label remains220ms; headline remains380ms (offset240 + start140). Grapheme42ms interval /220ms fade /5px travel, font holding, CTA final-grapheme timing, frame geometry/stroke/layout and entry gate are unchanged. No scroll/cinematic runway change.

Fresh checks after final production edit:36 focused timing/copy/headline/chapter/scroll tests pass; actual-route browser gates390x844DPR3 and1920x1080DPR1 pass. Native timed captures0/220/380/1150/2200ms; two frame strokes per epoch, no native-jitter replay, one meaningful reverse/re-entry replay, unchanged CTA /shop, reduced-motion zero trace calls and fully drawn frame. Root npm run build passes; scoped lint of the two changed files exits0; git diff --check exits0.

Local cinematic-enabled compiler fixture also syncs only the helper and assertion to1150, with originals backed up in compiler-before/. The first fixture build used stale1050 because the sync command had a wrong working-directory-relative path; exclude cinema-build-stale.log. After exact source-hash-verified sync, a native warning interrupted one PowerShell attempt; the final complete fixture build and4 preview/entry tests pass. Root production source was not edited after its tests/browser/build/lint. All compile activity is local; no staging deploy command was invoked.

### Part B — one new hypothesis / exact R1 candidate

Pre-probe HYPOTHESIS.md cites the DOM-backed root reasons Trivial3DTransform +WillChangeTransform. Test whether explicit promotion of the viewport-sized shared iris surface is necessary for the costly raster behavior. QA-only .chapter-bloom-iris{transform:none;will-change:auto}. Keep contain:paint, isolation:isolate, overflow:hidden, inset/size/z-index, all31 opacity owners, pairs, gradients/paths and DOM order untouched.

Different from E1/P1/B4/cache directions: removes only a root identity-transform/compositor hint; no promoted descendants, regrouping, bitmap cache, quality reduction or palette rewrite. z-index/containment/isolation retain logical clipping/stacking/containing-block semantics. Identity-transform removal is expected to preserve source-over geometry/alpha; finite raster AA remains subject to the visual gate. No performance source/CSS edit was made.

### Cheap 4K probe

Exactly one3840x2160DPR1 BASE and one R1, fresh Chrome sessions; same first-run fonts/yellow/pink prewarm/order, four-second .40->.60 sweep,2400ms .44->.56 focus, identical tracing. Audit proxies off. Native checkpoints .44/.50/.56 after500ms settle, known curl/edge crops. This is not a repeated acceptance benchmark. Preserve baseline variability: this run is slower than the earlier4K baseline cohorts; do not discard or normalize it away.

|4K single probe|p95 gap ms|worst gap ms|Raster/window ms|RasterTask count|max main JS task ms|
|---|---:|---:|---:|---:|---:|
|BASE|125.1|200.0|2391.401 /2400|115|9.742|
|R1 root hints removed|108.4|141.6|2390.994 /2400|420|8.774|

Reduction0.407ms, approximately0.017% relative: **not a meaningful raster improvement**. Task count3.65x higher. Better single-run p95/worst does not satisfy the underlying10-15% raster gate. JS remains small relative to raster; no generic JS work proposed. No recorded browser exceptions.

DOM-backed evidence: BASE six layers/four drawing; iris own layer10,3840x2160, two explicit hints;100 iris raster tasks and15 ancestor tasks. R1 five layers/three drawing; no independent iris layer remains, and all420 raster tasks target layer9 mapped to .film-page. Its reported content bounds are6741x2248 in both fixtures, larger than the3840x2160 viewport. The experiment removes the targeted surface but transfers the raster burden to a larger ancestor. It does not eliminate it. raster_id was not used as a DOM identifier. Do not generalize these isolated-fixture ancestor bounds to the full production route without a fresh actual-route audit.

### Visual

Palette/geometry look consistent in the three native crops; no broad E1-like color shift. Not pixel-identical: mean RGB-channel difference .0539/.0551/.0559 at .44/.50/.56; max85/68/51 concentrated at the central fine junction; channels differing>8 are .0065%/.0053%/.0072%. Native max-difference and known curl/edge crops show localized fine-edge sampling differences. No claim of exact visual PASS or relaxed alpha/edge gate. Performance gate already fails; do not polish to resolve these differences.

### Decision / history / next

**R1 REJECT.** Removing .chapter-bloom-iris transform/will-change under the current structure does not meaningfully reduce raster; it merges the burden into the ancestor and increases task count. DO NOT RETRY this hint-removal direction unless new evidence proves ancestor allocation/invalidated-region behavior materially changes. No variants/second hypothesis. No expanded performance matrix, candidate memory/reverse/re-entry tests, or candidate full verification after failure. Timing verification above is independently required for accepted Part A, not promotion of R1.

NEXT: retain accepted SVG and new1150/220/380ms timing. For a separately authorized future performance investigation, first verify actual-route ancestor content bounds, clipping and tile invalidation before proposing an area change; this probe supplies an oversized-ancestor observation, not proof that cropping it would fix the accepted iris workload. No second candidate now.

### Preservation / evidence

Fresh164-source SHA256 comparison: exactly chapterEntryAnimation.js and cinematic-frame-entry.test.js differ (approved timing/helper assertion only). All109 production media unchanged; SVG/palette/gradients/petals/detail, chapter art/sharpness, layout/copy/CTA, smoke/H-final/RIFE and scroll/timeline hashes remain intact. Existing outside working-tree edits preserved. Accepted source diffs are timing-source.diff/timing-test.diff. Final checks stored in timing-tests.log/build.log/cinema-build.log/preview-tests.log/lint.log/git-diff-check.log. No commit, deploy or public-preview update. QA server stopped and owned measurement/browser sessions closed.

Evidence: [R1 hypothesis](../qa/bloom-root-boundary/HYPOTHESIS.md), [R1 measurements](../qa/bloom-root-boundary/summary.json), [native comparison](../qa/bloom-root-boundary/comparison.html), [fresh preservation hashes](../qa/bloom-root-boundary/preservation.json). Frames and browser-entry logs under qa/bloom-root-boundary/frame/; compressed traces and screenshots under runs/. Scripts remain reproduction evidence only.


## 2026-10-10 — S1 shared-parent alpha equivalence: REJECT / early STOP

All31 incoming values are identical in all61 current DOM samples .44-.56. Native SVG fill hit-testing confirms real petal overlap; topmost partial-alpha outline is also confirmed. Common scalar does not make group opacity distributive: alpha union changes by t*(1-t)*a*b. More decisively, accepted warm/incoming drawings alternate in DOM painting order; collecting all incoming nodes crosses warm siblings. At partial alpha, the local composition delta is t*a*(1-a)*(W-B), nonzero in general for the accepted distinct pigments. Existing outline/curl/rib/crease alpha and the prior B4 brighter/double contours invalidate blanket parent equivalence.

Computed subtree has normal blending/no filters/masks/clipPath; root isolation/containment and viewport clipping remain. Those do not make opacity distributive. Warm outside the proposed incoming parent changes interleaving; warm inside is incorrectly faded.

**Decision REJECT before candidate.** No candidate implementation, benchmark, expanded verification, second direction or retry of B4/E1/cache/P1/R1. Baseline/candidate performance metrics and new candidate visual comparisons are NOT RUN, not PASS. Accepted-only audit capture and mathematical evidence retained. Do not automatically retry one incoming-parent opacity without new evidence proving exact full-pixel alpha/order equivalence; scalar equality is insufficient.

Preservation: fresh164 source and109 media hashes all unchanged;1150/220/380ms accepted timing untouched. git diff --check exit0; no new tests/build/lint because no source change. No commit/deploy; unrelated edits retained. NEXT: stop and keep accepted SVG; a future pass must preserve the proven partial-alpha/interleaving constraints and use a different evidence-backed cause.

Evidence: [S1 hypothesis](../qa/bloom-shared-alpha-audit/HYPOTHESIS.md), [full alpha proof/audit](../qa/bloom-shared-alpha-audit/REPORT.md), [61-sample DOM/art evidence](../qa/bloom-shared-alpha-audit/dom-audit.json), [summary/native geometry points](../qa/bloom-shared-alpha-audit/summary.json), [operator counterexample](../qa/bloom-shared-alpha-audit/alpha-math.json), [preservation hashes](../qa/bloom-shared-alpha-audit/preservation.json).


## 2026-10-10T13:42:51.790Z — Accepted runtime public-preview deployment checkpoint

- Accepted SVG runtime deployed to the existing cinemalab preview alias; frame1150ms, label220ms, headline380ms. No performance candidate included, no optimization resumed.
- Target: Cloudflare staging Worker hanapipi-flower, versions upload only. Public: [cinematic-lab](https://cinemalab-hanapipi-flower.hutstudio.workers.dev/cinematic-lab); version 1d675526-2026-4080-9cba-af19c14f4bfa, immutable [preview](https://1d675526-hanapipi-flower.hutstudio.workers.dev/cinematic-lab). Active staging/production traffic unchanged. No commit.
- Minimum safety gate PASS:36 cinematic +4 preview/frame tests, actual cinematic-enabled production build:staging, scoped lint, git diff --check. Public bundle hash equals checked build.
- Deployment upload SUCCESS; post-deploy PARTIAL / NOT PASS.390 and1920 frame/copy/photos/RIFE verified with no JS exceptions/error logs. H-final remains hidden/zero-alpha through sampled smoke phases on both; smoke appearance NOT PASS, cause not attributed. Runtime/H-final/RIFE/art/budgets unchanged. No fix attempted.
-164 source/109 media task-start hashes unchanged; unrelated working-tree/staged edits preserved. Two unrelated artistic-preview workspace additions remain excluded from cinematic preview.
- Optimization status: **performance unresolved / physical-device test pending**. No performance PASS claimed.
- NEXT: Physical-phone test by user. Do not resume optimization until phone-test feedback is available.

Evidence: [deployment report](../qa/accepted-runtime-phone-deploy/REPORT.md), [deployment/checks](../qa/accepted-runtime-phone-deploy/deployment.json), [preservation](../qa/accepted-runtime-phone-deploy/preservation.json), public-bundle-check.json, range-checks.json, logs and native screenshots.


## 2026-10-10T14:21:24.585Z — Deployed RIFE request/seek audit: early STOP / UNRESOLVED

Actual public version1d675526,390x844DPR1/new Chrome153 profile, accepted Engine B. One valid bounded real-route slow/rapid-forward/rapid-reverse/repeated-direction/idle session.10media requests,9HTTP206,8canceled;95900112observed encoded bytes (lower bound, one open request).53currentTime writes;0native-seeking overlap,0same-value/repeated-target writes.2src/2load only at installation;2mounts/0removals,5visible direction swaps without src reset. Existing buffers remain. Slow window0seeks/requests; rapid-forward11seeks including idle correction yet0new requests. Four reverse cancels precede any reverse seek. Three later request starts correlate with seek/buffer misses; two further ranges start during final idle without a new JS seek.206/canceled alone do not prove a runtime bug.

Unnecessary-churn root cause **UNRESOLVED**. H0 stacked/redundant seek/src-reset cause NOT SUPPORTED by recorded evidence. No candidate implemented; network-after/A-B/acceptance NOT RUN. STOP STEP2; no full verify, performance commit, push or deployment. DO NOT RETRY generic latest-target/redundant/src-reset changes without new deployed evidence that existing guards fail.

Reverse native seeks take2331/6389ms, exceeding1500ms logical watchdog; outgoing-frame-retained errors and stale presented frames follow. Source timeout clears logical seek; late seeked completion does not schedule through finish if that state is gone. This is a specific future recovery hypothesis, not proof of canceled-request causation. Next separate targeted direction: completion after watchdog timeout +buffer/presentation attribution, no new architecture or fix now.

162existing source/109media fresh hashes unchanged;2unrelated dev files already missing at fresh snapshot remain missing. Smoke/H-final not debugged/modified; Bloom/RIFE/quality/timing1150/220/380/scroll budgets preserved. git diff --check PASS. Public preview unchanged; physical-phone/performance gate pending.

Evidence: [deployed RIFE report](../qa/rife-deployed-churn/REPORT.md), [H0](../qa/rife-deployed-churn/HYPOTHESIS.md), [network/mutation summary](../qa/rife-deployed-churn/public-baseline-summary.json), [raw deployed session](../qa/rife-deployed-churn/public-baseline.json), [late native seeks](../qa/rife-deployed-churn/long-seeks.json), [source attribution](../qa/rife-deployed-churn/source-audit.json), [preservation](../qa/rife-deployed-churn/preservation.json).


## 2026-10-10T14:53:47.110Z — RIFE reverse seek completion: PARTIAL / UNRESOLVED; STOP

- Actual deployed version 1d675526, fresh Chrome 153, 390×844 DPR1; one bounded session reproduces a reverse seek to 2.8229167s taking **3338.3ms**. Initial target is not buffered; seekable is [0,10], readyState falls 3→1, networkState stays 2.
- Range bytes=20021248- starts +0.94ms; headers arrive +423ms. Observed payload covers the preceding keyframe through target packet by +1247.6ms. Target rVFC arrives +2839.7ms while nativeSeeking=true/readyState=1; native seeked arrives +3338.3ms. The **2090.7ms tail after Network receipt** is not explained by missing target GOP alone. Network receipt does not prove demuxer consumption or sufficient read-ahead. Initial network/buffer contribution is proven; A vs C for the remaining delay is unresolved, so primary classification **E**.
- Read-only MP4 audit: moov at bytes32–4072 before mdat; 120 keys every 4 frames/83.33ms, no B-frames. Target is 3 P-frames/62.5ms after keyframe2.75s. Range starts 30,429 bytes before that keyframe. No distant keyframe/missing index explanation demonstrated. Same2.40625s target takes906ms now versus2331ms previously; variability retained.
- Watchdog fires +1500.4ms before usable frame. Active decoder later publishes frame345, correcting the blanket no-late-publication claim. Latest scroll target59 still does not catch up by cutoff. Clearing logical seek prevents late seeked from scheduling the latest-target correction. This **D recovery issue is supported**, but cannot explain or shorten the initial native delay. Do not increase the1500ms timeout.
- Single strongest hypothesis: progressive media read-ahead/native pipeline completion at a reverse buffer frontier. Exact demux/decoder readiness is not measured; no causal minimal native-latency fix is established. Candidate NONE, A/B NOT RUN; STOP before implementation. No full tests/build/lint because no runtime change. git diff --check exit0 (existing CRLF warnings only).
- Session: 56 seeks, zero overlap/redundant/repeated target writes; 11 requests, 9 HTTP206, 8 cancelled; 105,556,842 observed encoded bytes, lower bound with one open request. No src resets/remounts. Fresh162 source and109 media hashes unchanged; two preexisting absent dev prototypes remain absent. Timing1150/220/380ms, Bloom, layout/text, chapter art, smoke/H-final, RIFE quality and scroll budgets preserved. No commit/push/deploy; public preview unchanged.
- **DO NOT RETRY** generic redundant-seek/src-reset fixes, GOP changes without evidence, blind timeout extension, or combined state/network fixes. **NEXT:** Stop here. A separately authorized pass should correlate Media/demux/read-ahead/decoder readiness with this exact byte interval. Performance remains NOT PASS.

Evidence: [report](../qa/rife-reverse-completion/REPORT.md), [hypothesis](../qa/rife-reverse-completion/HYPOTHESIS.md), [completion metrics](../qa/rife-reverse-completion/completion-summary.json), [slow seek and byte arrivals](../qa/rife-reverse-completion/slow-seek-detail.json), [all reverse events and active ranges](../qa/rife-reverse-completion/reverse-seeks.json), [MP4 structure](../qa/rife-reverse-completion/media-structure.json), [preservation hashes](../qa/rife-reverse-completion/preservation.json).


## 2026-10-10T15:21:28.267Z — RIFE demux/read-ahead audit: PARTIAL; original tail UNRESOLVED, STOP

- One fresh Chrome153 public-route session,390×844 DPR1; media-only trace successfully finalized (19128 events,280789B gzip,no data loss). Common monotonic clock validated against user timing, Network and Media kSeek: offsets differ0.042ms; matched seek timestamps within0.162ms. No runtime/media changes.
- Same reverse target2.8229167s now takes **1442.9ms**, rather than previous3338.3ms. One same-session prebuffered control, distance0.496966s versus0.522712s, takes **9.9ms**. Different sample/keyframe location is retained as a limitation.
- Selected slow seek: FFmpegDemuxer::Seek **0.051ms**; first ReadFromDemuxerStream **1430.631ms** (99.15% of native elapsed); platformD3D11 GOP decodes **0.576–1.929ms/frame**. Internal OnPipelineSeeked fires+1.271ms; DOMseeked only+1442.9ms after HAVE_ENOUGH. Internal seek notification is not usable-frame/native completion.
- Required byte span20051677..20748652. Browser range20021248- receives65536B, then resumes contiguously20086784-. Observed delivery union covers target GOP+1436.079ms, only6.821ms before completion. Read-ahead reaches21479351, **730699B beyondtarget**, and buffering advances to[2.75,2.875]. Receiving requested GOP alone is not proof enough queued frames/data-source consumption. Exact minimum threshold not established.
- **Original2090.7ms post-byte gap NOT REPRODUCED**. Selected wait is upstream of decoder and data availability/read-ahead dependent; original-gap classification **F / unresolved**. Another2353ms reverse seek exists in raw session with target frame earlier than seeked, but is not substituted as a second control or proof about the earlier tail. Forward/reverse byte-pattern difference is confounded by preload/visibility/history, not intrinsic reverse-format causation.
- No obvious causal fix for original gap; candidateNONE; STOP. No extra browser diagnostic, architecture change, watchdog extension, scheduler edit, quality/codec reduction, tests/build/lint expansion, commit/push/deploy. App watchdog recovery remains a separate confirmed issue, untouched. Final target59/presented59 in this session does not erase prior recovery failures.
-162 source/109 media hashes unchanged; preexisting missing dev files unchanged. Timing1150/220/380ms, Bloom, chapter art/layout/text, smoke/H-final, RIFE and scroll budgets preserved. Public preview unchanged. git diff --check logged in QA.
- **NEXT:** Stop; a separately authorized pass may capture internal data-source availability during the exact prior post-receipt tail, or fix app recovery separately. Do not treat prebuffering/longer timeout as an accepted solution. Performance remains NOT PASS.

Evidence: [report](../qa/rife-demux-audit/REPORT.md), [hypothesis](../qa/rife-demux-audit/HYPOTHESIS.md), [control](../qa/rife-demux-audit/control-comparison.json), [synchronized timeline](../qa/rife-demux-audit/synchronized-timeline.json), [byte delivery](../qa/rife-demux-audit/byte-delivery.json), [trace clock](../qa/rife-demux-audit/clock-validation.json), [preservation](../qa/rife-demux-audit/preservation.json); raw Media/native/Network events and compressed trace inqa/rife-demux-audit/.


## 2026-10-10T15:51:31.812Z — RIFE watchdog recovery: local PASS; release BLOCKED

- Old watchdog cleared logical seek/pending; late completion could publish obsolete A without rescheduling newest numeric C. Target itself was retained, but completion ownership was lost.
- One minimal recovery fix retains timedOut seek ownership, preserves same-frame handoff and latest intent, blocks per-decoder native overlap, stops idle timed-out RAF polling, and uses existing late finish→schedule reconciliation. Watchdog1500ms unchanged; no queue/cancel/retry redesign.
-15/15 deterministic motion and142/142 cinematic tests PASS; old runtime fails new regression fixtures. Root production build and cinematic-enabled production build:staging, scoped lint and git diff --check PASS.
- Actual local production route390/1920: all stops final error0, no same-value/consecutive repeated target writes or native-seeking overlap; reverse/re-entry169/169. Matching-signal QA hold2207.7ms triggers one watchdog and catches latest35 within18.7ms after release. Pending direction change35→265→59, hold2202.7ms, catches59 within25.1ms; matching-frame handoff before one latest correction. This probe also has a separate natural3757.2ms forward seek/watchdog which recovers. Natural desktop no watchdog. Invalid TimeRanges/old-playback-gate observer fixtures are retained and explicitly excluded from acceptance, not patched in production.
- **Native seek performance remains unresolved / NOT PASS.** Recovery correctness PASS does not shorten browser/network/demux delay or explain the prior post-byte tail. No buffering/media/Bloom/smoke work.
-162 existing sources/109media compared: only sequenceMotion.js changes;2 preexisting absent dev files unchanged. Scoped new test diff retained.1150/220/380ms, art/layout/text, smoke/H-final/RIFE quality, timeline/budgets unchanged. Unrelated dirty work preserved.
- **Commit/push/deploy BLOCKED:** accepted cinematic baseline is untracked and absent from HEAD/all local history (experiment/hut-flower-3d@a8ae71e). Recovery-only commit cannot recreate a complete cinematic runtime; bundling unrelated/baseline files would exceed scope. No commit/push/uncommitted deploy. Existing public preview version1d675526 unchanged and does not contain the fix. Requires a committed accepted baseline or separately agreed baseline-versioning scope before exact pushed-commit release.
- NEXT: stop; resolve baseline prerequisite, then recovery-only commit/push/exact-commit preview deployment. Physical-phone recovery test pending. Do not resume another optimization.

Evidence: [report](../qa/rife-watchdog-recovery/REPORT.md), [hypothesis](../qa/rife-watchdog-recovery/HYPOTHESIS.md), [route measurements](../qa/rife-watchdog-recovery/route-summary.json), [preservation](../qa/rife-watchdog-recovery/preservation.json), [Git blocker](../qa/rife-watchdog-recovery/git-blocker.json); scoped diffs, deterministic/baseline regression/build/lint logs, raw sessions and native screenshots retained.

## 2026-10-11 — Reproducible baseline established; watchdog release candidate

- Baseline commit 735ac6d7ace31c3f776714dc8b6eebc19132ce41, current branch experiment/hut-flower-3d.480 allowlisted files: accepted SVG/source/assets/direct tests and existing cinematic preview Range/CSP wrapper.403 unchanged static production assets include all300 full-quality master JPEGs required by4K settle; four unchanged RIFE files reuse existing R2 keys recorded in docs/cinematic/rife-preview-media.json. No QA/artwork/cache/compositor/alpha candidate, trace/profile/screenshots or unrelated brand/3D dependency edits committed.
- Baseline109 relevant tests, production build:cinema-preview, scoped lint and staged diff check PASS. Baseline chunk CinematicLabPage-D4nEMg7A.js SHA2567f7dde861ccdf237538d8851cd636e9eefb69bfece39f6d7d582be1d8aa6c455 is byte-identical to accepted public version1d675526. Timing1150/220/380ms, SVG/media/smoke/RIFE/scroll budgets preserved; recovery excluded from A. Whitespace-only normalization for six newly tracked files; H-final provenance fixture moved from QA to tracked docs and test reference updated. Legacy cloud/descent/rejected-smoke tests excluded from production baseline; budget compatibility helper remains a direct accepted test dependency only.
- This successor changes only sequenceMotion.js and six deterministic watchdog regression cases: retain timed-out seek ownership, latest-intent-safe handoff, no overlap/retry polling; watchdog1500ms unchanged. Native seek latency remains unresolved; no optimization resumed. Recovery commit is the direct successor of the baseline above; its final immutable hash and deployment receipt will be recorded after release to avoid self-referential commit hashes.
- Recovery verification:115/115 relevant cinematic tests (including15/15 motion), production build:cinema-preview, scoped lint/diff check PASS. Actual production route390/1920 has final59/59 and re-entry169/169, reverse/direction changes correct, no overlap/redundant writes/console errors. Mobile matching-signal hold beyond1500ms triggers one watchdog then catches latest target; native media latency is not improved. Fresh clean-checkout build remains required before push/deploy. Existing preview-only versions-upload workflow retained; no production/staging traffic promotion. Smoke appearance remains the previous separately unresolved issue; no smoke fix.

Evidence: qa/cinematic-baseline-release/MANIFEST.md, baseline-files.json/classification.json, baseline-bundle-check.json and fresh check/release logs. QA evidence remains intentionally outside committed runtime. Build command: npm ci; npm run build:cinema-preview with the existing staging Clerk TEST publishable key environment. Existing staging R2 binding/media is an explicit deployed dependency, not an untracked local runtime source.

## 2026-10-11 ? Accepted baseline + watchdog recovery preview release

- Commit A: 735ac6d7ace31c3f776714dc8b6eebc19132ce41. Commit B: 8f286c8bebeb50ae3f91bc97a9e9e1a842f340c1 (direct parent A). Branch experiment/hut-flower-3d pushed; remote HEAD equals B.
- Clean detached checkout of B: npm ci, 115/115 cinematic tests, production build:cinema-preview, scoped lint and diff checks PASS; no untracked runtime dependency. Deployed only that build using existing versions-upload preview workflow.
- Existing cinemalab alias: https://cinemalab-hanapipi-flower.hutstudio.workers.dev/cinematic-lab. Version 98bc3135-854f-427a-86ce-973d1b7d71f6. Alias and immutable bundle SHA256 5415699dd3b7ffb93e25a2520a5f183149a0a96dc26c27733d870341808f6915 matches clean B. Staging traffic records unchanged; no traffic promotion or R2 media upload.
- Watchdog recovery deterministic/local correctness PASS; timeout remains1500ms. Public desktop sanity PASS; public mobile sanity PARTIAL: rapid-reverse-stop target59/presented265 with native seek still in flight. Controlled matching-completion hold2201.2ms triggered timeout; release starts matching handoff then latest59 catch-up. Catch-up was still pending at stop, before new input. Final59/59 and re-entry169/169 on both viewports. No overlap/redundant/repeated seeks or console exceptions. Strict aggregate sanity script FAIL retained; do not claim every public stop passed or that this public hold proves idle latest-target completion.
- Actual entry timing1150/220/380ms confirmed. Native RIFE seek latency remains UNRESOLVED / performance NOT PASS. Smoke appearance remains separately unresolved and unchanged. SVG, chapter art/layout/text, quality and timeline/budgets preserved. No optimization resumed.
- This post-deploy receipt remains a local docs-only update: B is already pushed/deployed and is not amended. No third runtime commit. Physical-phone testing pending.

Evidence: qa/cinematic-baseline-release/REPORT.md, classification.json, baseline-files.json, reproducibility.json, deployment-check.json, traffic-check.json, sanity-findings.json, public-390.json/public-1920.json, preservation.json. QA evidence is not committed.

## 2026-10-11 ? Real-phone smoke handoff attribution: D / UNRESOLVED; STOP

- User reports repeated real-phone lag at visible H-final -> RIFE. One BASE/S1/R1 on actual public98bc3135, fresh desktop Chrome mobile390x844DPR3/CPU4x,7s same runway sweep+2.5s idle; all short traces finalized. Not a physical-phone measurement; no repeat RIFE audit.
- BASE smoke visible631 samples/64 draws; p95 8.6ms,worst16.7ms,zero >=50/100ms gaps/longtasks. Phone hitch NOT REPRODUCED. S1 browser-only host hidden+smoke drawImage suppressed; timeline/decode/gates/RIFE intact:63 suppressed attempts/88 decodes, end13/13 like BASE. p95 8.6,worst8.9ms,zero large gaps. GPU task sum56.361->10.582ms; main task sum2168.3->2076.8ms. Workload reduction does not prove primary hitch cause when baseline has no hitch.
- R1 necessary after inconclusive S1: browser-only play/currentTime suppression, video staysframe1 while target13. p95 8.6,worst8.7ms. BUT14 smoke draws/59 decodes versus BASE64/88 due different cold preload timing; causal comparison NOT VERIFIED. No RIFE-primary conclusion or additional diagnostic.
- Classification D (Other/unresolved), A/B/C unsupported. No production fix/candidate. Not ruled out: phone-specific composition/GPU/memory/decode/availability; do not mistake rAF for presented-frame smoothness. S1 leaves decode intact. Prior RIFE mounted/src/load/watchdog/native-latency evidence unchanged, not re-audited.
- All runtime/art/quality/smoke/RIFE/runway/timing1150/220/380 unchanged; no commit/deploy. NEXT: same bounded BASE/S1 with on-device/remote telemetry on affected physical phone, correlate hitch with rendered frame/readiness before proposing a fix. No smoke replacement or RIFE re-investigation from this result.

Evidence: [smoke handoff report](../qa/smoke-handoff-attribution/REPORT.md),summary.json,main-thread.json,BASE-1/S1-1/R1-1.json and compressed traces,QA injection/scripts,preservation.json. QA controls do not exist in production.

## 2026-10-11 ? Physical-phone telemetry instrumentation release candidate

- Desktop emulation did not reproduce physical-phone smoke hitch; classification remains D/unresolved. Physical-phone telemetry is required; no repeated BASE/S1/R1 attribution or optimization in this pass.
- Query-only cinematicTelemetry=1 installs in-memory4096-row ring,45s capture cap, bounded late-chapter/smoke/early-RIFE sampling; Copy JSON/Download JSON stop capture. No per-frame network/console/React state or HUD. Passive media events; direct decode/draw/gate/watchdog/late-recovery hooks. Metadata only viewport/DPR/deviceMemory/hardwareConcurrency, no UA or personal/device identifiers. Longtask/JS heap best-effort; no direct GPU/thermal evidence. Normal route creates no telemetry DOM/observer/RAF; only inactive optional hook branches remain.
-56 focused cinematic/frame/copy/smoke/motion/telemetry tests, clean-baseline production build:cinema-preview, scoped lint/diff PASS. Native export/normal-route/navigation checks:1005 records,errors0; instrumented callback p95 .4ms/worst2.6ms on desktop Chrome, not physical-phone overhead proof. No behavioral/media/timing/runway change. No attribution conclusion yet.
- Commit/deploy receipt will follow separately after exact pushed-commit preview upload; existing cinemalab alias only, no traffic promotion. User next: reload telemetry URL once, scroll to reproduce hitch, continue slightly into RIFE, stop and Copy/Download JSON. No optimization until physical-device data is reviewed.
