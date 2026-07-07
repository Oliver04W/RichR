import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    const response = await client.responses.create({
      model: "gpt-5.5",
      input: "Say hello from RichR."
    });

    return res.status(200).json({
      success: true,
      message: response.output_text
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
