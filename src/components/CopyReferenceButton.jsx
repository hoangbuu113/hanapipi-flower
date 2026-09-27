import { useEffect, useRef, useState } from 'react'
import { copyText } from '../utils/clipboard.js'
import './CopyReferenceButton.css'

export default function CopyReferenceButton({ referenceCode }) {
  const [feedback, setFeedback] = useState('')
  const timer = useRef(null)
  const busy = useRef(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    if (busy.current) return
    busy.current = true
    const copied = await copyText(referenceCode)
    busy.current = false
    setFeedback(copied ? 'Đã sao chép' : 'Chưa sao chép được. Bạn có thể chọn mã để sao chép.')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFeedback(''), 3000)
  }
  return <span className="consultation-copy">
    <button className="button button--text" type="button" aria-label={`Sao chép mã ${referenceCode}`} onClick={copy}>Sao chép mã</button>
    <span role="status" aria-live="polite">{feedback}</span>
  </span>
}
