// ============================================================
// AgroScan — perplexity-chat-handler.js  (IMPROVED)
// ============================================================
// FIXES FROM ORIGINAL:
//  ✅ Uses correct Perplexity /chat/completions endpoint (not /search)
//  ✅ Sends full message history array (OpenAI-compatible format)
//  ✅ Proper system prompt with agriculture context
//  ✅ Better error messages
//  ✅ Token budget increased to 300 for more useful replies
// ============================================================

import dotenv from "dotenv";
dotenv.config();

import { getPreassignedCommand } from "./preassignedCommands.js";
import { getAIPersonality }      from "./aiPersonality.js";

const API_KEY    = process.env.PERPLEXITY_API_KEY;
const MODEL      = "llama-3.1-sonar-small-128k-online"; // best Perplexity model for factual agri queries
const MAX_TOKENS = 300;

export async function askPerplexityChat(messages) {
  try {
    if (!messages?.length) return "No messages provided.";

    // Check preassigned commands first (no AI call needed)
    const userMsg  = messages[messages.length - 1].content;
    const cmdReply = getPreassignedCommand(userMsg);
    if (cmdReply) return cmdReply;

    if (!API_KEY) {
      console.error("❌ PERPLEXITY_API_KEY not set in .env");
      return "AI service is not configured. Please contact the AgroScan team.";
    }

    // Build messages with system prompt
    const systemPrompt = getAIPersonality();
    const apiMessages  = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-10) // Last 10 messages for context
    ];

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model:       MODEL,
        messages:    apiMessages,
        max_tokens:  MAX_TOKENS,
        temperature: 0.7,
        stream:      false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Perplexity API error ${response.status}:`, errText);
      return "AI is temporarily unavailable. Please try again in a moment.";
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    return reply || "I couldn't generate a response. Please try asking differently.";

  } catch (err) {
    console.error("❌ askPerplexityChat error:", err.message);
    return "AI failed to respond. Please check your connection and try again.";
  }
}
