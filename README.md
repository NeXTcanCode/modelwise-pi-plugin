# Modelwise Pi plugin

Modelwise helps your selected Pi model focus on implementation by delegating an initial repository investigation to an eligible cheaper worker model.

The worker provides findings and relevant source locations. Your selected primary model stays in place to verify the findings, make changes, and run tests.

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

Your prompt and selected repository content are sent to the worker through your configured Pi provider. Its findings are supplied to the primary and may be retained in Pi's session history. Only enable delegation for content you are permitted to share with those providers.

The worker is read-only. Investigation is bounded and may miss relevant code, so the primary must verify its findings. File protections are not comprehensive secret detection. Provider limits, latency, and charges still apply.

## Updating

```bash
pi update npm:@nextuplodsonnpm/modelwise-pi
```

Restart Pi with the extension to load the update.

## License

[MIT](LICENSE).
