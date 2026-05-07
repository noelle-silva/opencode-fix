import katex from "katex"
import { enhanceCodeBlocks } from "./copy"
import { createMarkdownRenderer, preprocessHtmlIndentation } from "./markdown"
import { enhanceMathCopyButtons } from "./math-copy"
import { createMermaidSupport } from "./mermaid"
import { preprocessAssistantContent } from "./preprocess"
import { REF_IMG_PLACEHOLDER, createRefImageHydrator, markPreviewImages } from "./ref-images"
import { createHtmlSanitizer, sanitizeSvg } from "./sanitize"
import { hydrateStickerSizes } from "./stickers"
import { ensureToolReqCssOnce, ensureToolRequestToggleHandlerOnce, renderToolRequestHtml } from "./tool-request-ui"
import type { AssistantRenderCapabilities, BoolRef, RenderSafetyPolicy, ToolRequestRenderPreset } from "./types"
import { escapeHtml } from "./utils"

export type AssistantRenderEngine = {
  ensureRenderer: () => Promise<void>
  sanitizeHtml: (html: unknown, policy?: RenderSafetyPolicy) => string
  sanitizeSvg: (svg: unknown, policy?: RenderSafetyPolicy) => string
  renderAssistantInto: (
    element: unknown,
    text: unknown,
    options?: {
      stickersEnabled?: boolean
      getStickerPath?: (category: string, name: string) => string
      toolRequestPreset?: ToolRequestRenderPreset | null
      renderSafetyPolicy?: RenderSafetyPolicy
    },
  ) => void
}

function normalizePolicy(policy?: RenderSafetyPolicy): RenderSafetyPolicy {
  if (policy === "unsafe") return "unsafe"
  if (policy === "baseline") return "baseline"
  return "original"
}

function enhanceLinks(root: HTMLElement) {
  Array.from(root.querySelectorAll("a[href]")).forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) return
    link.classList.add("external-link")
    link.target = "_blank"
    link.rel = "noopener noreferrer"
  })
}

export function createDefaultAssistantRenderEngine(capabilities: AssistantRenderCapabilities): AssistantRenderEngine {
  let rendererPromise: Promise<void> | undefined
  const domPurifyHooked: BoolRef = { value: false }
  const mermaidInited: BoolRef = { value: false }
  const toolReqCssInited: BoolRef = { value: false }
  const mermaidSvgCache = new Map<string, string>()
  const refImgCache = new Map<string, string>()
  const refImgPending = new Set<string>()

  const htmlSanitizer = createHtmlSanitizer(domPurifyHooked)
  const markdownRenderer = createMarkdownRenderer()
  const refImages = createRefImageHydrator(refImgCache, refImgPending, capabilities)
  const mermaidSupport = createMermaidSupport({ mermaidInited, mermaidSvgCache })

  function ensureRenderer() {
    rendererPromise ??= Promise.resolve().then(() => mermaidSupport.initMermaidOnce())
    return rendererPromise
  }

  function renderAssistantInto(
    element: unknown,
    text: unknown,
    options?: {
      stickersEnabled?: boolean
      getStickerPath?: (category: string, name: string) => string
      toolRequestPreset?: ToolRequestRenderPreset | null
      renderSafetyPolicy?: RenderSafetyPolicy
    },
  ) {
    if (!(element instanceof HTMLElement)) return

    void ensureRenderer().catch(() => undefined)
    ensureToolReqCssOnce(toolReqCssInited)

    const policy = normalizePolicy(options?.renderSafetyPolicy)
    const preprocessed = preprocessAssistantContent(preprocessHtmlIndentation(text), {
      stickersEnabled: !!options?.stickersEnabled,
    })
    const getStickerPath = options?.getStickerPath
    let safe = htmlSanitizer.sanitizeHtml(markdownRenderer.renderMarkdownSource(preprocessed.text), policy)

    safe = safe.replace(/@@MATH_(INLINE|BLOCK)_(\d+)@@/g, (_match, kind: string, id: string) => {
      const item = preprocessed.math[Number(id)]
      const tex = item?.tex ?? ""
      if (kind === "INLINE") return `<span class="math-inline" data-tex="${escapeHtml(tex)}"></span>`
      return `<div class="math-block" data-tex="${escapeHtml(tex)}"></div>`
    })

    safe = safe.replace(/@@MERMAID_(\d+)@@/g, (_match, id: string) => {
      const code = preprocessed.mermaid[Number(id)] ?? ""
      return `<pre><code class="language-mermaid">${escapeHtml(code)}</code></pre>`
    })

    safe = safe.replace(/@@TOOL_REQUEST_(\d+)@@/g, (_match, id: string) => {
      const item = preprocessed.toolRequests[Number(id)]
      if (!item) return ""
      const summary = item.toolNames.length
        ? item.toolNames.map((name) => escapeHtml(name || "(missing tool_name)")).join("<br/>")
        : escapeHtml("tool call parse failed")
      return renderToolRequestHtml(options?.toolRequestPreset, summary, item.detailText)
    })

    safe = safe.replace(/@@STICKER_(\d+)@@/g, (_match, id: string) => {
      const item = preprocessed.stickers[Number(id)]
      if (!item) return ""
      const path = getStickerPath?.(item.category, item.name).trim() ?? ""
      if (!path) return `<span class="fw-sticker-miss">${escapeHtml(item.raw)}</span>`
      const size = item.size ? ` data-fw-sticker-size="${item.size}"` : ""
      return `<img class="fw-sticker" data-fw-img="1" data-ref-img="${escapeHtml(path)}"${size} src="${REF_IMG_PLACEHOLDER}" alt="${escapeHtml(item.name || "sticker")}" title="${escapeHtml(`${item.category}/${item.name}`)}" />`
    })

    element.innerHTML = safe
    enhanceLinks(element)
    enhanceCodeBlocks(element)
    mermaidSupport.ensureMermaidErrorCopyHandlerOnce(element)
    ensureToolRequestToggleHandlerOnce(element)
    markPreviewImages(element)
    hydrateStickerSizes(element)
    refImages.hydrateRefImages(element)

    Array.from(element.querySelectorAll(".math-block[data-tex], .math-inline[data-tex]")).forEach((node) => {
      if (!(node instanceof HTMLElement)) return
      const tex = node.getAttribute("data-tex") || ""
      katex.render(tex, node, { displayMode: node.classList.contains("math-block"), throwOnError: false })
    })
    enhanceMathCopyButtons(element, capabilities)

    void mermaidSupport.renderMermaidInto(element, policy).catch(() => undefined)
  }

  return {
    ensureRenderer,
    sanitizeHtml: htmlSanitizer.sanitizeHtml,
    sanitizeSvg,
    renderAssistantInto,
  }
}
