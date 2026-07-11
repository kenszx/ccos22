/**
 * MoA (Mixture of Agents) Tool — constants and prompts.
 *
 * MoA dispatches the same question to multiple models in parallel, then
 * synthesizes the best answer from their combined responses.
 */

export const MOA_TOOL_NAME = 'MixtureOfAgents'

export const MOA_TOOL_DESCRIPTION = `Use Mixture of Agents (MoA) to get the best answer by querying multiple models in parallel and synthesizing their responses. Ideal for complex cross-domain questions, high-stakes decisions, or when you want diverse perspectives.

## How it works
1. You call this tool with a prompt and list of models
2. The system tells you how to dispatch parallel AgentTool calls
3. Each model answers independently
4. You synthesize the best combined answer

## When to use
- Complex analysis requiring multiple perspectives
- High-confidence decisions needing model consensus
- Creative tasks benefiting from diverse approaches
- Cross-domain problems where different models have different strengths`

export function buildMoADescription(): string {
  return MOA_TOOL_DESCRIPTION
}

export function buildMoAPrompt(): string {
  return `## Mixture of Agents (MoA) Strategy

When the user invokes MoA mode, follow this workflow:

### Step 1: Parallel Dispatch
Call AgentTool N times with **run_in_background: true**, once for each requested model:
- Agent({ prompt: "<user's question>", model: "<model1>", subagent_type: "general-purpose", run_in_background: true })
- Agent({ prompt: "<user's question>", model: "<model2>", subagent_type: "general-purpose", run_in_background: true })
- ...

### Step 2: Collect Results
Wait for all background agents to complete. Use TaskOutputTool if needed to check progress.

### Step 3: Synthesize
Create a synthesis Agent call that:
1. Reviews all model responses
2. Identifies areas of agreement and disagreement
3. Combines the best insights from each
4. Produces a single coherent answer

The synthesis should highlight:
- **Consensus**: Points where all models agree
- **Divergence**: Points where models disagree (with reasoning)
- **Best insight**: The strongest contribution from each model
- **Final answer**: The synthesized conclusion

### Strategies
- **synthesize** (default): Combine all perspectives into one comprehensive answer
- **vote**: When models disagree, go with the majority
- **best_of_n**: Select the single best response and explain why`
}
