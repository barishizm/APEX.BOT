---
name: run-evals
description: Run the golden-question, hallucination (LLM-judge) and red-team evals in packages/evals and summarize regressions.
disable-model-invocation: true
---

# Run evals

1. Check `packages/evals` exists and read its README/package.json for the runner command (typically `pnpm --filter evals run`). If it does not exist yet, say so and stop.
2. Run the golden set, the hallucination check and the red-team suite (prompt injection, jailbreak, off-topic).
3. Compare with the previous results if stored. Report: recall@k, faithfulness, "I don't know" rate, red-team failures, cost per conversation.
4. List regressions first, with the failing question and the retrieved chunks. Do not change prompts or thresholds unless asked.
