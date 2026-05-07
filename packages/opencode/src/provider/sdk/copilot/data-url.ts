import { convertToBase64 } from "@ai-sdk/provider-utils"

export function toDataUrl(mediaType: string, data: Parameters<typeof convertToBase64>[0]) {
  if (typeof data === "string" && data.startsWith("data:")) return data
  return `data:${mediaType};base64,${convertToBase64(data)}`
}
