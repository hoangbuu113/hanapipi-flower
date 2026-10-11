export function followSmokeChannel(channel, publish) {
  const stop = channel?.subscribe(publish), snapshot = channel?.getSnapshot()
  if (snapshot) publish(snapshot)
  return () => stop?.()
}
