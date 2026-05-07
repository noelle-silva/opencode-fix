import DOMPurify from "dompurify"
import type { BoolRef, RenderSafetyPolicy } from "./types"

const baseTags = [
  "a",
  "blockquote",
  "br",
  "button",
  "code",
  "details",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "label",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "summary",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]

const baseAttrs = [
  "alt",
  "aria-label",
  "aria-hidden",
  "checked",
  "class",
  "colspan",
  "data-act",
  "data-fw-img",
  "data-fw-sticker-size",
  "data-fw-toolreq",
  "data-fw-toolreq-body",
  "data-fw-toolreq-summary",
  "data-ref-img",
  "disabled",
  "href",
  "id",
  "open",
  "rel",
  "role",
  "rowspan",
  "src",
  "style",
  "tabindex",
  "target",
  "title",
  "type",
  "value",
]

function normalizePolicy(policy?: RenderSafetyPolicy): RenderSafetyPolicy {
  if (policy === "unsafe") return "unsafe"
  if (policy === "baseline") return "baseline"
  return "original"
}

function isSafeHref(href: unknown, policy: RenderSafetyPolicy) {
  const value = String(href || "").trim().toLowerCase()
  if (policy === "unsafe") return true
  if (policy === "baseline") return !value.startsWith("javascript:")
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:") || value.startsWith("#")
}

function sanitizeStyleValue(style: unknown, policy: RenderSafetyPolicy) {
  const value = String(style || "")
  if (!value.trim()) return ""
  if (policy === "unsafe") return value

  return value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const lowered = part.toLowerCase()
      if (!part.includes(":")) return false
      if (lowered.includes("expression(") || lowered.includes("javascript:")) return false
      if (policy === "original" && (lowered.includes("@import") || lowered.includes("url("))) return false
      return !part.includes("<") && !part.includes(">")
    })
    .join(";")
}

export function createHtmlSanitizer(domPurifyHooked: BoolRef) {
  function sanitizeHtml(html: unknown, policy?: RenderSafetyPolicy) {
    const raw = String(html || "")
    const mode = normalizePolicy(policy)
    if (mode === "unsafe") return raw

    if (DOMPurify.isSupported) {
      if (!domPurifyHooked.value) {
        domPurifyHooked.value = true
        DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
          const name = String(data.attrName || "").toLowerCase()
          if (name.startsWith("on")) data.keepAttr = false
          if (name === "href" && !isSafeHref(data.attrValue, "original")) data.keepAttr = false
          if (name === "style") {
            const value = sanitizeStyleValue(data.attrValue, "original")
            if (!value) data.keepAttr = false
            if (value) data.attrValue = value
          }
        })
      }

      return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: mode === "baseline" ? [...baseTags, "audio", "embed", "iframe", "object", "source", "style", "video"] : baseTags,
        ALLOWED_ATTR: mode === "baseline" ? [...baseAttrs, "autoplay", "controls", "download", "height", "loop", "muted", "name", "playsinline", "poster", "width"] : baseAttrs,
        ALLOW_DATA_ATTR: true,
        FORBID_TAGS: mode === "baseline" ? ["script"] : ["script", "style", "iframe", "object", "embed"],
      })
    }

    const template = document.createElement("template")
    template.innerHTML = raw
    const allowedTags = new Set(baseTags.map((tag) => tag.toUpperCase()))
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT)
    const remove: Node[] = []

    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.nodeType === Node.COMMENT_NODE) {
        remove.push(node)
        continue
      }

      const element = node as Element
      if (!allowedTags.has(element.tagName)) {
        element.replaceWith(document.createTextNode(element.textContent || ""))
        continue
      }

      Array.from(element.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase()
        if (name.startsWith("on") || !baseAttrs.includes(name)) {
          element.removeAttribute(attr.name)
          return
        }
        if (name === "href" && !isSafeHref(attr.value, mode)) element.removeAttribute(attr.name)
        if (name === "style") {
          const style = sanitizeStyleValue(attr.value, mode)
          if (style) element.setAttribute("style", style)
          if (!style) element.removeAttribute(attr.name)
        }
      })
    }

    remove.forEach((node) => node.parentNode?.removeChild(node))
    return template.innerHTML
  }

  return { sanitizeHtml }
}

export function sanitizeSvg(svg: unknown, policy?: RenderSafetyPolicy) {
  const raw = String(svg || "")
  const mode = normalizePolicy(policy)
  if (!raw) return ""
  if (mode === "unsafe") return raw
  if (mode === "baseline") {
    return raw
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/\son[a-z0-9_-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\shref\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi, "")
  }
  if (!DOMPurify.isSupported) return raw
  return DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } })
}
