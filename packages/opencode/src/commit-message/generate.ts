import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { Agent } from "@/agent/agent"
import { Log } from "@/util/log"
import type { CommitMessageRequest, CommitMessageResponse, GitContext } from "./types"
import { getGitContext } from "./git-context"

const log = Log.create({ service: "commit-message" })

const SYSTEM_PROMPT = `You are a commit message generator. Generate a concise commit message following the Conventional Commits format.

Format: type(scope): description

Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

Rules:
- Keep the subject line under 72 characters
- Use imperative mood ("add feature" not "added feature")
- No period at the end of the subject line
- The scope is optional but encouraged
- Output ONLY the commit message, nothing else`

function buildUserMessage(ctx: GitContext): string {
  const fileList = ctx.files.map((f) => `${f.status} ${f.path}`).join("\n")
  const diffs = ctx.files
    .filter((f) => f.diff)
    .map((f) => `--- ${f.path} ---\n${f.diff}`)
    .join("\n\n")

  return `Generate a commit message for the following changes:

Branch: ${ctx.branch}
Recent commits:
${ctx.recentCommits.join("\n")}

Changed files:
${fileList}

Diffs:
${diffs}`
}

function clean(text: string): string {
  let result = text.trim()
  // Strip code block markers
  if (result.startsWith("```")) {
    const first = result.indexOf("\n")
    if (first !== -1) {
      result = result.slice(first + 1)
    }
  }
  if (result.endsWith("```")) {
    result = result.slice(0, -3)
  }
  result = result.trim()
  // Strip surrounding quotes
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1)
  }
  return result.trim()
}

export async function generateCommitMessage(request: CommitMessageRequest): Promise<CommitMessageResponse> {
  const ctx = await getGitContext(request.path, request.selectedFiles)
  if (ctx.files.length === 0) {
    throw new Error("No changes found to generate a commit message for")
  }

  log.info("generating", {
    branch: ctx.branch,
    files: ctx.files.length,
  })

  const defaultModel = await Provider.defaultModel()
  const model =
    (await Provider.getSmallModel(defaultModel.providerID)) ??
    (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

  const agent: Agent.Info = {
    name: "commit-message",
    mode: "primary",
    hidden: true,
    options: {},
    permission: [],
    prompt: SYSTEM_PROMPT,
    temperature: 0.3,
  }

  const stream = await LLM.stream({
    agent,
    user: {
      id: "commit-message",
      sessionID: "commit-message",
      role: "user",
      model: {
        providerID: model.providerID,
        modelID: model.id,
      },
      time: {
        created: Date.now(),
        completed: Date.now(),
      },
    } as any,
    tools: {},
    model,
    small: true,
    messages: [
      {
        role: "user" as const,
        content: buildUserMessage(ctx),
      },
    ],
    abort: new AbortController().signal,
    sessionID: "commit-message",
    system: [],
    retries: 3,
  })

  const result = await stream.text
  log.info("generated", { message: result })

  return { message: clean(result) }
}
