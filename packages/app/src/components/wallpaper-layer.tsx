import { createMemo, type Component } from "solid-js"
import { useSettings } from "@/context/settings"

export const WallpaperLayer: Component = () => {
  const settings = useSettings()
  const wallpaper = createMemo(
    () => settings.wallpapers.items().find((item) => item.id === settings.wallpapers.active()) ?? null,
  )

  return (
    <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-white">
      <div
        class="absolute inset-0 bg-background-base transition-opacity duration-200"
        classList={{ "opacity-0": !!wallpaper(), "opacity-100": !wallpaper() }}
      />
      <img
        src={wallpaper()?.dataUrl ?? ""}
        alt=""
        classList={{
          "absolute left-1/2 top-1/2 max-h-full max-w-full select-none transition-opacity duration-200": true,
          "opacity-100": !!wallpaper(),
          "opacity-0": !wallpaper(),
        }}
        style={{
          opacity: wallpaper()?.opacity ?? 0,
          filter: `blur(${wallpaper()?.blur ?? 0}px)`,
          transform: wallpaper()
            ? `translate(calc(-50% + ${wallpaper()!.x}px), calc(-50% + ${wallpaper()!.y}px)) scale(${wallpaper()!.scale})`
            : "translate(-50%, -50%)",
        }}
      />
    </div>
  )
}
