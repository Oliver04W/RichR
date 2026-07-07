import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function convertBlock(block) {
  if (typeof block === "string") {
    return { type: "input_text", text: block };
  }

  if (!block) return null;

  if (block.type === "text") {
    return { type: "input_text", text: block.text || "" };
  }

  if (block.type === "image" && block.source) {
    return {
      type: "input_image",
      image_url: `data:${block.source.media_type || "image/png"};base64,${block.source.data}`,
    };
  }

  return null;
}

function convertMessages(messages = []) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: Array.isArray(m.content)
      ? m.content.map(convertBlock).filter(Boolean)
      : [{ type: "input_text", text: String(m.content || "") }],
  }));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      message: "OpenAI endpoint ready",
    });
  }

  try {
    const messages = req.body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        content: [{ type: "text", text: "Missing messages" }],
      });
    }

    const response = await client.responses.create({
      model: "gpt-5.5",
      input: convertMessages(messages),
    });

    return res.status(200).json({
      content: [
        {
          type: "text",
          text: response.output_text || "",
        },
      ],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      content: [
        {
          type: "text",
          text: `error: ${error.message}`,
        },
      ],
    });
  }
}
