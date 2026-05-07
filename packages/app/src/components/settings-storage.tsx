import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { Component, Show, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useGlobalSDK } from "@/context/global-sdk"
import { SettingsList } from "./settings-list"

export const SettingsStorage: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const globalSdk = useGlobalSDK()
  const text = (key: string) => language.t(key as Parameters<typeof language.t>[0])
  const [store, setStore] = createStore({ saving: false })

  const [paths, { refetch: refetchPaths }] = createResource(() =>
    globalSdk.client.path
      .get()
      .then((res) => res.data)
      .catch(() => undefined),
  )

  const [configured, { refetch: refetchConfigured }] = createResource(() =>
    platform.getDataDirectory?.().catch(() => ({ path: null })) ?? Promise.resolve({ path: null }),
  )

  const canManage = createMemo(() => platform.platform === "desktop" && !!platform.moveDataDirectory)
  const activeCustom = createMemo(() => Boolean(configured.latest?.path))

  const copy = (value: string | undefined) => {
    if (!value) return
    void navigator.clipboard.writeText(value).then(() => {
      showToast({ variant: "success", icon: "copy", title: text("settings.storage.toast.copied.title") })
    })
  }

  const choose = async (copyData: boolean) => {
    if (!platform.openDirectoryPickerDialog || !platform.moveDataDirectory) return
    const result = await platform.openDirectoryPickerDialog({ title: text("settings.storage.picker.title") })
    if (!result || Array.isArray(result)) return

    setStore("saving", true)
    try {
      if (!paths.latest) await refetchPaths()
      await platform.moveDataDirectory({ path: result, copy: copyData })
      await Promise.all([refetchConfigured(), refetchPaths()])
      showToast({
        variant: "success",
        icon: "circle-check",
        title: text("settings.storage.toast.saved.title"),
        description: text("settings.storage.toast.saved.description"),
        persistent: true,
        actions: [{ label: text("settings.storage.action.restart"), onClick: () => void platform.restart() }],
      })
    } catch (error) {
      showToast({
        variant: "error",
        icon: "warning",
        title: text("settings.storage.toast.failed.title"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setStore("saving", false)
    }
  }

  const reset = async () => {
    if (!platform.moveDataDirectory) return
    setStore("saving", true)
    try {
      if (!paths.latest) await refetchPaths()
      await platform.moveDataDirectory({ path: null, copy: false })
      await Promise.all([refetchConfigured(), refetchPaths()])
      showToast({
        variant: "success",
        icon: "circle-check",
        title: text("settings.storage.toast.reset.title"),
        description: text("settings.storage.toast.saved.description"),
        persistent: true,
        actions: [{ label: text("settings.storage.action.restart"), onClick: () => void platform.restart() }],
      })
    } catch (error) {
      showToast({
        variant: "error",
        icon: "warning",
        title: text("settings.storage.toast.failed.title"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <div class="flex h-full flex-col overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8">
          <h2 class="text-16-medium text-text-strong">{text("settings.storage.title")}</h2>
          <p class="max-w-2xl text-12-regular text-text-weak">{text("settings.storage.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-8 w-full">
        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{text("settings.storage.section.current")}</h3>
          <SettingsList>
            <StorageRow
              title={text("settings.storage.row.active.title")}
              description={text("settings.storage.row.active.description")}
              value={paths.latest?.data ?? language.t("common.unknown")}
              onCopy={() => copy(paths.latest?.data)}
            />
            <StorageRow
              title={text("settings.storage.row.database.title")}
              description={text("settings.storage.row.database.description")}
              value={paths.latest?.database ?? language.t("common.unknown")}
              onCopy={() => copy(paths.latest?.database)}
            />
            <StorageRow
              title={text("settings.storage.row.default.title")}
              description={text("settings.storage.row.default.description")}
              value={paths.latest?.defaultData ?? language.t("common.unknown")}
              onCopy={() => copy(paths.latest?.defaultData)}
            />
          </SettingsList>
        </div>

        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{text("settings.storage.section.move")}</h3>
          <SettingsList>
            <div class="flex flex-wrap items-center gap-4 py-3 border-b border-border-weak-base last:border-none sm:flex-nowrap">
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-14-medium text-text-strong">{text("settings.storage.row.custom.title")}</span>
                <span class="text-12-regular text-text-weak">{text("settings.storage.row.custom.description")}</span>
                <Show when={configured.latest?.path}>
                  {(value) => <code class="pt-1 text-11-regular text-text-weak break-all">{value()}</code>}
                </Show>
              </div>
              <div class="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:shrink-0">
                <Button size="small" variant="secondary" disabled={!canManage() || store.saving} onClick={() => choose(false)}>
                  {text("settings.storage.action.choose")}
                </Button>
                <Button size="small" variant="secondary" disabled={!canManage() || store.saving} onClick={() => choose(true)}>
                  {text("settings.storage.action.chooseCopy")}
                </Button>
                <Button size="small" variant="ghost" disabled={!canManage() || store.saving || !activeCustom()} onClick={reset}>
                  {language.t("common.reset")}
                </Button>
              </div>
            </div>
          </SettingsList>
          <Show when={!canManage()}>
            <p class="pt-2 text-12-regular text-text-weak">{text("settings.storage.webHint")}</p>
          </Show>
        </div>
      </div>
    </div>
  )
}

const StorageRow: Component<{
  title: string
  description: string
  value: string
  onCopy: () => void
}> = (props) => {
  const language = useLanguage()
  const text = (key: string) => language.t(key as Parameters<typeof language.t>[0])
  return (
    <div class="flex flex-wrap items-center gap-4 py-3 border-b border-border-weak-base last:border-none sm:flex-nowrap">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-14-medium text-text-strong">{props.title}</span>
        <span class="text-12-regular text-text-weak">{props.description}</span>
        <code class="pt-1 text-11-regular text-text-weak break-all">{props.value}</code>
      </div>
      <div class="flex w-full justify-end sm:w-auto sm:shrink-0">
        <Button size="small" variant="secondary" onClick={props.onCopy}>
          {text("settings.storage.action.copy")}
        </Button>
      </div>
    </div>
  )
}
