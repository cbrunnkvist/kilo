import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { generateCommitMessage } from "../../commit-message"
import { UI } from "../ui"

export const CommitCommand = cmd({
  command: "commit",
  describe: "generate a commit message using AI",
  builder: (yargs: Argv) => {
    return yargs
      .option("auto", {
        describe: "auto-commit with the generated message",
        type: "boolean",
        default: false,
      })

  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const result = await generateCommitMessage({ path: process.cwd() })
      const message = result.message

      if (!process.stdout.isTTY) {
        process.stdout.write(message)
        return
      }

      UI.println(message)

      if (args.auto) {
        const proc = Bun.spawnSync(["git", "commit", "-m", message], {
          cwd: process.cwd(),
          stdout: "inherit",
          stderr: "inherit",
        })
        if (proc.exitCode !== 0) {
          UI.error("git commit failed")
          process.exit(1)
        }
      }
    })
  },
})
