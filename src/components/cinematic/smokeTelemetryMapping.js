import { hFinalFrameAt } from './hFinalSmoke.js'
import { SMOKE_TRANSITION_TIMING } from './smokeTransitionConfig.js'
// Diagnostic only: use exactly the effective runtime PTS mapping.
export const telemetrySmokeFrameAt = progress => hFinalFrameAt(progress * SMOKE_TRANSITION_TIMING.duration) + 1
