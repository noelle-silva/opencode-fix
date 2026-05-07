import type { AssistantRenderCapabilities } from "./types"

export const REF_IMG_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="

export function markPreviewImages(root: unknown) {
  if (!(root instanceof HTMLElement)) return
  Array.from(root.querySelectorAll("img")).forEach((image) => {
    if (!(image instanceof HTMLImageElement)) return
    if (!image.getAttribute("src")) return
    if (image.getAttribute("data-fw-img") === "1") return
    image.setAttribute("data-fw-img", "1")
    image.style.cursor = "zoom-in"
  })
}

export function createRefImageHydrator(
  refImgCache: Map<string, string>,
  refImgPending: Set<string>,
  capabilities: AssistantRenderCapabilities,
) {
  function hydrateRefImages(root: unknown) {
    if (!(root instanceof HTMLElement)) return

    const read = capabilities.files.images.read
    if (!read) return

    const byPath = Array.from(root.querySelectorAll("img[data-ref-img]")).reduce((map, node) => {
      if (!(node instanceof HTMLImageElement)) return map
      const path = (node.getAttribute("data-ref-img") || "").trim()
      if (!path) return map

      const cached = refImgCache.get(path)
      if (cached) {
        node.src = cached
        return map
      }

      map.set(path, [...(map.get(path) ?? []), node])
      return map
    }, new Map<string, HTMLImageElement[]>())

    byPath.forEach((images, path) => {
      if (refImgPending.has(path)) return
      refImgPending.add(path)
      Promise.resolve(read({ scope: "data", path }))
        .then((dataUrl) => {
          const src = typeof dataUrl === "string" && dataUrl.startsWith("data:") ? dataUrl : ""
          if (src) refImgCache.set(path, src)
          images.forEach((image) => {
            if (image.isConnected && src) image.src = src
          })
        })
        .catch(() => undefined)
        .finally(() => refImgPending.delete(path))
    })
  }

  return { hydrateRefImages }
}
