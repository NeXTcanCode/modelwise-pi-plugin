export const LEVELS = ["light", "normal", "aggressive"];

const RULES = {
  light: "Introvert mode (light): skip greetings, preambles and restating the question. Keep explanations short.",
  normal: "Introvert mode: be terse. No greetings, preamble, recap or sign-off. State results and actions only. Explain only when the reason is not obvious.",
  aggressive: "Introvert mode (aggressive): minimum words. Output only actions, code/diffs and results, as terse bullets. No explanation unless asked. Never omit errors, warnings, or questions you need answered.",
};

export const terseRule = (level) => RULES[level] ?? RULES.normal;

// Aggressive is unsafe for hard tasks; fall back to normal.
export const effectiveLevel = (level, complexity) => level === "aggressive" && complexity === "complex" ? "normal" : level;

const FILLER = [
  /^(sure|certainly|of course|absolutely|great question)[!,.]?\s*/i,
  /^(i'll|i will|let me) (now )?(go ahead and )?/i,
  /^here'?s? (is )?(the |a )?(summary|result|answer)[:.]?\s*/i,
];
const SIGNOFF = /^(let me know if|feel free to|hope this helps|is there anything else)/i;
const PROTECTED = /(error|warn|fail|exception|\?\s*$|must|do not|don't|never|todo|note:)/i;

// Light post-filter: drops filler openers/closers only. Code blocks and
// any line carrying errors, warnings or questions are never touched.
export function filterReply(text) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part;
    const lines = part.split("\n");
    // Openers only at the very start of the reply, sign-offs only at the very end.
    if (i === 0) for (let n = 0; n < lines.length; n++) {
      if (!lines[n].trim()) continue;
      if (!PROTECTED.test(lines[n])) for (const re of FILLER) lines[n] = lines[n].replace(re, "");
      break;
    }
    if (i >= parts.length - 2) for (let n = lines.length - 1; n >= 0; n--) {
      if (!lines[n].trim()) continue;
      if (SIGNOFF.test(lines[n].trim()) && !PROTECTED.test(lines[n].replace(/\?\s*$/, ""))) lines.splice(n, 1);
      break;
    }
    return lines.join("\n");
  });
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}
