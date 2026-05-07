import type { Session } from "@opencode-ai/sdk/v2/client"
import { Avatar } from "@opencode-ai/ui/avatar"
import { Button } from "@opencode-ai/ui/button"
import { ContextMenu } from "@opencode-ai/ui/context-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { getFilename } from "@opencode-ai/core/util/path"
import { A, useNavigate, useParams } from "@solidjs/router"
import { type Accessor, createMemo, For, type JSX, Match, Show, Switch } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { dropSessionCaches } from "@/context/global-sync/session-cache"
import { clearSessionPrefetch } from "@/context/global-sync/session-prefetch"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { getAvatarColors, type LocalProject, useLayout } from "@/context/layout"
import { useNotification } from "@/context/notification"
import { usePermission } from "@/context/permission"
import { messageAgentColor } from "@/utils/agent"
import { sessionTitle } from "@/utils/session-title"
import { sessionPermissionRequest } from "../session/composer/session-request-tree"
import { childSessionOnPath, errorMessage, hasProjectPermissions } from "./helpers"

const OPENCODE_PROJECT_ID = "4b0ea68d7af9a6031a7ffda7ad66e0cb83315750"

export function getProjectAvatarSource(id?: string, icon?: { color?: string; url?: string; override?: string }) {
  if (id === OPENCODE_PROJECT_ID) return "https://opencode.ai/favicon.svg"
  if (icon?.override) return icon?.override
  if (icon?.color) return undefined
  return icon?.url
}

export const ProjectIcon = (props: {
  project: LocalProject
  class?: string
  notify?: boolean
  selected?: boolean
}): JSX.Element => {
  const globalSync = useGlobalSync()
  const notification = useNotification()
  const permission = usePermission()
  const dirs = createMemo(() => [props.project.worktree, ...(props.project.sandboxes ?? [])])
  const unseenCount = createMemo(() =>
    dirs().reduce((total, directory) => total + notification.project.unseenCount(directory), 0),
  )
  const hasError = createMemo(() => dirs().some((directory) => notification.project.unseenHasError(directory)))
  const hasPermissions = createMemo(() =>
    dirs().some((directory) => {
      const [store] = globalSync.child(directory, { bootstrap: false })
      return hasProjectPermissions(store.permission, (item) => !permission.autoResponds(item, directory))
    }),
  )
  const notify = createMemo(() => props.notify && (hasPermissions() || unseenCount() > 0))
  const name = createMemo(() => props.project.name || getFilename(props.project.worktree))

  return (
    <div
      class={`relative size-8 shrink-0 rounded ${props.class ?? ""}`}
      classList={{ "outline outline-2 outline-[#000] outline-offset-1": props.selected }}
    >
      <div class="size-full rounded overflow-clip">
        <Avatar
          fallback={name()}
          src={getProjectAvatarSource(props.project.id, props.project.icon)}
          {...getAvatarColors(props.project.icon?.color)}
          class="size-full rounded"
          classList={{ "badge-mask": notify() }}
        />
      </div>
      <Show when={notify()}>
        <div
          classList={{
            "absolute top-px right-px size-1.5 rounded-full z-10": true,
            "bg-surface-warning-strong": hasPermissions(),
            "bg-icon-critical-base": !hasPermissions() && hasError(),
            "bg-text-interactive-base": !hasPermissions() && !hasError(),
          }}
        />
      </Show>
    </div>
  )
}

export type SessionItemProps = {
  session: Session
  list: Session[]
  navList?: Accessor<Session[]>
  slug: string
  mobile?: boolean
  dense?: boolean
  showTooltip?: boolean
  showChild?: boolean
  level?: number
  sidebarExpanded: Accessor<boolean>
  sidebarHovering: Accessor<boolean>
  clearHoverProjectSoon: () => void
  prefetchSession: (session: Session, priority?: "high" | "low") => void
  archiveSession: (session: Session) => Promise<void>
}

const writeText = async (value: string) => {
  const body = typeof document === "undefined" ? undefined : document.body
  if (body) {
    const textarea = document.createElement("textarea")
    textarea.value = value
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    textarea.style.pointerEvents = "none"
    body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand("copy")
    body.removeChild(textarea)
    if (copied) return true
  }

  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard
  if (!clipboard?.writeText) return false
  return clipboard.writeText(value).then(
    () => true,
    () => false,
  )
}

const RenameSessionDialog = (props: {
  session: Session
  renameSession: (title: string) => Promise<boolean>
}): JSX.Element => {
  const dialog = useDialog()
  const language = useLanguage()
  const [state, setState] = createStore({
    value: sessionTitle(props.session.title) ?? props.session.title,
    saving: false,
  })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    if (state.saving) return
    setState("saving", true)
    void props.renameSession(state.value).then((ok) => {
      if (ok) {
        dialog.close()
        return
      }
      setState("saving", false)
    })
  }

  return (
    <Dialog title={language.t("common.rename")} fit>
      <form class="flex flex-col gap-4 pl-6 pr-2.5 pb-3" onSubmit={submit}>
        <TextField
          autofocus
          type="text"
          label={language.t("common.rename")}
          value={state.value}
          onChange={(value) => setState("value", value)}
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" type="button" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="primary" size="large" type="submit" disabled={state.saving}>
            {language.t("common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

const DeleteSessionDialog = (props: {
  session: Session
  deleteSession: () => Promise<boolean>
}): JSX.Element => {
  const dialog = useDialog()
  const language = useLanguage()
  const [state, setState] = createStore({ deleting: false })
  const name = createMemo(() => sessionTitle(props.session.title) ?? language.t("command.session.new"))

  const handleDelete = () => {
    if (state.deleting) return
    setState("deleting", true)
    void props.deleteSession().then((ok) => {
      if (ok) {
        dialog.close()
        return
      }
      setState("deleting", false)
    })
  }

  return (
    <Dialog title={language.t("session.delete.title")} fit>
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
        <span class="text-14-regular text-text-strong">
          {language.t("session.delete.confirm", { name: name() })}
        </span>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="primary" size="large" onClick={handleDelete} disabled={state.deleting}>
            {language.t("session.delete.button")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

const SessionRow = (props: {
  session: Session
  slug: string
  mobile?: boolean
  dense?: boolean
  tint: Accessor<string | undefined>
  isWorking: Accessor<boolean>
  hasPermissions: Accessor<boolean>
  hasError: Accessor<boolean>
  unseenCount: Accessor<number>
  clearHoverProjectSoon: () => void
  sidebarOpened: Accessor<boolean>
  warmPress: () => void
  warmFocus: () => void
}): JSX.Element => {
  const title = () => sessionTitle(props.session.title)

  return (
    <A
      href={`/${props.slug}/session/${props.session.id}`}
      class={`flex items-center gap-2 min-w-0 w-full text-left focus:outline-none ${props.dense ? "py-0.5" : "py-1"}`}
      onPointerDown={props.warmPress}
      onFocus={props.warmFocus}
      onClick={() => {
        if (props.sidebarOpened()) return
        props.clearHoverProjectSoon()
      }}
    >
      <Show when={props.isWorking() || props.hasPermissions() || props.hasError() || props.unseenCount() > 0}>
        <div
          class="shrink-0 size-6 flex items-center justify-center"
          style={{ color: props.tint() ?? "var(--icon-interactive-base)" }}
        >
          <Switch>
            <Match when={props.isWorking()}>
              <Spinner class="size-[15px]" />
            </Match>
            <Match when={props.hasPermissions()}>
              <div class="size-1.5 rounded-full bg-surface-warning-strong" />
            </Match>
            <Match when={props.hasError()}>
              <div class="size-1.5 rounded-full bg-text-diff-delete-base" />
            </Match>
            <Match when={props.unseenCount() > 0}>
              <div class="size-1.5 rounded-full bg-text-interactive-base" />
            </Match>
          </Switch>
        </div>
      </Show>
      <span class="text-14-regular text-text-strong min-w-0 flex-1 truncate">{title()}</span>
    </A>
  )
}

export const SessionItem = (props: SessionItemProps): JSX.Element => {
  const params = useParams()
  const navigate = useNavigate()
  const dialog = useDialog()
  const layout = useLayout()
  const language = useLanguage()
  const notification = useNotification()
  const permission = usePermission()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const shareEnabled = createMemo(() => globalSync.data.config.share !== "disabled")
  const unseenCount = createMemo(() => notification.session.unseenCount(props.session.id))
  const hasError = createMemo(() => notification.session.unseenHasError(props.session.id))
  const [sessionStore, setSessionStore] = globalSync.child(props.session.directory)
  const hasPermissions = createMemo(() => {
    return !!sessionPermissionRequest(sessionStore.session, sessionStore.permission, props.session.id, (item) => {
      return !permission.autoResponds(item, props.session.directory)
    })
  })
  const isWorking = createMemo(() => {
    if (hasPermissions()) return false
    const pending = (sessionStore.message[props.session.id] ?? []).findLast(
      (message) =>
        message.role === "assistant" &&
        typeof (message as { time?: { completed?: unknown } }).time?.completed !== "number",
    )
    const status = sessionStore.session_status[props.session.id]
    return (
      pending !== undefined ||
      status?.type === "busy" ||
      status?.type === "retry" ||
      (status !== undefined && status.type !== "idle")
    )
  })

  const tint = createMemo(() => messageAgentColor(sessionStore.message[props.session.id], sessionStore.agent))
  const tooltip = createMemo(() => props.showTooltip ?? (props.mobile || !props.sidebarExpanded()))
  const currentChild = createMemo(() => {
    if (!props.showChild) return
    return childSessionOnPath(sessionStore.session, props.session.id, params.id)
  })
  const session = createMemo(() => sessionStore.session.find((item) => item.id === props.session.id) ?? props.session)
  const visibleRoots = () => props.list.filter((item) => !item.parentID && !item.time?.archived)
  const navigateAfterRemoval = (nextSessionID?: string) => {
    if (params.id !== props.session.id) return
    if (nextSessionID) {
      navigate(`/${props.slug}/session/${nextSessionID}`)
      return
    }
    navigate(`/${props.slug}/session`)
  }

  const renameSession = async (title: string) => {
    const next = title.trim()
    if (!next || next === session().title) return true

    return globalSDK.client.session
      .update({ directory: props.session.directory, sessionID: props.session.id, title: next })
      .then((x) => {
        if (!x.data) return false
        setSessionStore(
          produce((draft) => {
            const current = draft.session.find((item) => item.id === props.session.id)
            if (current) current.title = x.data.title
          }),
        )
        return true
      })
      .catch((err) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return false
      })
  }

  const copyShare = async (url: string, existing: boolean) => {
    if (!(await writeText(url))) {
      showToast({ title: language.t("toast.session.share.copyFailed.title"), variant: "error" })
      return
    }

    showToast({
      title: existing ? language.t("session.share.copy.copied") : language.t("toast.session.share.success.title"),
      description: language.t("toast.session.share.success.description"),
      variant: "success",
    })
  }

  const shareSession = async () => {
    if (!shareEnabled()) return

    const existing = session().share?.url
    if (existing) {
      await copyShare(existing, true)
      return
    }

    const url = await globalSDK.client.session
      .share({ directory: props.session.directory, sessionID: props.session.id })
      .then((x) => {
        if (!x.data) return
        setSessionStore(
          produce((draft) => {
            const current = draft.session.find((item) => item.id === props.session.id)
            if (current) current.share = x.data.share
          }),
        )
        return x.data.share?.url
      })
      .catch(() => undefined)
    if (!url) {
      showToast({
        title: language.t("toast.session.share.failed.title"),
        description: language.t("toast.session.share.failed.description"),
        variant: "error",
      })
      return
    }

    await copyShare(url, false)
  }

  const archiveSession = async () => {
    const roots = visibleRoots()
    const index = roots.findIndex((item) => item.id === props.session.id)
    const nextSession = index === -1 ? undefined : (roots[index + 1] ?? roots[index - 1])
    await props.archiveSession(props.session)
    navigateAfterRemoval(nextSession?.id)
  }

  const deleteSession = async () => {
    const roots = visibleRoots()
    const index = roots.findIndex((item) => item.id === props.session.id)
    const nextSession = index === -1 ? undefined : (roots[index + 1] ?? roots[index - 1])

    return globalSDK.client.session
      .delete({ directory: props.session.directory, sessionID: props.session.id })
      .then((x) => {
        if (!x.data) return false
        setSessionStore(
          produce((draft) => {
            const removed = new Set<string>([props.session.id])
            const byParent = new Map<string, string[]>()
            draft.session.forEach((item) => {
              if (!item.parentID) return
              byParent.set(item.parentID, [...(byParent.get(item.parentID) ?? []), item.id])
            })
            const stack = [props.session.id]
            while (stack.length) {
              const id = stack.pop()
              if (!id) continue
              for (const child of byParent.get(id) ?? []) {
                if (removed.has(child)) continue
                removed.add(child)
                stack.push(child)
              }
            }
            draft.session = draft.session.filter((item) => !removed.has(item.id))
            dropSessionCaches(draft, removed)
            clearSessionPrefetch(props.session.directory, removed)
          }),
        )
        navigateAfterRemoval(nextSession?.id)
        return true
      })
      .catch((err) => {
        showToast({
          title: language.t("session.delete.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return false
      })
  }

  const warm = (span: number, priority: "high" | "low") => {
    const nav = props.navList?.()
    const list = nav?.some((item) => item.id === props.session.id && item.directory === props.session.directory)
      ? nav
      : props.list

    props.prefetchSession(props.session, priority)

    const idx = list.findIndex((item) => item.id === props.session.id && item.directory === props.session.directory)
    if (idx === -1) return

    for (let step = 1; step <= span; step++) {
      const next = list[idx + step]
      if (next) props.prefetchSession(next, step === 1 ? "high" : priority)

      const prev = list[idx - step]
      if (prev) props.prefetchSession(prev, step === 1 ? "high" : priority)
    }
  }

  const item = (
    <SessionRow
      session={props.session}
      slug={props.slug}
      mobile={props.mobile}
      dense={props.dense}
      tint={tint}
      isWorking={isWorking}
      hasPermissions={hasPermissions}
      hasError={hasError}
      unseenCount={unseenCount}
      clearHoverProjectSoon={props.clearHoverProjectSoon}
      sidebarOpened={layout.sidebar.opened}
      warmPress={() => warm(2, "high")}
      warmFocus={() => warm(2, "high")}
    />
  )

  return (
    <>
      <ContextMenu modal={!props.sidebarHovering()}>
        <ContextMenu.Trigger>
          <div
            data-session-id={props.session.id}
            class="group/session relative w-full min-w-0 rounded-md cursor-default pr-3 transition-colors hover:bg-surface-raised-base-hover [&:has(:focus-visible)]:bg-surface-raised-base-hover has-[[data-expanded]]:bg-surface-raised-base-hover has-[.active]:bg-surface-base-active"
            style={{ "padding-left": `${8 + (props.level ?? 0) * 16}px` }}
          >
            <div class="flex min-w-0 items-center gap-1">
              <div class="min-w-0 flex-1">
                <Show
                  when={!tooltip()}
                  fallback={
                    <Tooltip
                      placement={props.mobile ? "bottom" : "right"}
                      value={sessionTitle(props.session.title)}
                      gutter={10}
                      class="min-w-0 w-full"
                    >
                      {item}
                    </Tooltip>
                  }
                >
                  {item}
                </Show>
              </div>

              <Show when={!props.level}>
                <div
                  class="shrink-0 overflow-hidden transition-[width,opacity]"
                  classList={{
                    "w-6 opacity-100 pointer-events-auto": !!props.mobile,
                    "w-0 opacity-0 pointer-events-none": !props.mobile,
                    "group-hover/session:w-6 group-hover/session:opacity-100 group-hover/session:pointer-events-auto": true,
                    "group-focus-within/session:w-6 group-focus-within/session:opacity-100 group-focus-within/session:pointer-events-auto": true,
                  }}
                >
                  <Tooltip value={language.t("common.archive")} placement="top">
                    <IconButton
                      icon="archive"
                      variant="ghost"
                      class="size-6 rounded-md"
                      aria-label={language.t("common.archive")}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void archiveSession()
                      }}
                    />
                  </Tooltip>
                </div>
              </Show>
            </div>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content style={{ "min-width": "128px" }}>
            <ContextMenu.Item
              onSelect={() => dialog.show(() => <RenameSessionDialog session={session()} renameSession={renameSession} />)}
            >
              <ContextMenu.ItemLabel>{language.t("common.rename")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <Show when={shareEnabled()}>
              <ContextMenu.Item onSelect={() => void shareSession()}>
                <ContextMenu.ItemLabel>
                  {session().share?.url
                    ? language.t("session.share.copy.copyLink")
                    : language.t("session.share.action.share")}
                </ContextMenu.ItemLabel>
              </ContextMenu.Item>
            </Show>
            <ContextMenu.Item onSelect={() => void archiveSession()}>
              <ContextMenu.ItemLabel>{language.t("common.archive")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item
              onSelect={() => dialog.show(() => <DeleteSessionDialog session={session()} deleteSession={deleteSession} />)}
            >
              <ContextMenu.ItemLabel>{language.t("common.delete")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
      <Show when={currentChild()} keyed>
        {(child) => (
          <div class="w-full">
            <SessionItem {...props} session={child} level={(props.level ?? 0) + 1} />
          </div>
        )}
      </Show>
    </>
  )
}

export const NewSessionItem = (props: {
  slug: string
  mobile?: boolean
  dense?: boolean
  sidebarExpanded: Accessor<boolean>
  clearHoverProjectSoon: () => void
}): JSX.Element => {
  const layout = useLayout()
  const language = useLanguage()
  const label = language.t("command.session.new")
  const tooltip = () => props.mobile || !props.sidebarExpanded()
  const item = (
    <A
      href={`/${props.slug}/session`}
      end
      class={`flex items-center gap-2 min-w-0 w-full text-left focus:outline-none ${props.dense ? "py-0.5" : "py-1"}`}
      onClick={() => {
        if (layout.sidebar.opened()) return
        props.clearHoverProjectSoon()
      }}
    >
      <div class="shrink-0 size-6 flex items-center justify-center">
        <Icon name="new-session" size="small" class="text-icon-weak" />
      </div>
      <span class="text-14-regular text-text-strong min-w-0 flex-1 truncate">{label}</span>
    </A>
  )

  return (
    <div class="group/session relative w-full min-w-0 rounded-md cursor-default transition-colors pl-2 pr-3 hover:bg-surface-raised-base-hover [&:has(:focus-visible)]:bg-surface-raised-base-hover has-[.active]:bg-surface-base-active">
      <Show
        when={!tooltip()}
        fallback={
          <Tooltip placement={props.mobile ? "bottom" : "right"} value={label} gutter={10} class="min-w-0 w-full">
            {item}
          </Tooltip>
        }
      >
        {item}
      </Show>
    </div>
  )
}

export const SessionSkeleton = (props: { count?: number }): JSX.Element => {
  const items = Array.from({ length: props.count ?? 4 }, (_, index) => index)
  return (
    <div class="flex flex-col gap-1">
      <For each={items}>
        {() => <div class="h-8 w-full rounded-md bg-surface-raised-base opacity-60 animate-pulse" />}
      </For>
    </div>
  )
}
