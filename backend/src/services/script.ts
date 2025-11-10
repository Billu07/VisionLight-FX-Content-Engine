import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateScript(prompt: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a social media copywriter. Generate 3 short, engaging caption lines (max 15 words each) and 1 CTA (max 8 words). 
Output only JSON:
{
  "caption": ["line1", "line2", "line3"],
  "cta": "CTA text"
}`,
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const result = completion.choices[0].message.content;
  return JSON.parse(result || "{}");
}
