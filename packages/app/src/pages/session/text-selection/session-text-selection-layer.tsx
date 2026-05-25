import { Button } from "@opencode-ai/ui/button"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/ui/markdown"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Select } from "@opencode-ai/ui/select"
import { showToast } from "@opencode-ai/ui/toast"
import { makeEventListener } from "@solid-primitives/event-listener"
import { batch, createEffect, createMemo, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { ModelSelectorPopover } from "@/components/dialog-select-model"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLocal, type ModelKey } from "@/context/local"
import { getConfiguredAgentVariant, resolveModelVariant } from "@/context/model-variant"
import { useSettings } from "@/context/settings"
import { useSDK } from "@/context/sdk"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Persist, persisted } from "@/utils/persist"
import { formatServerError } from "@/utils/server-errors"
import { createHighlightRects, draftFromSelection } from "./anchor"
import type { HighlightRect, SelectionDraft, Surface, TextSelectionAnnotation } from "./types"

const commandID = "selection.ask"
const commandKeybind = "mod+shift+a"
const promptOffset = 12
const emptyAnnotations: TextSelectionAnnotation[] = []
const emptyRects: HighlightRect[] = []
const emptyMessages: Message[] = []
const emptyParts: Part[] = []
const contextOptions: ContextOption[] = [
  { value: "no", labelKey: "selection.ask.context.no" },
  { value: "yes", labelKey: "selection.ask.context.yes" },
] 
type ContextOption = {
  value: "no" | "yes"
  labelKey: "selection.ask.context.no" | "selection.ask.context.yes"
}
type ContextMessage = {
  role: "user" | "assistant"
  content: string
}
const ignoredSelectionTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest("[data-selection-ignore]")
const isAskSelectionKeybind = (event: KeyboardEvent) =>
  event.shiftKey && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a"
const createAnnotationID = () =>
  typeof crypto === "object" && "randomUUID" in crypto ? crypto.randomUUID() : `selection-${Date.now()}-${Math.random().toString(36).slice(2)}`
const rootForAnchor = (scope: string, surfaces: Surface[]) => {
  const exact = surfaces.find((surface) => surface.id === scope)
  if (exact) return exact.root

  return surfaces.flatMap((surface) => Array.from(surface.root.querySelectorAll<HTMLElement>("[data-message-id]"))).find(
    (message) => message.dataset.messageId === scope,
  )
}
const selectionKey = (annotation: TextSelectionAnnotation) =>
  [annotation.source.type, annotation.anchor.scope, annotation.anchor.start, annotation.anchor.end, annotation.anchor.text].join("\u0000")
const latestUniqueAnnotations = (items: TextSelectionAnnotation[]) =>
  Array.from(
    items
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .reduce((result, annotation) => {
        const key = selectionKey(annotation)
        if (!result.has(key)) result.set(key, annotation)
        return result
      }, new Map<string, TextSelectionAnnotation>())
      .values(),
  )
const clampPosition = (input: { left: number; top: number }, size: { width: number; height: number }) => ({
  left: Math.min(Math.max(12, input.left), window.innerWidth - size.width),
  top: Math.min(Math.max(12, input.top), window.innerHeight - size.height),
})
const partText = (part: Part) => {
  if (part.type === "text" || part.type === "reasoning") return part.text
  if (part.type === "file") return `[file:${part.filename ?? part.url}]`
  if (part.type === "agent") return `@${part.name}`
  if (part.type === "tool") return `[tool:${part.tool}]`
  return ""
}
const messageText = (parts: Part[]) => parts.map(partText).filter(Boolean).join("\n").trim()

export function SessionTextSelectionLayer(props: {
  sessionID: string
  sessionDirectory: string
  root: () => HTMLElement | undefined
  messages: () => Message[]
  parts: (messageID: string) => Part[] | undefined
}) {
  const sdk = useSDK()
  const local = useLocal()
  const settings = useSettings()
  const language = useLanguage()
  const dialog = useDialog()
  const command = useCommand()
  const [persistedStore, setPersistedStore] = persisted(
    Persist.session(props.sessionDirectory, props.sessionID, "text-selection.v1"),
    createStore({ annotations: emptyAnnotations }),
  )
  const [store, setStore] = createStore<{
    draft?: SelectionDraft
    contextMenu?: {
      draft: SelectionDraft
      left: number
      top: number
    }
    prompt: string
    submitting?: boolean
    activeAnnotationID?: string
    answerDialogOpen?: boolean
    rects: HighlightRect[]
    surfaces: Surface[]
    agent?: string
    model?: ModelKey
    variant?: string | null
    ephemeralPresetID?: string | null
    includeContext?: boolean
  }>({
    prompt: "",
    rects: [],
    surfaces: [],
  })
  let textarea: HTMLTextAreaElement | undefined
  let refreshFrame: number | undefined

  const annotations = createMemo(() => persistedStore.annotations ?? emptyAnnotations)
  const activeAnnotation = createMemo(() => annotations().find((item) => item.id === store.activeAnnotationID))
  const activeSelectionAnnotations = createMemo(() => {
    const annotation = activeAnnotation()
    if (!annotation) return emptyAnnotations
    const key = selectionKey(annotation)
    return annotations()
      .filter((item) => selectionKey(item) === key)
      .sort((a, b) => b.createdAt - a.createdAt)
  })
  const path = createMemo(() => {
    const byID = new Map(annotations().map((item) => [item.id, item]))
    const result: TextSelectionAnnotation[] = []
    let item = activeAnnotation()
    while (item) {
      result.unshift(item)
      item = item.parentID ? byID.get(item.parentID) : undefined
    }
    return result
  })
  const agentNames = createMemo(() => local.agent.list().map((agent) => agent.name))
  const selectedAgent = createMemo(() => local.agent.list().find((agent) => agent.name === store.agent) ?? local.agent.current())
  const selectedModel = createMemo(() => {
    if (!store.model) return local.model.current()
    return local.model.list().find((model) => model.id === store.model?.modelID && model.provider.id === store.model?.providerID)
  })
  const variants = createMemo(() => Object.keys(selectedModel()?.variants ?? {}))
  const selectionModel = {
    ready: local.model.ready,
    current: selectedModel,
    recent: local.model.recent,
    list: local.model.list,
    cycle(direction: 1 | -1) {
      const items = local.model.recent().filter((entry): entry is NonNullable<typeof entry> => !!entry)
      const item = selectedModel()
      if (!item) return
      const index = items.findIndex((entry) => entry.provider.id === item.provider.id && entry.id === item.id)
      const next = items[index + direction] ?? items[direction > 0 ? 0 : items.length - 1]
      if (!next) return
      setStore("model", { providerID: next.provider.id, modelID: next.id })
    },
    set(item: ModelKey | undefined) {
      setStore("model", item)
      if (!item) return
      local.model.setVisibility(item, true)
    },
    visible: local.model.visible,
    setVisibility: local.model.setVisibility,
    variant: {
      configured() {
        const model = selectedModel()
        return getConfiguredAgentVariant({
          agent: selectedAgent(),
          model: model ? { providerID: model.provider.id, modelID: model.id, variants: model.variants } : undefined,
        })
      },
      selected() {
        return store.variant
      },
      current() {
        return resolveModelVariant({
          variants: variants(),
          selected: store.variant,
          configured: selectionModel.variant.configured(),
        })
      },
      list: variants,
      set(value: string | undefined) {
        setStore("variant", value ?? null)
      },
      cycle() {
        const items = variants()
        if (items.length === 0) return
        const current = selectionModel.variant.current()
        setStore("variant", current ? items[items.indexOf(current) + 1] ?? null : items[0])
      },
    },
  }
  const emptyEphemeralContext = () => ({ id: "", name: language.t("prompt.ephemeralContext.none"), category: "" })
  const ephemeralContextOptions = createMemo(() => [
    emptyEphemeralContext(),
    ...settings.ephemeralContexts.presets().map((preset) => ({
      id: preset.id,
      name: preset.name,
      category: preset.category.trim() || language.t("settings.ephemeralContexts.group.ungrouped"),
    })),
  ])
  const currentEphemeralContext = createMemo(
    () => ephemeralContextOptions().find((option) => option.id === (store.ephemeralPresetID ?? "")) ?? ephemeralContextOptions()[0],
  )
  const selectedEphemeralMessages = createMemo(() =>
    settings.ephemeralContexts
      .presets()
      .find((preset) => preset.id === store.ephemeralPresetID)
      ?.messages.filter((message) => message.enabled && message.content.trim())
      .map((message) => ({ role: message.role, position: message.position, content: message.content.trim() })),
  )
  const promptPosition = createMemo(() => {
    const rect = store.draft?.rect
    if (!rect) return
    return clampPosition({ left: rect.left, top: rect.bottom + promptOffset }, { width: 340, height: 240 })
  })

  const surfaces = () => {
    const root = props.root()
    return root ? [{ id: props.sessionID, root }, ...store.surfaces] : store.surfaces
  }

  const currentContextOption = createMemo<ContextOption>(() => contextOptions.find((option) => option.value === (store.includeContext ? "yes" : "no")) ?? contextOptions[0])

  const sourceMessageID = (annotation: TextSelectionAnnotation): string | undefined => {
    if (annotation.source.type === "session") return annotation.source.messageID
    const parent = annotation.parentID ? annotations().find((item) => item.id === annotation.parentID) : undefined
    if (!parent) return
    return sourceMessageID(parent)
  }

  const mainContext = (annotation: TextSelectionAnnotation) => {
    const id = sourceMessageID(annotation)
    if (!id) return []
    const messages = props.messages() ?? emptyMessages
    const index = messages.findIndex((message) => message.id === id)
    const scoped = index >= 0 ? messages.slice(0, index + 1) : messages
    return scoped
      .map((message): ContextMessage | undefined => {
        const content = messageText(props.parts(message.id) ?? emptyParts)
        if (!content) return
        return { role: message.role === "assistant" ? "assistant" : "user", content }
      })
      .filter((item): item is ContextMessage => !!item)
  }

  const pathContext = (annotation: TextSelectionAnnotation) => {
    const byID = new Map(annotations().map((item) => [item.id, item]))
    const chain: TextSelectionAnnotation[] = []
    let item = annotation.parentID ? byID.get(annotation.parentID) : undefined
    while (item) {
      chain.unshift(item)
      item = item.parentID ? byID.get(item.parentID) : undefined
    }
    return chain.flatMap((entry): ContextMessage[] => {
      const question = [`Selected text:\n${entry.anchor.text}`, `Question:\n${entry.question}`].join("\n\n")
      return entry.answer ? [{ role: "user", content: question }, { role: "assistant", content: entry.answer }] : [{ role: "user", content: question }]
    })
  }

  const selectionContext = (annotation: TextSelectionAnnotation) => [...mainContext(annotation), ...pathContext(annotation)]

  const refreshRects = (items = annotations()) => {
    const currentSurfaces = surfaces()
    const rects = latestUniqueAnnotations(items).flatMap((annotation) => {
        const root = rootForAnchor(annotation.anchor.scope, currentSurfaces)
        if (!root) return []
        return createHighlightRects({
          annotationID: annotation.id,
          source: annotation.source.type,
          root,
          anchor: annotation.anchor,
        })
      })
    setStore("rects", rects)
  }

  const refreshNow = (items = annotations()) => {
    if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame)
    refreshFrame = undefined
    refreshRects(items)
  }

  const scheduleRefresh = () => {
    if (refreshFrame !== undefined) return
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = undefined
      refreshRects()
    })
  }

  const primeSelectionControls = () => {
    const model = local.model.current()
    batch(() => {
      if (!store.agent) setStore("agent", local.agent.current()?.name)
      if (!store.model && model) setStore("model", { providerID: model.provider.id, modelID: model.id })
      if (store.variant === undefined) setStore("variant", local.model.variant.selected())
      if (store.ephemeralPresetID === undefined) setStore("ephemeralPresetID", settings.ephemeralContexts.selected())
      if (store.includeContext === undefined) setStore("includeContext", false)
    })
  }

  const openPrompt = (draft: SelectionDraft) => {
    primeSelectionControls()
    batch(() => {
      setStore("draft", draft)
      setStore("contextMenu", undefined)
      setStore("prompt", "")
    })
    requestAnimationFrame(() => textarea?.focus())
    return true
  }

  const openPromptFromSelection = () => {
    const draft = draftFromSelection(surfaces())
    if (!draft) return false
    return openPrompt(draft)
  }

  const openContextMenuFromSelection = (event: MouseEvent) => {
    const draft = draftFromSelection(surfaces())
    if (!draft) return false
    const position = clampPosition({ left: event.clientX, top: event.clientY }, { width: 220, height: 48 })
    primeSelectionControls()
    batch(() => {
      setStore("draft", undefined)
      setStore("contextMenu", { draft, ...position })
    })
    return true
  }

  command.register(commandID, () => [
    {
      id: commandID,
      title: language.t("command.selection.ask"),
      description: language.t("command.selection.ask.description"),
      category: language.t("command.category.session"),
      keybind: commandKeybind,
      onSelect: openPromptFromSelection,
    },
  ])

  const closePrompt = () => {
    batch(() => {
      setStore("draft", undefined)
      setStore("prompt", "")
      setStore("submitting", false)
    })
  }

  const showAnswer = (id: string) => {
    setStore("activeAnnotationID", id)
    if (store.answerDialogOpen) return
    setStore("answerDialogOpen", true)
    dialog.show(
      () => (
        <AnswerDialog
          annotation={activeAnnotation}
          selectionAnnotations={activeSelectionAnnotations}
          path={path}
          onSelect={(annotationID) => setStore("activeAnnotationID", annotationID)}
          onSurface={(root, annotationID) => {
            setStore("surfaces", (items) => [
              ...items.filter((item) => item.id !== annotationID),
              { id: annotationID, root, source: { type: "answer", annotationID } },
            ])
            scheduleRefresh()
          }}
          onCloseSurface={(annotationID) => {
            setStore("surfaces", (items) => items.filter((item) => item.id !== annotationID))
            scheduleRefresh()
          }}
          onClose={() => setStore("answerDialogOpen", false)}
        />
      ),
      undefined,
      { modal: false },
    )
  }

  const updateAnnotation = (id: string, patch: Partial<TextSelectionAnnotation>) => {
    setPersistedStore("annotations", (items = emptyAnnotations) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const submit = async (event: Event) => {
    event.preventDefault()
    const draft = store.draft
    if (!draft || store.submitting) return

    const model = selectedModel()
    const agent = selectedAgent()
    if (!model || !agent) {
      showToast({
        title: language.t("prompt.toast.modelAgentRequired.title"),
        description: language.t("prompt.toast.modelAgentRequired.description"),
      })
      return
    }

    const question = store.prompt.trim() || language.t("selection.ask.defaultQuestion")
    const annotationID = createAnnotationID()
    const parentID = draft.source.type === "answer" ? draft.source.annotationID : undefined
    const variant = selectionModel.variant.current()
    const ephemeral = selectedEphemeralMessages()
    const pendingAnnotation: TextSelectionAnnotation = {
      id: annotationID,
      parentID,
      source: draft.source,
      anchor: draft.anchor,
      question,
      model: { providerID: model.provider.id, modelID: model.id },
      variant,
      agent: agent.name,
      ephemeralPresetID: store.ephemeralPresetID,
      includeContext: store.includeContext ?? false,
      createdAt: Date.now(),
      status: "pending",
    }
    const pendingAnnotations = [...annotations(), pendingAnnotation]
    setStore("submitting", true)
    setPersistedStore("annotations", pendingAnnotations)
    closePrompt()
    setStore("activeAnnotationID", annotationID)
    refreshNow(pendingAnnotations)

    const result: { data?: { text: string }; error?: unknown } = await sdk.client.session.selection
      .ask({
        sessionID: props.sessionID,
        directory: props.sessionDirectory,
        agent: agent.name,
        model: { providerID: model.provider.id, modelID: model.id },
        variant,
        selectedText: draft.anchor.text,
        question,
        context: store.includeContext ? selectionContext(pendingAnnotation) : undefined,
        ephemeral: ephemeral?.length ? ephemeral : undefined,
      })
      .then((response) => (response.error ? { error: response.error } : { data: response.data }))
      .catch((error: unknown) => ({ error }))

    if ("error" in result && result.error) {
      const message = formatServerError(result.error, language.t)
      updateAnnotation(annotationID, { status: "error", error: message })
      showToast({
        variant: "error",
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: message,
      })
      return
    }

    const answer = result.data?.text ?? ""
    updateAnnotation(annotationID, { status: "answered", answer })
  }

  const selectAgent = (value: string | undefined) => {
    const agent = local.agent.list().find((item) => item.name === value) ?? local.agent.current()
    if (!agent) return
    batch(() => {
      setStore("agent", agent.name)
      if (agent.model) setStore("model", agent.model)
      setStore("variant", agent.variant ?? store.variant)
    })
  }

  createEffect(() => {
    annotations().length
    store.surfaces.length
    props.root()
    scheduleRefresh()
  })

  onMount(() => {
    makeEventListener(document, "selectionchange", scheduleRefresh)
    makeEventListener(document, "contextmenu", (event) => {
      if (ignoredSelectionTarget(event.target)) return
      if (!openContextMenuFromSelection(event)) return
      event.preventDefault()
    })
    makeEventListener(window, "pointerdown", (event) => {
      if (ignoredSelectionTarget(event.target)) return
      setStore("contextMenu", undefined)
    })
    makeEventListener(window, "keydown", (event) => {
      if (event.key === "Escape") {
        setStore("contextMenu", undefined)
        closePrompt()
        return
      }
      if (!isAskSelectionKeybind(event) || ignoredSelectionTarget(event.target)) return
      if (!openPromptFromSelection()) return
      event.preventDefault()
      event.stopPropagation()
    })
    makeEventListener(window, "resize", scheduleRefresh)
    makeEventListener(window, "scroll", scheduleRefresh, { capture: true })
  })

  onCleanup(() => {
    if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame)
  })

  const renderHighlights = (source: HighlightRect["source"]) => (
    <For each={store.rects.filter((rect) => rect.source === source)}>
      {(rect) => (
        <button
          data-selection-ignore
          type="button"
          class="absolute pointer-events-auto rounded-[3px] border border-warning-base/20 bg-[rgb(from_var(--surface-warning-base)_r_g_b_/_0.32)] hover:bg-[rgb(from_var(--surface-warning-base)_r_g_b_/_0.44)] transition-colors cursor-pointer"
          style={{
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
          aria-label={language.t("selection.ask.openAnswer")}
          onClick={() => showAnswer(rect.annotationID)}
        />
      )}
    </For>
  )

  return (
    <Portal>
      <div class="fixed inset-0 pointer-events-none z-[40]">
        {renderHighlights("session")}
      </div>
      <div class="fixed inset-0 pointer-events-none z-[55]">
        {renderHighlights("answer")}
      </div>
      <div class="fixed inset-0 pointer-events-none z-[60]">
        <Show when={store.contextMenu} keyed>
          {(menu) => (
            <div
              data-selection-ignore
              class="pointer-events-auto fixed min-w-44 rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha p-1 shadow-xl"
              style={{ left: `${menu.left}px`, top: `${menu.top}px` }}
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-13-regular text-text-base hover:bg-background-base"
                onClick={() => openPrompt(menu.draft)}
              >
                <Icon name="brain" size="small" />
                <span>{language.t("selection.contextMenu.ask")}</span>
              </button>
            </div>
          )}
        </Show>
        <Show when={store.draft && promptPosition()} keyed>
          {(position) => (
            <form
              data-selection-ignore
              class="pointer-events-auto fixed w-[340px] rounded-xl border border-border-base bg-surface-raised-stronger-non-alpha shadow-xl p-2.5"
              style={{ left: `${position.left}px`, top: `${position.top}px` }}
              onSubmit={submit}
            >
              <div class="text-12-medium text-text-weak pb-1.5 line-clamp-2">{store.draft?.anchor.text}</div>
              <textarea
                ref={(el) => (textarea = el)}
                class="w-full min-h-20 resize-none rounded-lg border border-border-weak-base bg-background-base px-2.5 py-2 text-13-regular text-text-strong outline-none focus:border-border-strong"
                placeholder={language.t("selection.ask.placeholder")}
                value={store.prompt}
                onInput={(event) => setStore("prompt", event.currentTarget.value)}
              />
              <div class="pt-2 flex flex-wrap items-center gap-1.5">
                <Select
                  size="small"
                  options={agentNames()}
                  current={selectedAgent()?.name ?? ""}
                  onSelect={selectAgent}
                  class="min-w-0 max-w-[120px] text-text-base"
                  valueClass="truncate text-12-regular text-text-base"
                  variant="ghost"
                />
                <ModelSelectorPopover model={selectionModel} triggerAs={Button} triggerProps={{ variant: "ghost", size: "small", class: "min-w-0 max-w-[150px] text-12-regular text-text-base group" }}>
                  <Show when={selectedModel()?.provider?.id}>
                    <ProviderIcon id={selectedModel()?.provider?.id ?? ""} class="size-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
                  </Show>
                  <span class="truncate">{selectedModel()?.name ?? language.t("dialog.model.select.title")}</span>
                  <Icon name="chevron-down" size="small" class="shrink-0" />
                </ModelSelectorPopover>
                <Show when={variants().length > 0}>
                  <Select
                    size="small"
                    options={["default", ...variants()]}
                    current={selectionModel.variant.current() ?? "default"}
                    label={(value) => (value === "default" ? language.t("common.default") : value)}
                    onSelect={(value) => selectionModel.variant.set(value === "default" ? undefined : value)}
                    class="min-w-0 max-w-[120px] text-text-base"
                    valueClass="truncate text-12-regular text-text-base"
                    variant="ghost"
                  />
                </Show>
                <Show when={settings.ephemeralContexts.presets().length > 0}>
                  <Select
                    size="small"
                    options={ephemeralContextOptions()}
                    current={currentEphemeralContext()}
                    value={(option) => option.id}
                    label={(option) => option.name}
                    groupBy={(option) => option.category}
                    onSelect={(option) => setStore("ephemeralPresetID", option?.id || null)}
                    class="min-w-0 max-w-[150px] text-text-base"
                    valueClass="truncate text-12-regular text-text-base"
                    variant="ghost"
                  />
                </Show>
                <Select
                  size="small"
                  options={contextOptions}
                  current={currentContextOption()}
                  value={(option) => option.value}
                  label={(option) => language.t(option.labelKey)}
                  onSelect={(option) => setStore("includeContext", option?.value === "yes")}
                  class="min-w-0 max-w-[150px] text-text-base"
                  valueClass="truncate text-12-regular text-text-base"
                  variant="ghost"
                />
              </div>
              <div class="pt-2 flex items-center justify-end gap-1.5">
                <Button size="small" variant="ghost" type="button" disabled={store.submitting} onClick={closePrompt}>
                  {language.t("common.cancel")}
                </Button>
                <Button size="small" type="submit" disabled={store.submitting}>
                  {store.submitting ? language.t("selection.ask.sending") : language.t("selection.ask.submit")}
                </Button>
              </div>
            </form>
          )}
        </Show>
      </div>
    </Portal>
  )
}

function AnswerDialog(props: {
  annotation: () => TextSelectionAnnotation | undefined
  selectionAnnotations: () => TextSelectionAnnotation[]
  path: () => TextSelectionAnnotation[]
  onSelect: (annotationID: string) => void
  onSurface: (root: HTMLElement, annotationID: string) => void
  onCloseSurface: (annotationID: string) => void
  onClose: () => void
}) {
  const language = useLanguage()
  let surface: HTMLDivElement | undefined

  createEffect(() => {
    const annotation = props.annotation()
    if (!annotation || !surface) return
    props.onSurface(surface, annotation.id)
    onCleanup(() => props.onCloseSurface(annotation.id))
  })

  onCleanup(props.onClose)

  return (
    <Dialog size="large" class="h-full overflow-hidden">
      <div class="flex h-full min-h-0 flex-col gap-3">
        <div data-selection-ignore class="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-lg border border-border-weak-base bg-background-stronger px-2 py-1.5">
          <For each={props.path()}>
            {(item, index) => (
              <>
                <Show when={index() > 0}>
                  <span class="text-text-weak">/</span>
                </Show>
                <button
                  type="button"
                  class="max-w-[180px] truncate rounded-md px-2 py-1 text-12-medium text-text-base hover:bg-background-base"
                  classList={{ "bg-background-base": props.annotation()?.id === item.id }}
                  onClick={() => props.onSelect(item.id)}
                >
                  {item.anchor.text}
                </button>
              </>
            )}
          </For>
        </div>
        <Show when={props.annotation()} keyed>
          {(annotation) => (
            <>
              <div data-selection-ignore class="rounded-lg border border-border-weak-base bg-background-base px-3 py-2">
                <div class="text-12-medium text-text-weak">{language.t("selection.answer.question")}</div>
                <Show
                  when={props.selectionAnnotations().length > 1}
                  fallback={<div class="pt-1 text-13-regular text-text-strong whitespace-pre-wrap">{annotation.question}</div>}
                >
                  <Select
                    size="normal"
                    options={props.selectionAnnotations()}
                    current={annotation}
                    value={(item) => item.id}
                    label={(item) => item.question}
                    onSelect={(item) => item && props.onSelect(item.id)}
                    class="mt-1 max-w-full text-text-base"
                    valueClass="truncate text-13-regular text-text-base"
                    variant="ghost"
                  />
                </Show>
              </div>
              <div ref={(el) => (surface = el)} class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border-weak-base bg-background-base px-3 py-3">
                <Show when={annotation.status === "answered"} fallback={<AnswerFallback annotation={annotation} />}>
                  <Markdown text={annotation.answer ?? ""} class="text-13-regular" />
                </Show>
              </div>
            </>
          )}
        </Show>
      </div>
    </Dialog>
  )
}

function AnswerFallback(props: { annotation: TextSelectionAnnotation }) {
  const language = useLanguage()
  return (
    <Show
      when={props.annotation.status === "error"}
      fallback={<div class="text-13-regular text-text-weak">{language.t("selection.answer.pending")}</div>}
    >
      <div class="text-13-regular text-danger">{props.annotation.error}</div>
    </Show>
  )
}
