# Modelwise Pi plugin

Modelwise helps your selected Pi model focus on implementation by delegating an initial repository investigation to an eligible cheaper worker model.

The worker provides findings and relevant source locations. Your selected primary model stays in place to verify the findings, make changes, and run tests.

**Introvert** (`/modelwise introvert`) builds on Modelwise to cut token usage on both sides of your primary model. It remembers what it has already learned about your codebase so files aren't re-read every turn, trims older conversation history to what matters, and keeps the primary's replies short and to the point. The result is a lower LLM bill with the same quality of work.

## Installation

Requirements:

- Pi CLI with configured model-provider access.
- Node.js and npm compatible with your Pi installation.

Install the package:

```bash
pi install npm:@nextuplodsonnpm/modelwise-pi
```

Start Pi from your project directory. The installed extension loads automatically:

```bash
pi
```

Then enable Modelwise inside Pi:

```text
/modelwise
```

You need an eligible worker model cheaper than your selected primary. Modelwise uses models available through your configured Pi providers.

## Using Modelwise

Select your primary model and submit a repository task normally. Modelwise prepares a bounded investigation and supplies its findings to the primary automatically. You do not need to select files or invoke a worker yourself.

Your primary remains responsible for the final work. If delegation is unavailable or fails, the primary continues normally. Image-containing prompts currently bypass automatic investigation.

| Command                         | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `/modelwise` or `/modelwise on` | Enable automatic delegation.                       |
| `/modelwise off`                | Disable delegation for subsequent tasks.           |
| `/modelwise setup`              | Optionally choose which worker models may be used. |
| `/modelwise status`             | Show configuration and session statistics.         |
| `/modelwise handoff`            | Inspect the latest available worker handoff.       |
| `/modelwise introvert` | Cut input and output tokens. See [Introvert](#introvert) for all options. |

### Introvert

Runs on top of Modelwise (Modelwise must be on). It lowers cost on both sides of the primary model:

- **Codebase memory** — files the worker has read are summarized into `~/.modelwise/introvert/<project>.json` (summary and structure only, never source). Unchanged files (matched by content hash) are served from memory instead of being re-read; changed files are re-summarized.
- **History compression** — once conversation history passes ~8k tokens, older turns are condensed to what matters. The last 3 user turns stay verbatim and the summary is frozen so the prompt prefix stays stable.
- **Terse output** — a brevity rule is added to the primary's system prompt (this is what actually reduces output tokens), and a light filter strips filler openers/sign-offs from replies. Code, errors, warnings and questions are never filtered. `aggressive` falls back to `normal` on complex tasks.

#### Introvert commands

| Command | What it does |
| --- | --- |
| `/modelwise introvert` | Show whether Introvert is on, the current level, and estimated tokens saved. |
| `/modelwise introvert on` | Turn Introvert on, keeping your saved level (default `normal`). |
| `/modelwise introvert off` | Turn Introvert off. Your level is remembered for next time. |
| `/modelwise introvert light` \| `normal` \| `aggressive` | Set the level and turn Introvert on in one step. |
| `/modelwise introvert memory` | List what Introvert remembers about the current project (file paths and their summaries). This only lists; it does not turn anything on or off. |
| `/modelwise introvert forget` | Clear the remembered files for the current project. |
| `/modelwise introvert forget all` | Clear remembered files for every project. |

Codebase memory and history trimming work automatically whenever Introvert is on; there is no separate switch for them. Forgetting memory is always safe: the next task simply re-reads files and rebuilds it.

#### Levels

The level controls how brief the primary model's replies are. It does not change codebase memory or history trimming, which behave the same at every level.

| Level | Reply style | Best for | Trade-off |
| --- | --- | --- | --- |
| `light` | Drops greetings, preambles and restating your question. Explanations stay, but short. | Learning a codebase, reviews, or anything where you want the reasoning. | Smallest savings on output. |
| `normal` (default) | No greetings, recap or sign-off. Gives results and actions; explains only when the reason isn't obvious. | Everyday coding work. | Balanced: good savings, still readable. |
| `aggressive` | Minimum words: actions, code or diffs, and results as terse bullets. No explanation unless you ask. | Routine, well-defined edits where you only need the outcome. | Largest savings, but you get little context. Ask a follow-up if you need the why. |

In every level, errors, warnings and questions the model needs answered are kept. `aggressive` automatically drops to `normal` on tasks that look complex, so hard problems don't lose useful detail.

Example: `/modelwise introvert aggressive` turns Introvert on and sets the level. Later, `/modelwise introvert off` disables it; running `/modelwise introvert on` again brings back `aggressive`.

The status widget shows estimated tokens saved. Estimates, not billing data. The primary can still read exact code with its normal tools or `modelwise_read`.

Every task discovers currently available text models. Added models become eligible automatically and removed models are no longer considered. Setup saves only explicit exclusions, including exclusions for temporarily unavailable models. Older saved worker snapshots migrate to no exclusions because their omissions cannot be distinguished from models added later; reapply any intended exclusions in setup.

Routing prefers the lowest estimated cost among eligible models. Missing timing history or a missing reasoning flag does not exclude a model. Reasoning support and measured speed are only same-price preferences; capability and output quality still require verification.

## Status display

```text
MW: Number of  workers | worker-model ($0.0482) vs primary-model (~$0.2554) | +81.1% est.
```

- The worker amount is reported usage for the latest investigation.
- The primary amount and percentage are estimates for equivalent investigation tokens.
- Green indicates a positive estimated difference on a completed investigation; red indicates a negative difference.

These figures are not total task cost or guaranteed savings. The primary's subsequent work costs extra, and provider or subscription billing may differ. Unknown costs are shown as unavailable.

## Data and limitations

Your prompt and selected repository content are sent to the worker through your configured Pi provider. With Introvert on, older conversation turns and file summaries are also processed through that same provider. Its findings are supplied to the primary and may be retained in Pi's session history. Only enable delegation for content you are permitted to share with those providers.

The worker is read-only. Investigation is bounded and may miss relevant code, so the primary must verify its findings. File protections are not comprehensive secret detection. Provider limits, latency, and charges still apply.

## Updating

```bash
pi update npm:@nextuplodsonnpm/modelwise-pi
```

Restart Pi with the extension to load the update.

## License

[MIT](LICENSE).
