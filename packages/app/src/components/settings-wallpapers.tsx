import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, For, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings, type WallpaperSettingsItem } from "@/context/settings"
import { SettingsList } from "./settings-list"
import { SettingsRow } from "./settings-row"

const imageExtensions = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg"]

function fileName(path: string) {
  return path.split(/[\\/]/).at(-1) || path
}

function id() {
  if (typeof crypto === "object" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const SettingsWallpapers: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const [store, setStore] = createStore({
    editing: null as string | null,
    preview: null as WallpaperSettingsItem | null,
    dragging: false,
    dragX: 0,
    dragY: 0,
  })

  const desktop = createMemo(() => platform.platform === "desktop" && platform.openFilePickerDialog && platform.readImageFile)
  const items = createMemo(() => settings.wallpapers.items())
  const current = createMemo(() => store.preview)

  const setPreview = (patch: Partial<WallpaperSettingsItem>) => {
    if (!current()) return
    setStore("preview", { ...current()!, ...patch } as WallpaperSettingsItem)
  }

  const choose = async () => {
    const result = await platform.openFilePickerDialog?.({
      title: language.t("settings.wallpapers.picker.title"),
      extensions: imageExtensions,
      accept: imageExtensions.map((extension) => `image/${extension}`),
    })
    if (!result || Array.isArray(result)) return

    const dataUrl = await platform.readImageFile?.(result)
    if (!dataUrl) {
      showToast({ title: language.t("settings.wallpapers.toast.failed.title") })
      return
    }

    const next = {
      id: id(),
      name: fileName(result),
      path: result,
      dataUrl,
      x: 0,
      y: 0,
      scale: 1,
      fit: "contain",
      opacity: 1,
      blur: 0,
    } satisfies WallpaperSettingsItem

    setStore({ editing: next.id, preview: next, dragging: false, dragX: 0, dragY: 0 })
  }

  const edit = (item: WallpaperSettingsItem) => {
    setStore({ editing: item.id, preview: item, dragging: false, dragX: 0, dragY: 0 })
    settings.wallpapers.setActive(item.id)
  }

  const save = () => {
    if (!store.preview) return
    settings.wallpapers.upsert(store.preview)
    setStore({ editing: null, preview: null, dragging: false, dragX: 0, dragY: 0 })
    showToast({ variant: "success", icon: "circle-check", title: language.t("settings.wallpapers.toast.saved.title") })
  }

  const cancel = () => setStore({ editing: null, preview: null, dragging: false, dragX: 0, dragY: 0 })

  const remove = (item: WallpaperSettingsItem) => {
    settings.wallpapers.remove(item.id)
    if (store.editing !== item.id) return
    cancel()
  }

  const pointerDown = (event: PointerEvent) => {
    if (!current()) return
    if (!(event.currentTarget instanceof HTMLElement)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setStore({ dragging: true, dragX: event.clientX, dragY: event.clientY })
  }

  const pointerMove = (event: PointerEvent) => {
    if (!store.dragging || !current()) return
    setPreview({ x: current()!.x + event.clientX - store.dragX, y: current()!.y + event.clientY - store.dragY })
    setStore({ dragX: event.clientX, dragY: event.clientY })
  }

  const pointerUp = (event: PointerEvent) => {
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.releasePointerCapture(event.pointerId)
    setStore("dragging", false)
  }

  const zoom = (event: WheelEvent) => {
    if (!current()) return
    event.preventDefault()
    setPreview({ scale: Math.max(0.2, Math.min(5, current()!.scale + (event.deltaY > 0 ? -0.08 : 0.08))) })
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.wallpapers.title")}</h2>
          <p class="max-w-2xl text-12-regular text-text-weak">{language.t("settings.wallpapers.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-8 w-full">
        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.wallpapers.section.library")}</h3>
          <SettingsList>
            <SettingsRow
              title={language.t("settings.wallpapers.row.active.title")}
              description={language.t("settings.wallpapers.row.active.description")}
            >
              <div class="flex flex-wrap justify-end gap-2">
                <Button size="small" variant="secondary" disabled={!desktop()} onClick={choose}>
                  {language.t("settings.wallpapers.action.add")}
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  disabled={!settings.wallpapers.active()}
                  onClick={() => settings.wallpapers.setActive(null)}
                >
                  {language.t("settings.wallpapers.action.disable")}
                </Button>
              </div>
            </SettingsRow>

            <Show when={items().length > 0} fallback={<EmptyWallpaperRow />}>
              <For each={items()}>
                {(item) => (
                  <div class="flex flex-wrap items-center gap-4 py-3 border-b border-border-weak-base last:border-none sm:flex-nowrap">
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => settings.wallpapers.setActive(item.id)}
                    >
                      <span class="size-14 shrink-0 overflow-hidden rounded-md bg-surface-raised-base shadow-xs-border-base">
                        <img src={item.dataUrl} alt="" class="size-full object-cover" />
                      </span>
                      <span class="flex min-w-0 flex-col gap-0.5">
                        <span class="truncate text-14-medium text-text-strong">{item.name}</span>
                        <span class="truncate text-12-regular text-text-weak">{item.path}</span>
                      </span>
                    </button>
                    <div class="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                      <Show when={settings.wallpapers.active() === item.id}>
                        <span class="inline-flex items-center gap-1 text-12-medium text-text-base">
                          <Icon name="check-small" size="small" />
                          {language.t("settings.wallpapers.status.active")}
                        </span>
                      </Show>
                      <Button size="small" variant="secondary" onClick={() => edit(item)}>
                        {language.t("common.edit")}
                      </Button>
                      <Button size="small" variant="ghost" onClick={() => remove(item)}>
                        {language.t("common.delete")}
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </SettingsList>
          <Show when={!desktop()}>
            <p class="pt-2 text-12-regular text-text-weak">{language.t("settings.wallpapers.desktopOnly")}</p>
          </Show>
        </div>

        <Show when={current()}>
          {(item) => (
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.wallpapers.section.editor")}</h3>
                <div class="flex gap-2">
                  <Button size="small" variant="secondary" onClick={save}>
                    {language.t("settings.wallpapers.action.save")}
                  </Button>
                  <Button size="small" variant="ghost" onClick={cancel}>
                    {language.t("common.close")}
                  </Button>
                </div>
              </div>

              <div class="overflow-hidden rounded-xl border border-border-weak-base bg-surface-base p-3">
                <div
                  class="relative h-[360px] cursor-grab overflow-hidden rounded-lg bg-white active:cursor-grabbing"
                  role="application"
                  aria-label={language.t("settings.wallpapers.editor.ariaLabel")}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onWheel={zoom}
                >
                  <img
                    src={item().dataUrl}
                    alt={item().name}
                    draggable={false}
                    class="absolute left-1/2 top-1/2 max-h-full max-w-full select-none"
                    style={{
                      transform: `translate(calc(-50% + ${item().x}px), calc(-50% + ${item().y}px)) scale(${item().scale})`,
                      opacity: item().opacity,
                      filter: `blur(${item().blur}px)`,
                    }}
                  />
                  <div class="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" />
                </div>

                <div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-12-regular text-text-weak">
                  <span>{language.t("settings.wallpapers.editor.hint")}</span>
                  <div class="flex items-center gap-3">
                    <span>{Math.round(item().scale * 100)}%</span>
                    <Button size="small" variant="ghost" onClick={() => setPreview({ x: 0, y: 0, scale: 1 })}>
                      {language.t("common.reset")}
                    </Button>
                  </div>
                </div>

                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <label class="flex flex-col gap-1 text-12-regular text-text-weak">
                    <span class="flex items-center justify-between gap-3">
                      <span>{language.t("settings.wallpapers.editor.opacity")}</span>
                      <span>{Math.round(item().opacity * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={item().opacity}
                      onInput={(event) => setPreview({ opacity: Number(event.currentTarget.value) })}
                      class="w-full accent-[color:var(--text-interactive-base)]"
                    />
                  </label>
                  <label class="flex flex-col gap-1 text-12-regular text-text-weak">
                    <span class="flex items-center justify-between gap-3">
                      <span>{language.t("settings.wallpapers.editor.blur")}</span>
                      <span>{item().blur}px</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      step="1"
                      value={item().blur}
                      onInput={(event) => setPreview({ blur: Number(event.currentTarget.value) })}
                      class="w-full accent-[color:var(--text-interactive-base)]"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}

const EmptyWallpaperRow: Component = () => {
  const language = useLanguage()
  return (
    <div class="flex items-center gap-3 py-4 text-12-regular text-text-weak">
      <Icon name="photo" />
      <span>{language.t("settings.wallpapers.empty")}</span>
    </div>
  )
}
