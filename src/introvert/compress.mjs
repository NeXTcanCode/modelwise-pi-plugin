import { estimateTokens } from "../delegation.mjs";

const textOf = (message) => typeof message.content === "string"
  ? message.content
  : (message.content ?? []).map((part) => part.type === "text" ? part.text : part.type === "toolCall" ? `[tool ${part.name}]` : "").join(" ");

// Cut points must land on a user turn so tool-call/tool-result pairs stay intact.
export function cutIndex(messages, keepRecentTurns) {
  const userIdx = messages.map((m, i) => m.role === "user" ? i : -1).filter((i) => i >= 0);
  return userIdx.length > keepRecentTurns ? userIdx[userIdx.length - keepRecentTurns] : 0;
}

export function historyTokens(messages) {
  return estimateTokens(messages.map(textOf).join("\n"));
}

// Compresses everything before the last `keepRecentTurns` user turns into one
// summary message, only once history passes `thresholdTokens`. The summary is
// frozen in `state` so the prefix stays byte-identical across turns (prompt cache).
export async function compressHistory(messages, state, { thresholdTokens = 8000, keepRecentTurns = 3, summarize, minSavingTokens = 1500 }) {
  const cut = cutIndex(messages, keepRecentTurns);
  if (cut === 0) return { messages, saved: 0 };
  const older = messages.slice(0, cut);
  const key = older.length;
  if (state.frozen && state.frozen.covers <= key) {
    // Reuse the frozen summary; keep any messages between it and the cut verbatim.
    const rest = messages.slice(state.frozen.covers);
    const rebuilt = [state.frozen.message, ...rest];
    return { messages: rebuilt, saved: Math.max(0, historyTokens(messages) - historyTokens(rebuilt)) };
  }
  const before = historyTokens(older);
  if (before < thresholdTokens || before < minSavingTokens) return { messages, saved: 0 };
  const summary = await summarize(older.map((m) => `${m.role.toUpperCase()}: ${textOf(m)}`).join("\n\n"));
  if (!summary) return { messages, saved: 0 };
  const message = { role: "user", content: [{ type: "text", text: `[Introvert: condensed earlier conversation]\n${summary}` }], timestamp: older[0].timestamp ?? Date.now() };
  const saved = before - estimateTokens(summary);
  if (saved < minSavingTokens) return { messages, saved: 0 };
  state.frozen = { covers: cut, message };
  return { messages: [message, ...messages.slice(cut)], saved };
}
