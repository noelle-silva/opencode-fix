import { copyTextToClipboard, setCopyButtonState } from "./copy"
import { ICON_COPY } from "./icons"
import { sanitizeSvg } from "./sanitize"
import type { BoolRef, RenderSafetyPolicy } from "./types"
import { escapeHtml, uid } from "./utils"

type MermaidResult = string | { svg?: string; bindFunctions?: (element: HTMLElement) => void }
type MermaidApi = {
  initialize?: (options: unknown) => void
  render?: (id: string, code: string, container?: HTMLElement) => MermaidResult | Promise<MermaidResult>
}

function isMermaidApi(value: unknown): value is MermaidApi {
  return !!value && typeof value === "object" && typeof (value as MermaidApi).render === "function"
}

function windowMermaid() {
  if (typeof window === "undefined") return
  const value = (window as unknown as { mermaid?: MermaidApi }).mermaid
  if (!isMermaidApi(value)) return
  return value
}

export function createMermaidSupport(input: { mermaidInited: BoolRef; mermaidSvgCache: Map<string, string> }) {
  let mermaidPromise: Promise<MermaidApi | undefined> | undefined

  function loadMermaid() {
    const existing = windowMermaid()
    if (existing) return Promise.resolve(existing)

    mermaidPromise ??= import("mermaid")
      .then((mod) => {
        const value = (mod as { default?: unknown }).default ?? mod
        if (!isMermaidApi(value)) return
        ;(window as unknown as { mermaid?: MermaidApi }).mermaid = value
        return value
      })
      .catch(() => undefined)

    return mermaidPromise
  }

  function ensureMermaidErrorCopyHandlerOnce(root: HTMLElement) {
    if (root.getAttribute("data-fw-mmerr-copy-hook") === "1") return
    root.setAttribute("data-fw-mmerr-copy-hook", "1")

    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : undefined
      const button = target?.closest('button[data-act="copy-mermaid-src"]')
      if (!(button instanceof HTMLButtonElement)) return

      const text = button.closest(".mermaid-error-box")?.querySelector(".mermaid-error-src")?.textContent ?? ""
      if (!text.trim()) return

      button.disabled = true
      copyTextToClipboard(text)
        .then((ok) => setCopyButtonState(button, ok ? "ok" : "fail"))
        .catch(() => setCopyButtonState(button, "fail"))
        .finally(() => {
          window.setTimeout(() => {
            if (!button.isConnected) return
            setCopyButtonState(button, "copy")
            button.disabled = false
          }, 1200)
        })
    })
  }

  async function initMermaidOnce() {
    const mermaid = await loadMermaid()
    if (input.mermaidInited.value || !mermaid?.initialize) return
    input.mermaidInited.value = true
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "default",
      flowchart: { htmlLabels: false },
      state: { htmlLabels: false },
      class: { htmlLabels: false },
    })
  }

  async function renderMermaidInto(root: unknown, policy?: RenderSafetyPolicy) {
    if (!(root instanceof HTMLElement)) return
    const mermaid = await loadMermaid()
    if (!mermaid?.render) return

    await initMermaidOnce()
    const codes = Array.from(root.querySelectorAll("pre>code")).filter((code): code is HTMLElement => {
      if (!(code instanceof HTMLElement)) return false
      const className = String(code.className || "")
      return className.includes("language-mermaid") || className.includes("lang-mermaid") || className.includes("mermaid")
    })

    for (const code of codes) {
      const pre = code.closest("pre")
      if (!(pre instanceof HTMLElement)) continue
      if (pre.getAttribute("data-mermaid") === "1") continue

      const source = String(code.textContent || "").trim()
      pre.setAttribute("data-mermaid", "1")
      if (!source) continue

      const holder = document.createElement("div")
      holder.className = "mermaid-block"
      holder.setAttribute("data-mermaid", "0")
      pre.replaceWith(holder)

      const cached = input.mermaidSvgCache.get(source)
      if (cached) {
        holder.innerHTML = cached
        holder.setAttribute("data-mermaid", "1")
        continue
      }

      try {
        const result = await Promise.resolve(mermaid.render(uid("mm"), source, holder))
        const svg = typeof result === "string" ? result : String(result.svg || "")
        const safe = sanitizeSvg(svg, policy)
        if (!safe) throw new Error("empty svg")
        if (input.mermaidSvgCache.size >= 50) input.mermaidSvgCache.delete(input.mermaidSvgCache.keys().next().value ?? "")
        input.mermaidSvgCache.set(source, safe)
        holder.innerHTML = safe
        holder.setAttribute("data-mermaid", "1")
        if (typeof result !== "string") result.bindFunctions?.(holder)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "")
        holder.className = "mermaid-error"
        holder.removeAttribute("data-mermaid")
        holder.setAttribute("data-mermaid-error", "1")
        holder.innerHTML = `<div class="mermaid-error-box" role="alert"><button class="mermaid-error-copy" type="button" data-act="copy-mermaid-src" title="Copy Mermaid source" aria-label="Copy Mermaid source">${ICON_COPY}</button><div class="mermaid-error-title">Mermaid render failed</div><div class="mermaid-error-msg">${escapeHtml(message || "Unknown error")}</div><pre class="mermaid-error-src" aria-hidden="true">${escapeHtml(source)}</pre></div>`
      }
    }
  }

  return { initMermaidOnce, renderMermaidInto, ensureMermaidErrorCopyHandlerOnce }
}
