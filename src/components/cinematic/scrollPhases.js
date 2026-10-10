const clamp = value => Math.max(0, Math.min(1, value))
export function scrollPhasesAt(distance, chapterBudget, handoffBudget, sequenceBudget) {
  const chapterProgress = clamp(distance / chapterBudget)
  const transitionProgress = clamp((distance - chapterBudget) / handoffBudget)
  const sequenceProgress = clamp((distance - (chapterBudget + handoffBudget)) / sequenceBudget)
  return { chapterProgress, transitionProgress, sequenceProgress }
}
