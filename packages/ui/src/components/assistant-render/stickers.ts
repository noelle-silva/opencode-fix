export function parseStickerSize(raw: unknown) {
  const match = /^(\d{1,5})(?:px)?$/.exec(String(raw || "").trim().toLowerCase())
  if (!match) return 0

  const size = Math.round(Number(match[1] || 0))
  if (!Number.isFinite(size)) return 0
  if (size < 16) return 16
  if (size > 4096) return 4096
  return size
}

export function hydrateStickerSizes(root: unknown) {
  if (!(root instanceof HTMLElement)) return
  Array.from(root.querySelectorAll("img.fw-sticker[data-fw-sticker-size]")).forEach((image) => {
    if (!(image instanceof HTMLImageElement)) return
    const size = parseStickerSize(image.getAttribute("data-fw-sticker-size") || "")
    if (!size) return
    image.style.maxWidth = `min(${size}px, 100%)`
    image.style.maxHeight = `min(${size}px, 70vh)`
  })
}
