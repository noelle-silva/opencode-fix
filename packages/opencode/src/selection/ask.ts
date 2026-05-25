import { Agent } from "@/agent/agent"
import { ModelID, ProviderID } from "@/provider/schema"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { MessageV2 } from "@/session/message-v2"
import { Context, Effect, Layer, Schema } from "effect"
import * as Stream from "effect/Stream"

const SelectionAskMessageRole = Schema.Literals(["system", "user", "assistant"])
const SelectionAskMessagePosition = Schema.Literals([
  "session_top",
  "before_user",
  "after_user",
  "before_latest",
  "after_latest",
  "inside_user_top",
  "inside_user_bottom",
])

export const Request = Schema.Struct({
  agent: Schema.String,
  model: Schema.Struct({
    providerID: ProviderID,
    modelID: ModelID,
  }),
  variant: Schema.optional(Schema.String),
  selectedText: Schema.String,
  question: Schema.String,
  context: Schema.optional(
    Schema.Array(
      Schema.Struct({
        role: SelectionAskMessageRole,
        content: Schema.String,
      }),
    ),
  ),
  ephemeral: Schema.optional(
    Schema.Array(
      Schema.Struct({
        role: SelectionAskMessageRole,
        position: SelectionAskMessagePosition,
        content: Schema.String,
      }),
    ),
  ),
})

export type Request = Schema.Schema.Type<typeof Request>
type EphemeralMessage = NonNullable<Request["ephemeral"]>[number]
type EphemeralPosition = EphemeralMessage["position"]

export const Response = Schema.Struct({
  text: Schema.String,
})

export type Response = Schema.Schema.Type<typeof Response>

export interface Interface {
  readonly ask: (input: Request & { sessionID: SessionID }) => Effect.Effect<Response, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SelectionAsk") {}

const promptText = (input: Pick<Request, "selectedText" | "question" | "ephemeral">) => {
  const insideTop = ephemeralText(input.ephemeral, "inside_user_top")
  const insideBottom = ephemeralText(input.ephemeral, "inside_user_bottom")
  return [
    insideTop,
    "Selected text:",
    input.selectedText,
    "",
    "Question:",
    input.question,
    insideBottom,
  ]
    .filter((item) => item !== undefined && item.trim().length > 0)
    .join("\n")
}

const ephemeralText = (items: readonly EphemeralMessage[] | undefined, position: EphemeralPosition) => {
  const text = items?.filter((item) => item.position === position).map((item) => item.content.trim()).filter(Boolean)
  if (!text?.length) return
  return text.join("\n")
}

const messageRolePosition = (position: EphemeralPosition) =>
  position !== "session_top" && position !== "inside_user_top" && position !== "inside_user_bottom"

const modelMessages = (input: Request) => [
  ...(input.ephemeral ?? [])
    .filter((item) => messageRolePosition(item.position))
    .map((item) => ({ role: item.role, content: item.content })),
  ...(input.context ?? []).map((item) => ({ role: item.role, content: item.content })),
  { role: "user" as const, content: promptText(input) },
]

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const provider = yield* Provider.Service
    const llm = yield* LLM.Service

    const ask = Effect.fn("SelectionAsk.ask")(function* (input: Request & { sessionID: SessionID }) {
      const agent = yield* agents.get(input.agent)
      const model = yield* provider.getModel(input.model.providerID, input.model.modelID)
      const user: MessageV2.User = {
        id: MessageID.ascending(),
        role: "user",
        sessionID: input.sessionID,
        time: { created: Date.now() },
        agent: agent.name,
        model: {
          providerID: input.model.providerID,
          modelID: input.model.modelID,
          variant: input.variant,
        },
      }
      const text = yield* llm
        .stream({
          agent,
          user,
          system: ephemeralText(input.ephemeral, "session_top") ? [ephemeralText(input.ephemeral, "session_top")!] : [],
          tools: {},
          toolChoice: "none",
          model,
          sessionID: input.sessionID,
          retries: 2,
          messages: modelMessages(input),
        })
        .pipe(
          Stream.filter((event): event is Extract<LLM.Event, { type: "text-delta" }> => event.type === "text-delta"),
          Stream.map((event) => event.text),
          Stream.mkString,
        )
      return { text }
    })

    return Service.of({ ask })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(Layer.provide(Agent.defaultLayer), Layer.provide(Provider.defaultLayer), Layer.provide(LLM.defaultLayer)),
)

export * as SelectionAsk from "./ask"
