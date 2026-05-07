export type BoolRef = { value: boolean }

export type RenderSafetyPolicy = "original" | "baseline" | "unsafe"

export type AssistantRenderCapabilities = {
  clipboard: {
    writeText?: (text: string) => Promise<void> | void
  }
  ui: {
    showToast?: (message: string) => void
  }
  files: {
    images: {
      read?: (request: { scope: string; path: string }) => Promise<unknown> | unknown
    }
  }
}

export type ToolRequestRenderPresetVarKey =
  | "border"
  | "bg"
  | "bgSize"
  | "bgPos"
  | "bgAnim"
  | "shadow"
  | "radius"
  | "pad"
  | "summaryColor"
  | "badgeBg"
  | "badgeBorder"
  | "badgeColor"
  | "preBg"
  | "prePad"
  | "preRadius"
  | "preBorder"
  | "preColor"
  | "backdrop"

export type ToolRequestRenderPreset = {
  badgeText?: string
  vars?: Partial<Record<ToolRequestRenderPresetVarKey, string>>
}
