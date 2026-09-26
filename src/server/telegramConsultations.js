const money = (value) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`
const labels = { style: 'Phong cách', palette: 'Bảng màu', size: 'Kích thước', wrapping: 'Gói hoa' }

export function consultationNotification(request, origin) {
  const images = [...new Set(request.items.map((item) => item.image).filter((src) => /^\/(?:api\/v1\/media\/|assets\/)\S+$/u.test(src)))]
    .map((src) => new URL(src, origin).href)
  const lines = [`YÊU CẦU TƯ VẤN — ${request.referenceCode}`, '']
  for (const item of request.items) {
    lines.push(`${item.name} × ${item.quantity}`, `${money(item.unitReferencePrice)} / bó`, `Tạm tính: ${money(item.lineReferenceTotal)}`)
    for (const [key, label] of Object.entries(labels)) {
      if (item.selections[key]?.label) lines.push(`${label}: ${item.selections[key].label}`)
    }
    if (item.selections.flowers?.length) lines.push(`Hoa chủ đạo: ${item.selections.flowers.map((flower) => flower.label).join(', ')}`)
    if (item.selections.gifts?.length) lines.push(`Quà kèm: ${item.selections.gifts.map((gift) => `${gift.label} (${money(gift.price)})`).join(', ')}`)
    if (item.selections.message) lines.push(`Lời nhắn: ${item.selections.message}`)
    lines.push('')
  }
  lines.push(`Tổng giá tham khảo: ${money(request.referenceTotal)}`, `Khách sẽ liên hệ qua Zalo/điện thoại và cung cấp mã: ${request.referenceCode}`)
  if (images.length > 10) lines.push(`Album hiển thị 10 ảnh; còn ${images.length - 10} ảnh khác trong chi tiết tư vấn.`)
  // Telegram plain text maximum is 4096 characters; preserve the whole summary across messages.
  const characters = Array.from(lines.join('\n'))
  const texts = []
  while (characters.length) texts.push(characters.splice(0, 3800).join(''))
  return { texts, images: images.slice(0, 10) }
}

/** No provider responses/exceptions/URLs containing credentials are logged or returned. */
export async function notifyConsultation(request, env, repository, origin, fetchImpl = globalThis.fetch) {
  let status = 'failed'
  let textSent = false
  const deadline = AbortSignal.timeout(25000)
  async function send(method, payload) {
    const response = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_OWNER_CHAT_ID, ...payload }),
      signal: AbortSignal.any([deadline, AbortSignal.timeout(8000)]),
    })
    if (!response.ok || (await response.json()).ok !== true) throw new Error('NOTIFICATION_FAILED')
  }
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_OWNER_CHAT_ID) throw new Error('NOTIFICATION_NOT_CONFIGURED')
    const { texts, images } = consultationNotification(request, origin)
    for (const text of texts) {
      await send('sendMessage', { text })
      textSent = true
    }
    if (images.length === 1) await send('sendPhoto', { photo: images[0], caption: request.referenceCode })
    else if (images.length > 1) await send('sendMediaGroup', { media: images.map((media, index) => ({ type: 'photo', media, ...(index === 0 ? { caption: request.referenceCode } : {}) })) })
    status = 'sent'
  } catch {
    status = textSent ? 'partial' : 'failed'
  }
  // If D1 itself is unavailable, leave pending for Admin visibility; never leak a provider error.
  await repository.setNotification(request.id, status).catch(() => {})
  return status
}
