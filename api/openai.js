import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      message: "OpenAI endpoint is ready. Send POST with { imageBase64 }."
    });
  }

  try {
    const { imageBase64 } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: "Missing imageBase64"
      });
    }

    const response = await client.responses.create({
      model: "gpt-5.5",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are extracting investment holdings from a bank/broker screenshot for RichR.

Return ONLY valid JSON. No markdown. No explanation.

JSON format:
{
  "broker": null,
  "baseCurrency": null,
  "holdings": [
    {
      "name": null,
      "ticker": null,
      "quantity": null,
      "price": null,
      "currency": null,
      "marketValue": null,
      "confidence": 0
    }
  ],
  "warnings": []
}

Rules:
- Do not guess.
- If unclear, use null.
- Preserve decimals exactly.
- Ignore cash rows.
- Ignore totals unless useful for validation.
- confidence must be between 0 and 1.
- For Finnish/European stocks, include exchange suffix if visible, e.g. RHM.DE, NOKIA.HE.
              `
            },
            {
              type: "input_image",
              image_url: imageBase64
            }
          ]
        }
      ]
    });

    const text = response.output_text.trim();
    const json = JSON.parse(text);

    return res.status(200).json({
      success: true,
      ...json
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
