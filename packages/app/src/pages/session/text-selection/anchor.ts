import type { HighlightRect, SelectionAnchor, SelectionDraft, SelectionSource, Surface } from "./types"

const textNodes = (root: HTMLElement) => {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (parent?.closest("button,input,textarea,select,[contenteditable='true'],[data-selection-ignore]")) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  return nodes
}

const boundaryOffset = (root: HTMLElement, node: Node, offset: number) => {
  let total = 0
  for (const text of textNodes(root)) {
    if (text === node) return total + offset
    total += text.nodeValue?.length ?? 0
  }
  return undefined
}

const rangeText = (root: HTMLElement, start: number, end: number) => {
  let total = 0
  let out = ""
  for (const node of textNodes(root)) {
    const text = node.nodeValue ?? ""
    const nodeStart = total
    const nodeEnd = total + text.length
    total = nodeEnd
    if (nodeEnd <= start) continue
    if (nodeStart >= end) break
    out += text.slice(Math.max(0, start - nodeStart), Math.min(text.length, end - nodeStart))
  }
  return out
}

export const resolveRange = (root: HTMLElement, anchor: SelectionAnchor) => {
  const range = document.createRange()
  let total = 0
  let startSet = false
  let endSet = false

  for (const node of textNodes(root)) {
    const length = node.nodeValue?.length ?? 0
    const next = total + length
    if (!startSet && anchor.start >= total && anchor.start <= next) {
      range.setStart(node, anchor.start - total)
      startSet = true
    }
    if (!endSet && anchor.end >= total && anchor.end <= next) {
      range.setEnd(node, anchor.end - total)
      endSet = true
      break
    }
    total = next
  }

  if (!startSet || !endSet) return
  if (range.toString() !== anchor.text) return
  return range
}

export const rectsFromRange = (range: Range) =>
  Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)

export const createHighlightRects = (input: {
  annotationID: string
  source: SelectionSource["type"]
  root: HTMLElement
  anchor: SelectionAnchor
}) => {
  const range = resolveRange(input.root, input.anchor)
  if (!range) return []
  return rectsFromRange(range).map(
    (rect, index): HighlightRect => ({
      id: `${input.annotationID}:${index}`,
      annotationID: input.annotationID,
      source: input.source,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }),
  )
}

export const draftFromSelection = (surfaces: Surface[]): SelectionDraft | undefined => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

  const range = selection.getRangeAt(0)
  const text = range.toString().trim()
  if (!text) return

  const surface = surfaces.find((item) => item.root.contains(range.commonAncestorContainer))
  if (!surface) return

  const messageRoot = !surface.source
    ? range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer.closest("[data-message-id]")
      : range.commonAncestorContainer.parentElement?.closest("[data-message-id]")
    : undefined
  const source =
    surface.source ??
    (messageRoot instanceof HTMLElement && messageRoot.dataset.messageId
      ? ({ type: "session", messageID: messageRoot.dataset.messageId } as const)
      : undefined)
  if (!source) return

  const root = messageRoot instanceof HTMLElement ? messageRoot : surface.root

  const start = boundaryOffset(root, range.startContainer, range.startOffset)
  const end = boundaryOffset(root, range.endContainer, range.endOffset)
  if (start === undefined || end === undefined || end <= start) return

  const anchor = {
    scope: sourceID(source),
    start,
    end,
    text: rangeText(root, start, end),
  }

  if (anchor.text.trim() !== text) return

  const rect = range.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  return {
    anchor,
    rect,
    source,
  }
}

export const sourceID = (source: SelectionSource) => (source.type === "session" ? source.messageID : source.annotationID)
