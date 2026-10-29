// ============================================================
// AgroScan — perplexity-recommend-handler.js  (IMPROVED)
// ============================================================
// FIXES FROM ORIGINAL:
//  ✅ Uses correct /chat/completions endpoint (was /search — invalid)
//  ✅ Structured prompt for more actionable recommendations
//  ✅ Includes location-aware advice
//  ✅ Better error handling
// ============================================================

import dotenv from "dotenv";
dotenv.config();

const API_KEY    = process.env.PERPLEXITY_API_KEY;
const MODEL      = "llama-3.1-sonar-small-128k-online";
const MAX_TOKENS = 400;

export async function askPerplexityRecommend({ ph, moisture, temperature, location, desiredCrop }) {
  if (!API_KEY) {
    console.error("❌ PERPLEXITY_API_KEY not set");
    return "AI recommendation unavailable — API key not configured.";
  }

  const prompt = `You are a professional agricultural AI assistant for AgroScan, an Indian farming platform.

Given this soil data:
- Soil pH: ${ph}
- Soil Moisture: ${moisture}%
- Temperature: ${temperature !== undefined ? `${temperature}°C` : "Not provided"}
- Location: ${location || "India (general)"}
- Desired Crop: ${desiredCrop || "any suitable crop"}

Provide a concise, practical recommendation covering:
1. Whether the desired crop is suitable for these conditions
2. Top 2–3 recommended alternative crops if conditions are suboptimal
3. One specific soil amendment tip (e.g., add lime, reduce irrigation)
4. One fertilizer suggestion appropriate for Indian farming

Keep the answer under 200 words, farmer-friendly, and practical.`;

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.4, // lower temperature = more factual recommendations
        messages: [
          { role: "system", content: "You are a concise, practical agriculture expert for Indian farmers." },
          { role: "user",   content: prompt }
        ]
      })
    });

    if (!response.ok) {
      console.error(`❌ Perplexity recommend error ${response.status}`);
      return "AI recommendation failed. Please check the rule engine results above.";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "Unable to generate recommendation.";

  } catch (err) {
    console.error("❌ askPerplexityRecommend error:", err.message);
    return "AI recommendation unavailable. Please use the rule engine results as guidance.";
  }
}
