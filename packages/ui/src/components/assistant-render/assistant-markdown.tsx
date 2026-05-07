import { ComponentProps, Show, createEffect, createSignal, onCleanup, splitProps } from "solid-js"
import { isServer } from "solid-js/web"
import { Markdown } from "../markdown"
import { createDefaultAssistantRenderEngine } from "./engine"

type AssistantRendererWindow = Window & {
  __OPENCODE_ASSISTANT_RENDERER__?: "fast-window"
}

const assistantRendererEnabled = () =>
  !isServer && (window as AssistantRendererWindow).__OPENCODE_ASSISTANT_RENDERER__ === "fast-window"

const engine = createDefaultAssistantRenderEngine({
  clipboard: {
    writeText: (text) => navigator.clipboard?.writeText(text),
  },
  ui: {},
  files: { images: {} },
})

export function AssistantMarkdown(
  props: ComponentProps<"div"> & {
    text: string
    cacheKey?: string
    streaming?: boolean
    class?: string
    classList?: Record<string, boolean>
  },
) {
  const [local, others] = splitProps(props, ["text", "cacheKey", "streaming", "class", "classList"])
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [failed, setFailed] = createSignal(false)

  createEffect(() => {
    const container = root()
    if (!container || !assistantRendererEnabled()) return
    try {
      setFailed(false)
      engine.renderAssistantInto(container, local.text, { renderSafetyPolicy: "original" })
    } catch (error) {
      console.error("Failed to render assistant content", error)
      setFailed(true)
    }
  })

  onCleanup(() => {
    const container = root()
    if (container) container.innerHTML = ""
  })

  return (
    <Show
      when={assistantRendererEnabled() && !failed()}
      fallback={<Markdown text={local.text} cacheKey={local.cacheKey} streaming={local.streaming} class={local.class} classList={local.classList} />}
    >
      <div
        data-component="assistant-render"
        classList={{
          ...local.classList,
          [local.class ?? ""]: !!local.class,
        }}
        ref={setRoot}
        {...others}
      />
    </Show>
  )
}
