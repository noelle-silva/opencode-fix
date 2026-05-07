import type { BoolRef, ToolRequestRenderPreset, ToolRequestRenderPresetVarKey } from "./types"
import { escapeHtml } from "./utils"

const varToCss: Record<ToolRequestRenderPresetVarKey, string> = {
  border: "--fw-toolreq-border",
  bg: "--fw-toolreq-bg",
  bgSize: "--fw-toolreq-bg-size",
  bgPos: "--fw-toolreq-bg-pos",
  bgAnim: "--fw-toolreq-bg-anim",
  shadow: "--fw-toolreq-shadow",
  radius: "--fw-toolreq-radius",
  pad: "--fw-toolreq-pad",
  summaryColor: "--fw-toolreq-summary-color",
  badgeBg: "--fw-toolreq-badge-bg",
  badgeBorder: "--fw-toolreq-badge-border",
  badgeColor: "--fw-toolreq-badge-color",
  preBg: "--fw-toolreq-pre-bg",
  prePad: "--fw-toolreq-pre-pad",
  preRadius: "--fw-toolreq-pre-radius",
  preBorder: "--fw-toolreq-pre-border",
  preColor: "--fw-toolreq-pre-color",
  backdrop: "--fw-toolreq-backdrop",
}

const varKeys = Object.keys(varToCss) as ToolRequestRenderPresetVarKey[]

function isSafeCssValue(value: string) {
  const lowered = value.toLowerCase()
  if (/[<>]/.test(value)) return false
  if (lowered.includes("expression(") || lowered.includes("javascript:")) return false
  return true
}

function presetVarsToInlineStyle(vars: ToolRequestRenderPreset["vars"]) {
  if (!vars) return ""
  return varKeys
    .map((key) => {
      const value = vars[key]?.trim()
      if (!value || !isSafeCssValue(value)) return
      return `${varToCss[key]}:${value}`
    })
    .filter((value): value is string => !!value)
    .join(";")
}

export function ensureToolReqCssOnce(inited: BoolRef) {
  if (inited.value) return
  inited.value = true
  if (document.getElementById("fw-toolreq-css")) return

  const style = document.createElement("style")
  style.id = "fw-toolreq-css"
  style.textContent =
    "@keyframes fw-toolreq-flow-x{0%{background-position:0% 50%;}100%{background-position:200% 50%;}}@media (prefers-reduced-motion: reduce){details.fw-toolreq{animation:none !important;}}"
  document.head.appendChild(style)
}

export function renderToolRequestHtml(preset: ToolRequestRenderPreset | null | undefined, summaryHtml: string, detailText: string) {
  const badgeText = preset?.badgeText?.trim().slice(0, 16) ?? ""
  const varsInline = presetVarsToInlineStyle(preset?.vars)
  const badge = badgeText
    ? `<span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;height:18px;padding:0 8px;border-radius:999px;background:var(--fw-toolreq-badge-bg,rgba(245,158,11,.10));border:1px solid var(--fw-toolreq-badge-border,rgba(245,158,11,.18));color:var(--fw-toolreq-badge-color,rgba(245,158,11,.92));letter-spacing:.08em;font-size:11px;font-weight:900;">${escapeHtml(badgeText)}</span>`
    : ""

  return `<details class="fw-toolreq" data-fw-toolreq="1" style="margin:10px 0;border:1px solid var(--fw-toolreq-border,rgba(245,158,11,.25));background:var(--fw-toolreq-bg,rgba(245,158,11,.05));background-size:var(--fw-toolreq-bg-size,auto);background-position:var(--fw-toolreq-bg-pos,0% 50%);animation:var(--fw-toolreq-bg-anim,none);box-shadow:var(--fw-toolreq-shadow,none);border-radius:var(--fw-toolreq-radius,12px);padding:var(--fw-toolreq-pad,8px 10px);backdrop-filter:var(--fw-toolreq-backdrop,none);-webkit-backdrop-filter:var(--fw-toolreq-backdrop,none)${varsInline ? `;${escapeHtml(varsInline)}` : ""}"><summary data-fw-toolreq-summary="1" style="cursor:pointer;user-select:none;-webkit-user-select:none;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;white-space:pre-line;outline:none;color:var(--fw-toolreq-summary-color,inherit);"><span style="display:inline-flex;align-items:center;gap:8px;">${badge}<span style="min-width:0;">${summaryHtml}</span></span></summary><div data-fw-toolreq-body="1" style="overflow:hidden;max-height:0px;opacity:0;transform:translateY(-2px);transition:max-height 240ms ease,opacity 180ms ease,transform 240ms ease;will-change:max-height,opacity,transform;"><pre style="margin:10px 0 0 0;padding:var(--fw-toolreq-pre-pad,8px 10px);background:var(--fw-toolreq-pre-bg,rgba(255,255,255,.7));border:1px solid var(--fw-toolreq-pre-border,rgba(245,158,11,.18));border-radius:var(--fw-toolreq-pre-radius,10px);white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;color:var(--fw-toolreq-pre-color,inherit);">${escapeHtml(detailText)}</pre></div></details>`
}

export function ensureToolRequestToggleHandlerOnce(root: HTMLElement) {
  if (root.getAttribute("data-fw-toolreq-hook") === "1") return
  root.setAttribute("data-fw-toolreq-hook", "1")

  const toggle = (details: HTMLElement, body: HTMLElement) => {
    const open = details.hasAttribute("open")
    if (!open) {
      details.setAttribute("open", "")
      body.style.overflow = "hidden"
      body.style.maxHeight = "0px"
      body.style.opacity = "0"
      body.style.transform = "translateY(-2px)"
      body.getBoundingClientRect()
      body.style.maxHeight = `${body.scrollHeight}px`
      body.style.opacity = "1"
      body.style.transform = "translateY(0)"
      return
    }

    body.style.overflow = "hidden"
    body.style.maxHeight = `${body.scrollHeight}px`
    body.style.opacity = "1"
    body.style.transform = "translateY(0)"
    body.getBoundingClientRect()
    body.style.maxHeight = "0px"
    body.style.opacity = "0"
    body.style.transform = "translateY(-2px)"

    window.setTimeout(() => {
      if (details.isConnected && details.hasAttribute("open")) details.removeAttribute("open")
    }, 260)
  }

  const findParts = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : undefined
    const summary = element?.closest('summary[data-fw-toolreq-summary="1"]')
    if (!(summary instanceof HTMLElement)) return
    const details = summary.closest("details.fw-toolreq")
    if (!(details instanceof HTMLElement)) return
    const body = details.querySelector('[data-fw-toolreq-body="1"]')
    if (!(body instanceof HTMLElement)) return
    return { details, body }
  }

  root.addEventListener("mousedown", (event) => {
    if (!findParts(event.target)) return
    event.preventDefault()
  })

  root.addEventListener("click", (event) => {
    const parts = findParts(event.target)
    if (!parts) return
    event.preventDefault()
    toggle(parts.details, parts.body)
  })

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return
    const parts = findParts(event.target)
    if (!parts) return
    event.preventDefault()
    toggle(parts.details, parts.body)
  })
}
