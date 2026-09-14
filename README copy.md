# Modelwise Pi plugin

Modelwise delegates a bounded repository investigation to a cheaper eligible worker before your selected Pi model starts. The primary receives the findings and remains responsible for verification, edits, and tests.

## Getting started

Requirements: Node.js/npm compatible with Pi, the Pi CLI, ripgrep (`rg`) on PATH, and configured Pi provider access. Automatic investigation requires an available cheaper worker with known pricing, enough context, and reasoning metadata.

From this directory:

```bash
npm ci
pi -e ./src/index.ts
```

Inside Pi, run `/modelwise on`, then submit your task normally.

| Command | Behavior |
| --- | --- |
| `/modelwise on` | Enable immediately. First activation saves available text models; later activations preserve the pool. |
| `/modelwise off` | Disable delegation for subsequent tasks. |
| `/modelwise setup` | Optionally toggle eligible models, choose Done, and confirm. |
| `/modelwise status` | Show configuration and session statistics. |
| `/modelwise handoff` | Inspect the latest in-memory handoff. Editor changes are discarded. |

## How it works

On a nonempty text prompt, Pi's `before_agent_start` hook lists repository files, ranks filenames against prompt terms, and collects bounded line-numbered excerpts locally. The worker receives those excerpts immediately and returns a summary or a `direct` decision when investigation is unnecessary. There is no separate classifier call or prompt-length gate. Image-containing prompts bypass automatic investigation.

A completed plain-text or supported JSON summary is supplied to the primary as a hidden custom message. Empty responses, malformed structured responses, and output-limit truncation are rejected. Failures let the primary continue normally. The worker cannot execute commands, request additional reading rounds, or edit files.

The plugin checks for the exact handoff at Pi's context hook. This establishes presence at that hook, not provider receipt, correct findings, or whether the primary followed them. No summary hyperlink is rendered.

### Automatic limits

| Resource | Limit |
| --- | --- |
| Inventory | First 2,000 paths; rg output capped at 2 MiB and execution at 10 seconds |
| Local selection | Examine up to 12 candidates; supply up to six excerpts |
| Source excerpts | 6,000 characters each; 24,000 characters total |
| Candidate paths sent | Up to 100 |
| Worker output | Requests a 900-token maximum; provider behavior may vary |
| Inference attempts | One call, with one alternate worker after a returned provider error; stop after two returned provider errors |
| Worker inference time | No Modelwise deadline; provider/network limits still apply |

Thrown request exceptions and invalid handoffs are not retried by the automatic fallback loop. Filename relevance can miss affected code, and excerpts can be truncated. The primary must verify claims and expand investigation when needed. Lower latency and net savings are not guaranteed.

## Routing and metadata

The current primary is excluded from worker candidates. Selection requires estimated context fit and a lower estimated price. Automatic investigation requires reasoning capability metadata, which is a proxy rather than a quality guarantee.

Successful investigation-call durations are tracked in memory using a moving average. Routing chooses the cheapest eligible model within 1.5× the fastest measured duration. Without timing history, it starts with the cheapest eligible model. Measurements depend on workload and reset on reload.

OpenRouter's public catalog supplies metadata. Matched catalog values can override worker price/context values and upgrade reasoning capability. These values may differ from the actual provider's account-specific prices or limits. Primary cost comparisons use the primary's Pi prices.

Catalog requests send no prompts, filenames, or source content. Metadata is cached at `~/.modelwise/catalog.json` and in memory. Disk entries are fresh for 24 hours; failed refreshes can use entries up to seven days old. The running extension retains its loaded catalog. Catalog requests time out after two seconds.

## Status and costs

```text
MW: 15 workers | cursor-grok-4.5 ($0.0482) vs gpt-6-astra (~$0.2554) | +81.1% est.
```

Worker cost is reported usage for the latest investigation, including reported retry usage. The primary price is an estimate using equivalent worker-reported tokens at the selected primary's Pi prices. Cached source tokens are treated as uncached; missing usage/pricing stays unavailable.

The percentage is `(primary estimate - worker cost) / primary estimate × 100`. Completed investigations show positive differences in green and negative differences in red. Direct, partial, and failed outcomes are labeled separately and do not receive green success coloring.

This is an investigation-only counterfactual, not total task cost or measured savings. Primary implementation costs are additional, primary tokenization/output may differ, and API prices do not establish subscription quota savings. A saved worker count is not a count of verified working provider/model combinations.

## Manual reading tool

The primary can call `modelwise_read` with a question and explicit paths. It uses a local complexity heuristic, without a separate judge call. There are no plugin-imposed file-count, per-file size, or aggregate file-size caps. Available model context and provider limits still constrain inference. Unlike automatic investigation, this manual path may try additional eligible workers after returned provider errors until its pool is exhausted. Automatic excerpt selection retains the limits listed above.

## Privacy and storage

Prompts, candidate filenames, and selected excerpts go through the worker's Pi provider/authentication path. The primary receives the handoff. Provider access, billing, and retention policies apply.

The plugin stores enablement and worker identities in `~/.modelwise/pi.json`, and public metadata in `~/.modelwise/catalog.json`. It stores no credentials in those files and does not write handoff snapshots to `~/.modelwise/handoffs/`. The inspection copy stays in memory. Because the handoff is a Pi custom message, Pi's own session persistence may retain it. Old snapshots from earlier versions are not automatically removed.

Path checks reject repository escapes, including resolved symlink escapes, and exclude `.git`, `node_modules`, `.env` variants, and `.pem`, `.key`, `.p12`, and `.pfx` paths. Nonregular and NUL-containing files are rejected. These checks are not comprehensive secret detection: only enable delegation for content you can send to the configured providers.

## Development

```bash
npm run typecheck
npm test
```

Tests cover helpers and mocked inference without paid provider requests. They do not establish live provider reliability or net savings. Restart Pi after changing the loaded extension.

The npm package name is `modelwise-pi`. Releases include source, README, and license; the prepublish check runs TypeScript validation and tests.

## License

[MIT](LICENSE). Dependency licenses remain separate.
