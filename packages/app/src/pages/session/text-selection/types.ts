export type SelectionAnchor = {
  scope: string
  start: number
  end: number
  text: string
}

export type HighlightRect = {
  id: string
  annotationID: string
  source: SelectionSource["type"]
  left: number
  top: number
  width: number
  height: number
}

export type SelectionDraft = {
  anchor: SelectionAnchor
  rect: DOMRect
  source: SelectionSource
}

export type SelectionSource =
  | {
      type: "session"
      messageID: string
    }
  | {
      type: "answer"
      annotationID: string
    }

export type TextSelectionAnnotation = {
  id: string
  parentID?: string
  source: SelectionSource
  anchor: SelectionAnchor
  question: string
  answer?: string
  model: {
    providerID: string
    modelID: string
  }
  variant?: string
  agent: string
  ephemeralPresetID?: string | null
  createdAt: number
  status: "pending" | "answered" | "error"
  error?: string
}

export type Surface = {
  id: string
  root: HTMLElement
  source?: SelectionSource
}
