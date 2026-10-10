import { useEffect, useRef, useState } from 'react'

// Fixed-size corner flourishes keep the cartouche graceful on tall copy blocks.
function outline(width, height) {
  const mid = width / 2
  return 'M' + mid + ' 3C' + (mid - 5) + ' 14 ' + (mid - 13) + ' 14 ' + (mid - 23) + ' 14H42Q23 14 23 28C10 28 6 37 6 55V' + (height - 55) + 'Q6 ' + (height - 28) + ' 23 ' + (height - 28) + 'Q23 ' + (height - 14) + ' 42 ' + (height - 14) + 'H' + (mid - 23) + 'C' + (mid - 13) + ' ' + (height - 14) + ' ' + (mid - 5) + ' ' + (height - 14) + ' ' + mid + ' ' + (height - 3) + 'C' + (mid + 5) + ' ' + (height - 14) + ' ' + (mid + 13) + ' ' + (height - 14) + ' ' + (mid + 23) + ' ' + (height - 14) + 'H' + (width - 42) + 'Q' + (width - 23) + ' ' + (height - 14) + ' ' + (width - 23) + ' ' + (height - 28) + 'C' + (width - 10) + ' ' + (height - 28) + ' ' + (width - 6) + ' ' + (height - 37) + ' ' + (width - 6) + ' ' + (height - 55) + 'V55Q' + (width - 6) + ' 28 ' + (width - 23) + ' 28Q' + (width - 23) + ' 14 ' + (width - 42) + ' 14H' + (mid + 23) + 'C' + (mid + 13) + ' 14 ' + (mid + 5) + ' 14 ' + mid + ' 3Z'
}
export default function ChapterFrame() {
  const element = useRef(null)
  const [size, setSize] = useState({ width: 400, height: 300 })
  useEffect(() => {
    if (!element.current?.getBoundingClientRect) return undefined
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width < 120 || height < 100) return
      setSize(current => current.width === width && current.height === height ? current : { width, height })
    })
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  return <svg ref={element} className="lab-chapter-frame" viewBox={'0 0 ' + size.width + ' ' + size.height} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path className="lab-frame-stroke" d={outline(size.width, size.height)} pathLength="1" />
    <path className="lab-frame-stroke lab-frame-stroke--inner" d={outline(size.width - 12, size.height - 12)} pathLength="1" transform="translate(6 6)" />
  </svg>
}
