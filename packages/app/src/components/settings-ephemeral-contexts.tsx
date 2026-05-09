import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Select } from "@opencode-ai/ui/select"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, For, Show, type Component } from "solid-js"
import { createStore, produce } from "solid-js/store"
import {
  type EphemeralContextMessage,
  type EphemeralContextPosition,
  type EphemeralContextPreset,
  type EphemeralContextRole,
  useSettings,
} from "@/context/settings"
import { useLanguage } from "@/context/language"
import { SettingsList } from "./settings-list"
import { SettingsRow } from "./settings-row"

const roles: EphemeralContextRole[] = ["system", "user", "assistant"]
const positions: EphemeralContextPosition[] = [
  "session_top",
  "before_user",
  "after_user",
  "before_latest",
  "after_latest",
  "inside_user_top",
  "inside_user_bottom",
]
const roleLabelKey = {
  system: "settings.ephemeralContexts.role.system",
  user: "settings.ephemeralContexts.role.user",
  assistant: "settings.ephemeralContexts.role.assistant",
} as const
const positionLabelKey = {
  session_top: "settings.ephemeralContexts.position.session_top",
  before_user: "settings.ephemeralContexts.position.before_user",
  after_user: "settings.ephemeralContexts.position.after_user",
  before_latest: "settings.ephemeralContexts.position.before_latest",
  after_latest: "settings.ephemeralContexts.position.after_latest",
  inside_user_top: "settings.ephemeralContexts.position.inside_user_top",
  inside_user_bottom: "settings.ephemeralContexts.position.inside_user_bottom",
} as const

function id() {
  if (typeof crypto === "object" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyMessage(position: EphemeralContextPosition = "before_user"): EphemeralContextMessage {
  return {
    id: id(),
    title: "",
    role: "user",
    position,
    content: "",
    enabled: true,
  }
}

function emptyPreset(): EphemeralContextPreset {
  return {
    id: id(),
    name: "New context preset",
    description: "",
    category: "",
    enabled: true,
    messages: [emptyMessage()],
  }
}

function clonePreset(preset: EphemeralContextPreset): EphemeralContextPreset {
  return {
    ...preset,
    messages: preset.messages.map((message) => ({ ...message })),
  }
}

export const SettingsEphemeralContexts: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const [store, setStore] = createStore<{ editing: EphemeralContextPreset | null }>({ editing: null })

  const presets = createMemo(() => settings.ephemeralContexts.presets())
  const editing = createMemo(() => store.editing)

  const startCreate = () => setStore("editing", emptyPreset())
  const startEdit = (preset: EphemeralContextPreset) => setStore("editing", clonePreset(preset))
  const cancel = () => setStore("editing", null)
  const setEditing = (patch: Partial<EphemeralContextPreset>) => {
    if (!store.editing) return
    setStore("editing", { ...store.editing, ...patch })
  }

  const updateMessage = (messageID: string, patch: Partial<EphemeralContextMessage>) => {
    if (!store.editing) return
    setStore("editing", "messages", (message) => message.id === messageID, produce((message) => Object.assign(message, patch)))
  }

  const save = () => {
    if (!store.editing) return
    const messages = store.editing.messages.filter((message) => message.content.trim().length > 0)
    if (messages.length === 0) {
      showToast({ title: language.t("settings.ephemeralContexts.toast.empty") })
      return
    }
    const next = {
      ...store.editing,
      name: store.editing.name.trim() || "Untitled preset",
      messages,
    }
    settings.ephemeralContexts.upsert(next)
    setStore("editing", null)
    showToast({ variant: "success", icon: "circle-check", title: language.t("settings.ephemeralContexts.toast.saved") })
  }

  const addMessage = () => {
    if (!store.editing) return
    setStore("editing", "messages", (messages) => [...messages, emptyMessage()])
  }

  const removeMessage = (messageID: string) => {
    if (!store.editing) return
    setStore("editing", "messages", (messages) =>
      messages.length <= 1 ? messages : messages.filter((candidate) => candidate.id !== messageID),
    )
  }

  const moveMessage = (messageID: string, offset: -1 | 1) => {
    if (!store.editing) return
    setStore("editing", "messages", (messages) => {
      const index = messages.findIndex((message) => message.id === messageID)
      const target = index + offset
      if (index < 0 || target < 0 || target >= messages.length) return messages
      const next = messages.slice()
      next[index] = messages[target]
      next[target] = messages[index]
      return next
    })
  }

  const remove = (preset: EphemeralContextPreset) => {
    settings.ephemeralContexts.remove(preset.id)
    if (store.editing?.id === preset.id) cancel()
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.ephemeralContexts.title")}</h2>
          <p class="max-w-2xl text-12-regular text-text-weak">
            {language.t("settings.ephemeralContexts.description")}
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-8 w-full">
        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.ephemeralContexts.section.presets")}</h3>
          <SettingsList>
            <SettingsRow
              title={language.t("settings.ephemeralContexts.row.active.title")}
              description={language.t("settings.ephemeralContexts.row.active.description")}
            >
              <div class="flex flex-wrap justify-end gap-2">
                <Button size="small" variant="secondary" onClick={startCreate}>
                  {language.t("settings.ephemeralContexts.action.add")}
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  disabled={!settings.ephemeralContexts.selected()}
                  onClick={() => settings.ephemeralContexts.setSelected(null)}
                >
                  {language.t("settings.ephemeralContexts.action.disable")}
                </Button>
              </div>
            </SettingsRow>

            <Show when={presets().length > 0} fallback={<EmptyPresetRow />}>
              <For each={presets()}>
                {(preset) => (
                  <div class="flex flex-wrap items-center gap-4 py-3 border-b border-border-weak-base last:border-none sm:flex-nowrap">
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => settings.ephemeralContexts.setSelected(preset.id)}
                    >
                      <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-raised-base shadow-xs-border-base">
                        <Icon name="bullet-list" size="small" />
                      </span>
                      <span class="flex min-w-0 flex-col gap-0.5">
                        <span class="truncate text-14-medium text-text-strong">{preset.name}</span>
                        <span class="truncate text-12-regular text-text-weak">
                          {preset.description || language.t("settings.ephemeralContexts.preset.messages", { count: preset.messages.length })}
                        </span>
                      </span>
                    </button>
                    <div class="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                      <Show when={settings.ephemeralContexts.selected() === preset.id}>
                        <span class="inline-flex items-center gap-1 text-12-medium text-text-base">
                          <Icon name="check-small" size="small" />
                          {language.t("settings.ephemeralContexts.status.active")}
                        </span>
                      </Show>
                      <Button size="small" variant="secondary" onClick={() => startEdit(preset)}>
                        {language.t("common.edit")}
                      </Button>
                      <Button size="small" variant="ghost" onClick={() => remove(preset)}>
                        {language.t("common.delete")}
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </SettingsList>
        </div>

        <Show when={editing()}>
          {(preset) => (
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.ephemeralContexts.section.editor")}</h3>
                <div class="flex gap-2">
                  <Button size="small" variant="secondary" onClick={save}>
                    {language.t("common.save")}
                  </Button>
                  <Button size="small" variant="ghost" onClick={cancel}>
                    {language.t("common.close")}
                  </Button>
                </div>
              </div>

              <div class="rounded-xl border border-border-weak-base bg-surface-base p-3">
                <div class="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label={language.t("settings.ephemeralContexts.editor.name")}
                    value={preset().name}
                    onChange={(value) => setEditing({ name: value })}
                  />
                  <TextField
                    label={language.t("settings.ephemeralContexts.editor.group")}
                    value={preset().category}
                    onChange={(value) => setEditing({ category: value })}
                  />
                </div>
                <div class="mt-3">
                  <TextField
                    label={language.t("settings.ephemeralContexts.editor.description")}
                    value={preset().description}
                    onChange={(value) => setEditing({ description: value })}
                  />
                </div>

                <div class="mt-5 flex flex-col gap-3">
                  <div class="flex items-center justify-between gap-3">
                    <h4 class="text-13-medium text-text-strong">{language.t("settings.ephemeralContexts.editor.messages")}</h4>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={addMessage}
                    >
                      {language.t("settings.ephemeralContexts.action.addMessage")}
                    </Button>
                  </div>

                  <For each={preset().messages}>
                    {(message, index) => (
                      <div class="rounded-lg border border-border-weak-base bg-surface-raised-base p-3">
                        <div class="grid gap-3 sm:grid-cols-[1fr_120px_170px_auto]">
                          <TextField
                            label={language.t("settings.ephemeralContexts.message.title")}
                            value={message.title}
                            onChange={(value) => updateMessage(message.id, { title: value })}
                          />
                          <label class="flex flex-col gap-1 text-12-regular text-text-weak">
                            <span>{language.t("settings.ephemeralContexts.message.role")}</span>
                            <Select<EphemeralContextRole>
                              size="normal"
                              options={roles}
                              current={message.role}
                              label={(value) => language.t(roleLabelKey[value])}
                              onSelect={(value) => value && updateMessage(message.id, { role: value })}
                              triggerVariant="settings"
                              variant="secondary"
                            />
                          </label>
                          <label class="flex flex-col gap-1 text-12-regular text-text-weak">
                            <span>{language.t("settings.ephemeralContexts.message.position")}</span>
                            <Select<EphemeralContextPosition>
                              size="normal"
                              options={positions}
                              current={message.position}
                              label={(value) => language.t(positionLabelKey[value])}
                              onSelect={(value) => value && updateMessage(message.id, { position: value })}
                              triggerVariant="settings"
                              variant="secondary"
                            />
                          </label>
                          <Button
                            size="small"
                            variant="ghost"
                            class="self-end"
                            onClick={() => removeMessage(message.id)}
                          >
                            {language.t("common.delete")}
                          </Button>
                        </div>
                        <div class="mt-3 flex flex-wrap justify-end gap-2">
                          <Button
                            size="small"
                            variant="ghost"
                            disabled={index() === 0}
                            onClick={() => moveMessage(message.id, -1)}
                          >
                            {language.t("settings.ephemeralContexts.action.moveUp")}
                          </Button>
                          <Button
                            size="small"
                            variant="ghost"
                            disabled={index() >= preset().messages.length - 1}
                            onClick={() => moveMessage(message.id, 1)}
                          >
                            {language.t("settings.ephemeralContexts.action.moveDown")}
                          </Button>
                        </div>
                        <div class="mt-3">
                          <TextField
                            multiline
                            label={language.t("settings.ephemeralContexts.message.content")}
                            value={message.content}
                            onChange={(value) => updateMessage(message.id, { content: value })}
                          />
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}

const EmptyPresetRow: Component = () => {
  const language = useLanguage()
  return (
    <div class="py-5 text-center text-12-regular text-text-weak">
      {language.t("settings.ephemeralContexts.empty")}
    </div>
  )
}
