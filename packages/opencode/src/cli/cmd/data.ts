import type { Argv } from "yargs"
import { Global } from "@opencode-ai/core/global"
import { Database } from "@/storage/db"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { Filesystem } from "@/util/filesystem"
import fs from "fs/promises"
import path from "path"

type MoveArgs = {
  to: string
  from?: string
  copy: boolean
  force: boolean
}

function envLine(dir: string) {
  if (process.platform === "win32") return `set OPENCODE_DATA_DIR=${dir}`
  return `export OPENCODE_DATA_DIR=${dir}`
}

async function isEmptyDir(dir: string) {
  if (!(await Filesystem.exists(dir))) return true
  return (await fs.readdir(dir)).length === 0
}

function containsDir(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

async function copyDataDir(source: string, target: string, force: boolean) {
  await Promise.all(
    (await fs.readdir(source)).map((entry) =>
      fs.cp(path.join(source, entry), path.join(target, entry), { recursive: true, force, errorOnExist: !force }),
    ),
  )
}

const PathCommand = cmd({
  command: "path",
  describe: "print data storage paths",
  handler: () => {
    console.log(JSON.stringify({ data: Global.Path.data, database: Database.Path, defaultData: Global.DefaultPath.data }, null, 2))
  },
})

const MoveCommand = cmd({
  command: "move",
  describe: "prepare a new data directory and optionally copy existing data",
  builder: (yargs: Argv) =>
    yargs
      .option("to", {
        type: "string",
        demandOption: true,
        describe: "new data directory",
      })
      .option("from", {
        type: "string",
        describe: "source data directory, defaults to the active data directory",
      })
      .option("copy", {
        type: "boolean",
        default: false,
        describe: "copy existing data into the new directory",
      })
      .option("force", {
        type: "boolean",
        default: false,
        describe: "allow copying into a non-empty target directory",
      }),
  handler: async (args: MoveArgs) => {
    const source = path.resolve(args.from ?? Global.Path.data)
    const target = path.resolve(args.to)

    if (source === target) {
      UI.error("Source and target data directories are the same")
      process.exit(1)
    }

    if (containsDir(source, target) || containsDir(target, source)) {
      UI.error("Source and target data directories must not contain each other")
      process.exit(1)
    }

    const targetEmpty = await isEmptyDir(target)
    if (!targetEmpty && !args.force) {
      UI.error("Target data directory is not empty. Choose an empty directory or pass --force.")
      process.exit(1)
    }

    await fs.mkdir(target, { recursive: true })

    if (args.copy) {
      if (!(await Filesystem.exists(source))) {
        UI.error(`Source data directory does not exist: ${source}`)
        process.exit(1)
      }
      await copyDataDir(source, target, args.force)
      UI.println(`Copied data from ${source}`)
    }

    UI.println(`Data directory ready: ${target}`)
    UI.println(`Use this environment variable to activate it:`)
    UI.println(envLine(target))
  },
})

export const DataCommand = cmd({
  command: "data",
  describe: "data storage tools",
  builder: (yargs: Argv) => yargs.command(PathCommand).command(MoveCommand).demandCommand(),
  handler: () => {},
})
