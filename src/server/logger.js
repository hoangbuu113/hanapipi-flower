const SAFE_FIELDS = ['requestId', 'route', 'method', 'status', 'durationMs', 'errorCode']

export function logApiRequest(entry, logger = console) {
  const safeEntry = { event: 'api_request' }
  SAFE_FIELDS.forEach((field) => {
    if (entry[field] !== null && entry[field] !== undefined) safeEntry[field] = entry[field]
  })
  logger.info(JSON.stringify(safeEntry))
}
