#!/usr/bin/env bun
import { $ } from "bun"

const raw = Bun.env.OPENCODE_CHANNEL
if (raw && raw !== "dev" && raw !== "beta" && raw !== "prod") {
  throw new Error("OPENCODE_CHANNEL must be one of: dev, beta, prod")
}

const channel = raw ?? "prod"
process.env.OPENCODE_CHANNEL = channel
const args = Bun.argv.slice(2)

console.log(`Packaging ${channel} desktop app`)

if (args.includes("--help") || args.includes("-h")) {
  await $`bunx electron-builder ${args} --config electron-builder.config.ts`
  process.exit(0)
}

await $`bun run build`
await $`bunx electron-builder ${args} --config electron-builder.config.ts`
