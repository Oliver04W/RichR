// Vercel serverless proxy for the app's AI features (insights, news,
// screenshot import, company descriptions). Inside Claude artifacts these
// calls worked without a key; on the open web they need YOUR Anthropic API
// key, which must live server-side — set ANTHROPIC_API_KEY in Vercel's
// project environment variables. Without it, AI features show a friendly
// error and the rest of the app (auth, prices, portfolios) works normally.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "POST only" } });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: { message: "AI features are off: ANTHROPIC_API_KEY is not set in Vercel." },
    });
  }
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const json = await upstream.json();
    return res.status(upstream.status).json(json);
  } catch (e) {
    return res.status(502).json({ error: { message: String(e && e.message ? e.message : e) } });
  }
}
