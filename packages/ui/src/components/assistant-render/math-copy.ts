import type { AssistantRenderCapabilities } from "./types"

function ensureMathCopyHandlerOnce(root: unknown, capabilities: AssistantRenderCapabilities) {
  if (!(root instanceof HTMLElement)) return
  if (root.dataset.fwMathCopyBound === "1") return
  root.dataset.fwMathCopyBound = "1"

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : undefined
    const button = target?.closest(".fw-math-copy")
    if (!(button instanceof HTMLElement)) return

    const host = button.closest(".fw-math-host")
    if (!(host instanceof HTMLElement)) return

    const tex = (host.getAttribute("data-tex") || "").trim()
    if (!tex) return

    event.preventDefault()
    event.stopPropagation()

    const copyText = host.classList.contains("math-block") ? `$$\n${tex}\n$$` : `$${tex}$`
    Promise.resolve(capabilities.clipboard.writeText?.(copyText))
      .then(() => capabilities.ui.showToast?.("Formula copied"))
      .catch(() => undefined)
  })
}

export function enhanceMathCopyButtons(root: unknown, capabilities: AssistantRenderCapabilities) {
  if (!(root instanceof HTMLElement)) return

  Array.from(root.querySelectorAll(".math-block[data-tex], .math-inline[data-tex]")).forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    if (node.getAttribute("data-fw-math") === "1") return
    node.setAttribute("data-fw-math", "1")
    node.classList.add("fw-math-host")

    const button = document.createElement("button")
    button.type = "button"
    button.className = "fw-math-copy"
    button.setAttribute("aria-label", "Copy LaTeX formula")
    button.textContent = "Copy"
    node.appendChild(button)
  })

  ensureMathCopyHandlerOnce(root, capabilities)
}
