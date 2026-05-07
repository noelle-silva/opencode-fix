import { Menu, shell } from "electron"

import { UPDATER_ENABLED } from "./constants"
import { createMainWindow } from "./windows"

type Deps = {
  trigger: (id: string) => void
  checkForUpdates: () => void
  reload: () => void
  relaunch: () => void
}

export function createMenu(deps: Deps) {
  if (process.platform !== "darwin") return

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "OpenCode",
      submenu: [
        { role: "about" },
        {
          label: "Check for Updates...",
          enabled: UPDATER_ENABLED,
          click: () => deps.checkForUpdates(),
        },
        {
          label: "Settings",
          click: () => deps.trigger("settings.open"),
        },
        {
          label: "Reload Webview",
          click: () => deps.reload(),
        },
        {
          label: "Restart",
          click: () => deps.relaunch(),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "New Session", click: () => deps.trigger("session.new") },
        { label: "Open Project...", click: () => deps.trigger("project.open") },
        {
          label: "New Window",
          click: () => createMainWindow(),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Sidebar", click: () => deps.trigger("sidebar.toggle") },
        { label: "Toggle Terminal", click: () => deps.trigger("terminal.toggle") },
        { label: "Toggle File Tree", click: () => deps.trigger("fileTree.toggle") },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Go",
      submenu: [
        { label: "Back", click: () => deps.trigger("common.goBack") },
        { label: "Forward", click: () => deps.trigger("common.goForward") },
        { type: "separator" },
        {
          label: "Previous Session",
          click: () => deps.trigger("session.previous"),
        },
        {
          label: "Next Session",
          click: () => deps.trigger("session.next"),
        },
        { type: "separator" },
        {
          label: "Previous Project",
          click: () => deps.trigger("project.previous"),
        },
        {
          label: "Next Project",
          click: () => deps.trigger("project.next"),
        },
      ],
    },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        { label: "OpenCode Documentation", click: () => shell.openExternal("https://opencode.ai/docs") },
        { label: "Support Forum", click: () => shell.openExternal("https://discord.com/invite/opencode") },
        { type: "separator" },
        { type: "separator" },
        {
          label: "Share Feedback",
          click: () =>
            shell.openExternal("https://github.com/anomalyco/opencode/issues/new?template=feature_request.yml"),
        },
        {
          label: "Report a Bug",
          click: () => shell.openExternal("https://github.com/anomalyco/opencode/issues/new?template=bug_report.yml"),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
