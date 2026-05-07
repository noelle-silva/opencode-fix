import { parseStickerSize } from "./stickers"

type PreprocessedMath = { tex: string; display: boolean }
type PreprocessedSticker = { raw: string; category: string; name: string; size?: number }
type PreprocessedToolRequest = {
  ok: boolean
  toolNames: string[]
  detailText: string
}

export type FenceToken =
  | { kind: "text"; text: string }
  | { kind: "fence"; raw: string; lang: string; content: string; closed: boolean }

export function preprocessAssistantContent(
  source: unknown,
  options?: { stickersEnabled?: boolean },
): {
  text: string
  math: PreprocessedMath[]
  mermaid: string[]
  stickers: PreprocessedSticker[]
  toolRequests: PreprocessedToolRequest[]
} {
  const mermaid: string[] = []
  const math: PreprocessedMath[] = []
  const stickers: PreprocessedSticker[] = []
  const toolRequests: PreprocessedToolRequest[] = []
  const text = tokenizeFences(String(source || "").replace(/\r\n/g, "\n"))
    .map((token) => {
      if (token.kind === "text") {
        const withTools = replaceToolRequestsOutsideInlineCode(token.text, toolRequests)
        const withMath = replaceMathOutsideInlineCode(withTools, math)
        return options?.stickersEnabled ? replaceStickersOutsideInlineCode(withMath, stickers) : withMath
      }

      const lang = token.lang.trim().toLowerCase()
      if (token.closed && (lang === "mermaid" || lang === "flowchart" || lang === "graph")) {
        const id = mermaid.length
        mermaid.push(token.content.trim())
        return `@@MERMAID_${id}@@`
      }

      return token.raw
    })
    .join("")

  return { text, math, mermaid, stickers, toolRequests }
}

export function tokenizeFences(input: string): FenceToken[] {
  const lines = String(input || "").split("\n")
  const out: FenceToken[] = []
  const textBuffer: string[] = []
  const openRe = /^(\s*)(`{3,})(.*)$/
  const closeRe = /^(\s*)(`{3,})\s*$/

  let inFence = false
  let fenceIndent = ""
  let fenceMarker = ""
  let fenceInfo = ""
  let openLineRaw = ""
  let fenceLinesRaw: string[] = []

  const flushText = () => {
    if (!textBuffer.length) return
    out.push({ kind: "text", text: textBuffer.join("") })
    textBuffer.length = 0
  }

  lines.forEach((line, index) => {
    const withNewline = index < lines.length - 1 ? `${line}\n` : line
    if (!inFence) {
      const match = openRe.exec(line)
      if (!match) {
        textBuffer.push(withNewline)
        return
      }

      flushText()
      inFence = true
      fenceIndent = match[1] || ""
      fenceMarker = match[2] || "```"
      fenceInfo = (match[3] || "").trim()
      openLineRaw = withNewline
      fenceLinesRaw = []
      return
    }

    const match = closeRe.exec(line)
    if (match && (match[1] || "") === fenceIndent && (match[2] || "") === fenceMarker) {
      const content = fenceLinesRaw.join("")
      out.push({
        kind: "fence",
        raw: `${openLineRaw}${content}${withNewline}`,
        lang: fenceInfo.split(/\s+/g)[0] || "",
        content,
        closed: true,
      })
      inFence = false
      fenceIndent = ""
      fenceMarker = ""
      fenceInfo = ""
      openLineRaw = ""
      fenceLinesRaw = []
      return
    }

    fenceLinesRaw.push(withNewline)
  })

  if (inFence) {
    out.push({
      kind: "fence",
      raw: openLineRaw + fenceLinesRaw.join(""),
      lang: fenceInfo.split(/\s+/g)[0] || "",
      content: fenceLinesRaw.join(""),
      closed: false,
    })
  }

  flushText()
  return out
}

function splitInlineCodeSpans(input: string): Array<{ kind: "text" | "code"; value: string }> {
  const value = String(input || "")
  const out: Array<{ kind: "text" | "code"; value: string }> = []
  let index = 0
  let last = 0

  while (index < value.length) {
    if (value[index] !== "`") {
      index++
      continue
    }

    let size = 1
    while (index + size < value.length && value[index + size] === "`") size++
    const marker = "`".repeat(size)
    const end = value.indexOf(marker, index + size)
    if (end < 0) break

    if (index > last) out.push({ kind: "text", value: value.slice(last, index) })
    out.push({ kind: "code", value: value.slice(index, end + size) })
    index = end + size
    last = index
  }

  if (last < value.length) out.push({ kind: "text", value: value.slice(last) })
  return out
}

function mapPlainText(input: string, mapper: (value: string) => string) {
  return splitInlineCodeSpans(input)
    .map((part) => (part.kind === "code" ? part.value : mapper(part.value)))
    .join("")
}

function replaceMathOutsideInlineCode(input: string, acc: PreprocessedMath[]) {
  return mapPlainText(input, (value) => replaceMathInPlainText(value, acc))
}

function replaceStickersOutsideInlineCode(input: string, acc: PreprocessedSticker[]) {
  return mapPlainText(input, (value) => replaceStickersInPlainText(value, acc))
}

function replaceToolRequestsOutsideInlineCode(input: string, acc: PreprocessedToolRequest[]) {
  return mapPlainText(input, (value) => replaceToolRequestsInPlainText(value, acc))
}

function toolNamesFromBlock(rawBlock: string) {
  return Array.from(rawBlock.matchAll(/tool_name\s*:\s*([^\n\r]+)/gi))
    .map((match) => match[1]?.trim())
    .filter((name): name is string => !!name)
}

function replaceToolRequestsInPlainText(input: string, acc: PreprocessedToolRequest[]) {
  const value = String(input || "")
  const open = "<<<[TOOL_REQUEST]>>>"
  const close = "<<<[END_TOOL_REQUEST]>>>"
  let out = ""
  let index = 0

  while (index < value.length) {
    const openIndex = value.indexOf(open, index)
    if (openIndex < 0) {
      out += value.slice(index)
      break
    }

    const closeIndex = value.indexOf(close, openIndex + open.length)
    if (closeIndex < 0) {
      out += value.slice(index)
      break
    }

    const endIndex = closeIndex + close.length
    const rawBlock = value.slice(openIndex, endIndex)
    const toolNames = toolNamesFromBlock(rawBlock)
    const id = acc.length
    acc.push({ ok: toolNames.length > 0, toolNames, detailText: rawBlock })
    out += value.slice(index, openIndex)
    out += `@@TOOL_REQUEST_${id}@@`
    index = endIndex
  }

  return out
}

function replaceStickersInPlainText(input: string, acc: PreprocessedSticker[]) {
  return String(input || "").replace(/\[\[\s*(?:sticker|emoji)\s*:\s*([^\]\n]{1,220}?)\s*\]\]/g, (match, innerRaw: string) => {
    const parts = innerRaw
      .trim()
      .replace(/\\/g, "/")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)

    if (parts.length !== 2 && parts.length !== 3) return match
    if (parts.some((part) => part.includes("..") || part.includes("://") || part.includes("\u0000") || part.includes("]")))
      return match

    const size = parts.length === 3 ? parseStickerSize(parts[2]) : 0
    if (parts.length === 3 && !size) return match

    const id = acc.length
    acc.push({ raw: match, category: parts[0]!, name: parts[1]!, size: size || undefined })
    return `@@STICKER_${id}@@`
  })
}

function replaceMathInPlainText(input: string, acc: PreprocessedMath[]) {
  const stash = (tex: string, display: boolean) => {
    const id = acc.length
    acc.push({ tex: tex.trim(), display })
    return `@@MATH_${display ? "BLOCK" : "INLINE"}_${id}@@`
  }

  return String(input || "")
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_match, tex: string) => stash(tex, true))
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, tex: string) => stash(tex, true))
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, tex: string) => stash(tex, false))
    .replace(/\$([^$\n]+?)\$/g, (match, tex: string) => {
      const trimmed = tex.trim()
      if (!trimmed || !/[A-Za-z\\]|[_^]/.test(trimmed)) return match
      return stash(trimmed, false)
    })
}
