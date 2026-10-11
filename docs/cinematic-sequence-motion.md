# Cinematic sequence motion

The active source remains accepted RIFE4.6 48fps with Engine B sequential forward/reverse playback. The ten-second source-time mapping, 300 immutable4K masters, 240 real24fps source samples, synthetic-frame retention and safe4K idle settle are unchanged. Chapters01–04 artwork, composition, typography, navbar and CTA remain unchanged before the post-Chapter04 handoff.

## Delivery derivatives

The existing accepted lossless RIFE outputs are the input; interpolation is not regenerated. The active URLs use /media/hutflower/scroll-sequence-video; MAIN Worker serves the unchanged existing R2 objects documented in cinematic/rife-preview-media.json:

| Tier | Forward | Reverse | Bytes forward / reverse |
| --- | --- | --- | --- |
|1080p48|sequence-rife48-1080p-gop4.mp4|sequence-rife48-1080p-gop4-reverse.mp4|72,659,781 /69,013,893|
|1440p48|sequence-rife48-1440p-gop4.mp4|sequence-rife48-1440p-gop4-reverse.mp4|105,388,199 /100,141,362|

Both use libx264 High, slow, CRF18, GOP4, no B frames, fixed key interval, scene-cut disabled, BT709 limited-range yuv420p and faststart. Frame count/rate/duration remain480 /48fps /10.000s. Levels are4.2/5.1. Forward capability bitrates are58,124,556 /84,307,358bps. Total active media is347,203,235bytes versus402,632,572bytes, a13.77% reduction. Earlier derivatives remain on disk as comparison evidence and are not loaded alongside the active pair.

Detail restoration is deterministic luma-only unsharp5×5, amount0.12, chroma amount0, after full-to-limited BT709 conversion. No AI, denoise, grading, saturation/contrast enhancement or resolution reduction is applied. A none/B0.12/C0.24 moving browser comparison and difficult-region crops informed the conservative B choice. Stronger C is unnecessary; CRF19 is not selected to preserve detail headroom. Slow and slowerCRF18 all-I trial sizes are essentially equal, so slower is not selected. GOP1/2/4/6/8 are benchmarked with the actual unchanged Engine B; GOP4 is the delivery/responsiveness compromise, not the smallest file.

Mobile always selects1080p48. Desktop1920/2560/3840 prefers1440p48 when supported/smooth and falls back to1080p48 otherwise. The tier remains fixed for the visit. No4K motion video is introduced.

## Independent scroll runway revision

Chapter effect travel is increased exactly50%, preserving local easing, pigment/curtain phase ratios and all artwork. Desktop01-to-02:119.7 to179.55svh;02-to-03:143.64 to215.46svh;03-to-04:287.28 to430.92svh. Mobile retains the established480/560 distance scale:102.6 to153.9;123.12 to184.68;246.24 to369.36svh. Settled viewing remains120svh per chapter for Chapters01-03 desktop, scaled equally on mobile; final Chapter04 viewing remains85.9svh desktop. Total chapter travel is1271.83/1090.14svh.

RIFE48 scrub travel alone increases20%:750 to900svh desktop,650 to780svh mobile. Spatial handoff remains150/125svh. Total document height is2421.83/2095.14svh, including one sticky viewport. The shared displayed-scroll timeline consumes the sequence budget only after full lock; duration48fps/480frames/10s, media, Engine B, source mapping and master-settle policy are unchanged.

All chapter, handoff and video targets now share one cinematic display-scroll controller. Native scroll remains unmodified. Input coalesces into one pending RAF; only a requested sample reads region layout. Intermediate catch-up frames reuse that geometry. Desktop uses a provisional150ms exponential time constant; a smooth tail taper during150-300ms bounds release catch-up without a large final snap. At<=0.25px remaining error the ticker sleeps. Mobile/coarse primary pointers use0ms. Resize/restored position snap to actual geometry. No visual winner or4K performance claim is made without Browser evidence.

## Living Painted Bloom: Chapter02 to03

A cached, connected dragged-brush mask replaces the impact rays and95 detached paint drops. Six broad pre-authored curved ribbons carry pigment with fine bristle traces. The accepted pastel texture remains a restrained central layer at the beginning and clears before the photo swap; its former red corner patches cannot enter the crimson reveal. Four color roles interpolate in Oklab through blush, coral, dusty rose, mauve, carmine and wine, with warm ivory rather than opaque white. No mint/green layer is added.

The existing215.46/184.68svh painter runway and shared authored retiming remain. Cubic local phase still cancels through the existing inverse retiming. Coverage scales one SVG encoded at module load; the opaque45–55% authored interval swaps the one photograph at50%. During opening, subtraction of that same irregular brush body increases negative space around the bouquet; paired ribbons drag outward while wine/rosewood pigment recedes to the perimeter. No per-frame SVG path construction, detached droplets, filters, extra smoothing or independent clock. Palette changes still incur paint work; performance is not assumed to be GPU-only.

## Historical pearl cloud / smoke handoff (superseded for normal smoke mode)

The old glass portal renderer is removed. A full-stage pearl vapor scene bridges the existing32svh interval between photo planes. Six distinct SVG vapor masses overlap in two memoized banks, with feathered alpha gradients, internal pearl wisps and a warm ivory/blush ground. The ground provides opaque initial coverage; there is no glass card, border, backdrop blur, Gaussian filter or particle simulation.

The photographic planes are unchanged: ChapterY=-(30×travel+102×entrance), SequenceY=132+ChapterY. Handoff remains150svh desktop /125svh mobile, and scrub remains900/780svh.

|Phase|Desktop svh|Mobile svh|Visual / source clock|
|---|---|---|---|
|Final Chapter04 hold|0–25|0–20|Original composition; no cloud; frame0|
|Cloud enters|25–65|20–55|Cloud rises over the photo interval; local Chapter04 copy yields; frame0|
|Thank-you / reveal|65–130|55–110|Message holds14–42% entrance; then smoke stretches left/right; frame0|
|Full-stage settle|130–150|110–125|Smoke and copy fully cleared; stage atY0; frame0|
|Scrub lock|after150|after125|Existing ten-second Engine B scrub begins|

Copy is unboxed and centered: “THƯỚC PHIM HOA / Cảm ơn bạn / Cảm ơn vì đã ở lại cùng những câu chuyện bằng hoa.” The headline is materially larger than the old interstitial. Eyebrow, headline and supporting line use staggered scroll-only envelopes; copy clears before stage lock. Mobile uses viewport-bounded46–74px heading and13px support, with separate short-height rules.

Cloud entry starts below the viewport and reachesY0 during first travel. Its top always overlaps the outgoing photo bottom, filling the geometric interval. After42% entrance, the banks translate to opposite sides, stretch at different rates and lift slightly. A single fixed feathered plume subtraction mask clears the center and dissipates the remaining ground; it is scaled, not regenerated. Cloud opacity remains1 during reveal: lateral dispersion and the shaped alpha mask reveal the video, rather than a scene fade or straight wipe. Expanded clearance covers the entire viewport before the original full-stage settle begins.

All state comes from the shared displayed playhead. Stop uses its existing bounded catch-up and then stops; reverse reconstructs the exact same state, with no cloud timers/RAF. Static SVG drawings and heading props are retained. Cloud mounting is bounded by invisible/fully masked endpoints; reduced motion retains static chapters without the handoff/video. Existing remembered media initialization prevents source reinstallation on reverse. Video frame0 remains locked through the full handoff and settle.

Live visual acceptance remains incomplete until the Browser captures forward/reverse painter phases, cloud entry/thanks/reveal, frame0 and active scrub at the five requested viewports. Numerical coverage and regression tests do not establish visual quality or4K cadence.

## Engine and4K settle

Engine B itself is unchanged: response60ms; drift66.7ms; large jump400ms; lead16.7ms; correction spacing220ms; idle pause120ms. Direction changes retain the outgoing presentation until the incoming decoder confirms the matching temporal sample. Only one selected decoder layer is visible. Browsers without video presentation callbacks retain paused-seek compatibility.

At idle, the existing160ms abortable one-image settle fetches only safe real samples when useful above delivered physical resolution. Even RIFE sample2k maps through the verified SHA dedup master indices. Odd synthetic samples retain the RIFE image and never fetch a different-pose master. Sample479 is the final real-frame hold and may settle to master300. Phones never fetch settle JPEGs. Movement cancels/revokes stale requests/images; resize revisits settle usefulness without replacing the selected video tier.

## Route and verification scope

The existing App gate remains localhost/development-only. The main Hanapipi homepage is untouched. A normal production build verifies the application, and a separate production-mode cinematic fixture verifies the cinematic bundle without development-only switches; this does not expose or deploy the lab route.

Tests cover temporal indices, direction synchronization, corrections, cleanup, exact idle, safe real-frame settle, synthetic retention, source mapping, chapter regressions, page-descent phase boundaries, native-stop behavior, reverse restoration and independent handoff/scrub budgets. Local artifact evidence is in temporal-source/delivery-page-descent. Browser mobile sizes are viewport emulation, not physical-phone/touch-device acceptance. Browser verification of the final source and all five viewports must be completed before claiming overall visual PASS.

## Master display-scroll and retiming pass

No Lenis/GSAP dependency is installed. A demand-only master RAF coalesces events, samples latest native bounds, advances a time-based exponential displayed position, and publishes one coherent chapter/handoff/video snapshot. Video subscribes imperatively to that snapshot and no longer reads native region layout or owns a scroll listener. Engine B retains its own decoder/playback callbacks, default60ms response and safe4K idle settle. Static photographic subtrees stay cached; exact copy/header element bodies are now also retained rather than reconstructed per frame. Dynamic art/visibility still renders through the isolated cinematic React page at most once per master update; this is not a zero-React animation rewrite.

Timeline remapping cancels old nested phase ease for the primary motion while retaining the authored geometry samples. The replacement is the integral of cosine velocity ramps with18% end ramps and64% constant middle velocity. Closed-cover palette exchange uses its existing internal pigment easing; the extra outer color ease is avoided, and its scroll window stays close to the prior width. Midpoint photo swap remains. No media/art/CSS/handoff geometry or viewing distance changes.

|Transition|Close|Closed-cover exchange|Open|
|---|---|---|---|
|01-to-02|0-46%|46-54%|54-100%|
|02-to-03|0-47%|47-53%|53-100%|
|03-to-04|0-45%|45-55%|55-100%|

Development-only comparisons use ?smooth=0/150/250/350/500 and ?engineResponse=60/20/0, e.g. /cinematic-lab?smooth=250&engineResponse=20. These switches are stripped from production behavior; they are not UI controls. Response is the exponential time constant, not95% convergence time. Tail taper is delta-time aware, and sleep occurs within2x response plus one refresh interval; continuing native input renews the release window. Direction changes replace the old target immediately, with no queued stale targets or spring overshoot. A new target still ahead of a lagging display will be approached from that current position; it does not force an artificial reverse jump.

Deterministic benchmarks cover0/150/250/350/500ms at60/75/120Hz and bounded release/reversal/cleanup. Engine B60/20/0 comparisons are target/playhead models plus an immediate-response safety test, not live decoder/wheel acceptance.60ms stays selected pending presentation/visual evidence. Main photo quality,48fps/480-sample/10-second mapping and900/780svh remain unchanged. Evidence is in temporal-source/master-smooth-retiming. Browser was unavailable; live cadence/4K rendering, matched screenshots and perceived smoothing winner remain unverified.

## Current H-final scroll-scrubbed handoff (V2, 2026-10-10)

Normal `/cinematic-lab` uses one `SmokeTransition` / lazy `HFinalSmokeHandoff`. The route is public at MAIN /cinematic-lab and lazy-loaded independently of SiteLayout. Superseded autoplay/Cloud/forensic inspectors are absent from the active route; the old cinematic implementation is preserved in archive/cinematic-lab-smoke-final.

Native scroll target → existing adaptive displayed-position master → dedicated smoke runway → virtual native time → binary PTS frame lookup. Desktop smoke travel is600svh, mobile480svh. Chapter travel1271.83/1090.14svh and RIFE travel900/780svh are unchanged; total document heights2871.83/2450.14svh include the sticky viewport. Desktop response stays150ms for small gaps, progressively25ms at>=1200px backlog, with the existing bounded release tail; mobile/coarse input stays native. A stopped master does not advance smoke. Direction reverses from the same timeline. There is no smoke RAF, autoplay duration, gesture capture, scroll rebasing or fresh-input latch.

The accepted88 RGBA8 PNGs remain byte-identical960×540. Payload12,416,931bytes, native duration3.041667s and timing manifest are unchanged. `virtualTime=smokeProgress*2.741667` maps the production runway to N1–N80; `hFinalFrameAt` still selects the exact native PTS. N80 is the first completely transparent frame, verified by alpha statistics and composites over the delivered RIFE frame0; N79 retains a faint residual. Native duration and all 88 archival frames remain unchanged. Duration is a virtual coordinate, not mandatory elapsed playback time.

| Threshold | Exact normalized progress | Meaning |
| --- | --- | --- |
| N38 | 1.308333/2.741667 | Chapter04/RIFE0 ownership boundary, mirrored in reverse |
| N51 | 1.741667/2.741667 | Derived reveal label |
| End | 1 | N80 effective transparent endpoint; next distance enters RIFE |

The co-located planes change ownership under the calibrated N38 plate. On a crossing, the coordinator emits that plate for one existing master update, even if a large gesture skips the entire section. If presented RIFE0 or the cover decode is unavailable, visual ownership holds while the native target keeps moving. Resource readiness schedules the same coalesced master, resumes without new input, then jumps toward the latest target. Reverse forces RIFE0 while smoke is active and confirms its real presentation before returning ownership. Frame0 readiness never reclamps active RIFE. Media prewarms at85% of chapter travel, remembered across reversals. No intermediary frame queue.

N38 mean alpha0.982078 is not an all-pixel opacity guarantee; existing edge holes remain. This task changes no alpha/color/coverage. Actual hidden-swap acceptance requires manual review.

The existing store downloads all88 encoded PNGs. Active desktop keeps all88 decoded bitmaps (~174.02MiB); active bounded retention is not justified by the measured hitch cause. Deep RIFE (`sequenceProgress > .15`) releases every decoded smoke bitmap while preserving encoded bytes. Reverse approaching `.15` wakes the store before the ownership crossing, with latest-target priority and no refetch. Mobile retains a24-frame directional window plus last presentation, at most25 (~49.44MiB), with4 concurrent decodes. Latest target is first, then nearest directional neighbors; skipped frame10→50 need not decode11..49. Abandoned in-flight work is bounded and stale completions close. Availability releases the master gate; no polling clock. Initial loading deadline remains15s. Resize changes cover/window policy without remounting video/Canvas. All resources close on unmount.

The renderer retains one960×540 alpha Canvas, centered aspect-preserving cover and straight PNG source-over. It draws only changed native frames, preserves the previous image during a missing decode, and hides/clears native transparent endpoints. No filtering/upscale/VFX is added. Engine B,48fps480-sample10s source, source tiers, interpolation and real-frame settle are unchanged. Reduced motion retains static chapter experience with no smoke/video.

`?smokeDebug=1` shows target/display/gap, smoke runway pixels, requested/displayed progress, virtual time, actual/requested native frame, swap/reveal thresholds, gate/scene/RIFE0 presentation and decoded resources. `?perfDebug=1` retains observational input/media/RAF measurements and downloads. Diagnostics are DEV-only.

Focused tests cover scroll/native mapping, hold/resume/reverse, readiness on both crossings, no fresh input, latest jump decoding, no independent clock/input, StrictMode/reduced-motion/resize cleanup, all88 asset hashes and regression architecture. Live normal-route measurements and user visual acceptance are separate gates. The compact cinematic-optimization-history.md records effective-end/lifecycle findings and unpassed physical quality/performance gates; full historical narrative is in the archive branch.


## Quality-preserving V2 runtime work

The full-precision master and smoke channels remain authoritative. The normal page opts into section-only React publication; unchanged chapter art, smoke metadata and RIFE visibility do not rerender on irrelevant progress. Detailed smoke diagnostics can still publish continuously. The smoke Canvas clears only on visibility edges and draws only changed native frames. Engine B receives changed fractional targets; no frame quantization is introduced, and the accepted60ms response remains after an isolated0ms counterfactual worsened presentation gaps. Entering RIFE at unchanged frame0 still schedules the existing high-resolution idle settle.

All four selected chapter photographs request browser decoding after loading, before hidden art becomes visible. The old unconditional paint preload is removed; a low-priority decode prefetch starts in outgoing Chapter02 and persists until unmount. No asset, geometry, color, effect travel, CSS resolution, RIFE media or H-final frame changes accompany these scheduling changes.
