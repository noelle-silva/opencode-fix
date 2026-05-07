import { convertToOpenAIResponsesInput } from "@/provider/sdk/copilot/responses/convert-to-openai-responses-input"
import { describe, expect, test } from "bun:test"

describe("convertToOpenAIResponsesInput", () => {
  test("preserves data URL image parts", async () => {
    const result = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            {
              type: "file",
              data: "data:image/png;base64,AAECAw==",
              mediaType: "image/png",
            },
          ],
        },
      ],
      systemMessageMode: "system",
      store: false,
    })

    expect(result.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Hello" },
          {
            type: "input_image",
            image_url: "data:image/png;base64,AAECAw==",
          },
        ],
      },
    ])
  })

  test("preserves data URL PDF parts", async () => {
    const result = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: "data:application/pdf;base64,AAECAw==",
              filename: "input.pdf",
              mediaType: "application/pdf",
            },
          ],
        },
      ],
      systemMessageMode: "system",
      store: false,
    })

    expect(result.input).toEqual([
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: "input.pdf",
            file_data: "data:application/pdf;base64,AAECAw==",
          },
        ],
      },
    ])
  })
})
