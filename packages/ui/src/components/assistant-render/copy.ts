import { ICON_COPY, ICON_FAIL, ICON_OK } from "./icons"

export function setCopyButtonState(button: HTMLButtonElement, state: "copy" | "ok" | "fail") {
  if (state === "ok") {
    button.innerHTML = ICON_OK
    button.setAttribute("data-state", "ok")
    button.setAttribute("title", "Copied")
    button.setAttribute("aria-label", "Copied")
    return
  }
  if (state === "fail") {
    button.innerHTML = ICON_FAIL
    button.setAttribute("data-state", "fail")
    button.setAttribute("title", "Copy failed")
    button.setAttribute("aria-label", "Copy failed")
    return
  }
  button.innerHTML = ICON_COPY
  button.removeAttribute("data-state")
  button.setAttribute("title", "Copy code")
  button.setAttribute("aria-label", "Copy code")
}

export async function copyTextToClipboard(text: string) {
  const value = String(text || "")
  if (!value) return false

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    return false
  }

  return false
}

export function ensureCodeCopyHandlerOnce(root: HTMLElement) {
  if (root.getAttribute("data-fw-copy-hook") === "1") return
  root.setAttribute("data-fw-copy-hook", "1")

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : undefined
    const button = target?.closest('button[data-act="copy-code"]')
    if (!(button instanceof HTMLButtonElement)) return

    const text = button.closest("pre")?.querySelector("code")?.textContent ?? ""
    if (!text) return

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

export function enhanceCodeBlocks(root: unknown) {
  if (!(root instanceof HTMLElement)) return
  ensureCodeCopyHandlerOnce(root)

  Array.from(root.querySelectorAll("pre")).forEach((pre) => {
    if (!(pre instanceof HTMLElement)) return
    if (pre.getAttribute("data-fw-code") === "1") return

    const code = pre.querySelector("code")
    if (!(code instanceof HTMLElement)) return


    const className = String(code.className || "")
    if (className.includes("language-mermaid") || className.includes("lang-mermaid") || className.includes("mermaid")) return

    pre.setAttribute("data-fw-code", "1")
    pre.classList.add("fw-code-block")

    const button = document.createElement("button")
    button.type = "button"
    button.className = "fw-code-copy"
    button.setAttribute("data-act", "copy-code")
    setCopyButtonState(button, "copy")
    pre.appendChild(button)
  })
}
