import { Marked } from "marked"
import { tokenizeFences } from "./preprocess"
import { escapeHtml } from "./utils"

const renderer = new Marked({ gfm: true, breaks: true })

function dedentHtmlLines(value: unknown) {
  return String(value || "").replace(/^([ \t]+)(?=<|<!--)/gm, (_match, whitespace: string) => {
    const columns = Array.from(whitespace).reduce((total, char) => total + (char === "\t" ? 4 - (total % 4) : 1), 0)
    if (columns < 4) return whitespace
    return " ".repeat(columns % 4)
  })
}

export function preprocessHtmlIndentation(source: unknown) {
  return tokenizeFences(String(source || "").replace(/\r\n/g, "\n"))
    .map((token) => (token.kind === "text" ? dedentHtmlLines(token.text) : token.raw))
    .join("")
}

export function createMarkdownRenderer() {
  function renderMarkdownSource(source: unknown) {
    const src = String(source || "")
    const html = renderer.parse(src)
    if (typeof html === "string") return html
    return `<pre>${escapeHtml(src)}</pre>`
  }

  return { renderMarkdownSource }
}
