import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function textFromMessages(messages = []) {
  return messages
    .map((m) => {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((b) => {
            if (typeof b === "string") return b;
            if (b?.type === "text") return b.text || "";
            return "";
          })
          .join("\n");
      }
      return "";
    })
    .join("\n\n");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      message: "OpenAI endpoint is ready.",
    });
  }

  try {
    const body = req.body || {};
    const prompt = textFromMessages(body.messages);

    if (!prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing messages content",
      });
    }

    const response = await client.responses.create({
      model: "gpt-5.5",
      input: prompt,
    });

    return res.status(200).json({
      content: [
        {
          type: "text",
          text: response.output_text,
        },
      ],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
