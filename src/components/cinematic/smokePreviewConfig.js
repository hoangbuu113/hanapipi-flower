export function smokePreviewRequested(dev, search = '') {
  return Boolean(dev) && new URLSearchParams(search).get('smokePreview') === '1'
}

// Root-served QA files are available through Vite dev, outside public/build assets.
export const SMOKE_PREVIEW_SOURCES = Object.freeze([
  { id: 'reference', name: 'Reference', label: 'REFERENCE — video tham chiếu', detail: 'Bản preview có sẵn · giữ nguyên nhịp gốc.' },
  { id: 'h-final', name: 'H-final', label: 'H-FINAL — prototype toàn chuyển cảnh', detail: 'Bản Blender có sẵn tốt nhất hiện tại · chưa đưa vào production.' },
  { id: 'f4a', name: 'F4A 540p', label: 'F4A — macro transport diagnostic', detail: 'Chưa phải chuyển cảnh hoàn chỉnh · 9 frame review / 72 frame: giữ ảnh theo mốc gốc, không nội suy.' },
  { id: 'b3', name: 'B3 540p', label: 'B3 — turbulence-only diagnostic', detail: 'MARGINAL, chưa phải khói trưởng thành · 9 frame review / 72 frame: giữ ảnh theo mốc gốc, không nội suy.' },
  { id: 'f4a-1080p', name: 'F4A 1080p', label: 'F4A — 1080p sparse-frame quality preview', detail: '6 ảnh render mới · trích frame 20–72 (~1,77 giây), giữ ảnh theo mốc 30fps; không nội suy, không phải playback đầy đủ.' },
  { id: 'b3-1080p', name: 'B3 1080p', label: 'B3 — 1080p sparse-frame quality preview', detail: 'MARGINAL · 6 ảnh render mới, trích frame 20–72 (~1,77 giây); giữ ảnh theo mốc 30fps, không phải playback đầy đủ.' },
  { id: 'f4a-128', name: 'F4A 128', label: 'F4A res128 diagnostic', detail: '1080p · 6 ảnh render frame 20–72 (~1,77 giây), giữ ảnh theo mốc 30fps; không nội suy, không phải playback đầy đủ.' },
].map(source => Object.freeze({ ...source, src: `/qa/dev-smoke-preview/media/${source.id}-preview.mp4` })))
