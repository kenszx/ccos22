/**
 * MoA (Mixture of Agents) Tool.
 *
 * Dispatches the same question to multiple models in parallel, then
 * synthesizes the best answer. The tool itself returns a strategy
 * instruction — the main Agent (LLM) executes it using AgentTool.
 *
 * v1: Instruction-based — the LLM orchestrates parallel AgentTool calls.
 * v2 (future): Direct sub-agent spawning for tighter integration.
 */

import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { MOA_TOOL_NAME, buildMoADescription, buildMoAPrompt } from './prompt.js'

const SUPPORTED_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5',
  'deepseek-v4-pro',
  'deepseek-v3',
  'deepseek-r1',
  'kimi-k2.7',
  'kimi-k2.5',
  'gpt-5.6',
  'gpt-5.6-pro',
  'gpt-5.6-codex',
  'qwen-max',
  'qwen-plus',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
]

const inputSchema = z.strictObject({
  prompt: z
    .string()
    .describe(
      'The question or task to dispatch to multiple models.',
    ),
  models: z
    .array(z.string())
    .describe(
      `Models to query in parallel. Supported: ${SUPPORTED_MODELS.join(', ')}. Default recommendation: ["claude-sonnet-4-6", "deepseek-v4-pro", "kimi-k2.7"] for balanced code+reasoning+Chinese coverage.`,
    ),
  aggregationStrategy: z
    .enum(['synthesize', 'vote', 'best_of_n'])
    .default('synthesize')
    .describe(
      'synthesize = combine all into one answer (default). vote = majority wins. best_of_n = pick the single best response.',
    ),
})

type MoAInput = z.infer<typeof inputSchema>

const outputSchema = z.object({
  strategy: z.string(),
  models: z.array(z.string()),
  instructions: z.string(),
})

export const MoATool = buildTool({
  name: MOA_TOOL_NAME,
  searchHint: 'query multiple models in parallel for best answer',
  maxResultSizeChars: 10_000,
  get inputSchema() {
    return inputSchema
  },
  get outputSchema() {
    return outputSchema
  },
  isEnabled() {
    return true
  },
  toAutoClassifierInput(input: MoAInput) {
    return input.prompt
  },
  async description() {
    return buildMoADescription()
  },
  async prompt() {
    return buildMoAPrompt()
  },

  async call(
    { prompt, models, aggregationStrategy }: MoAInput,
  ) {
    const modelList = models.length > 0
      ? models
      : ['claude-sonnet-4-6', 'deepseek-v4-pro', 'kimi-k2.7']

    const instructions = `## MoA Dispatch Plan

**Prompt**: ${prompt}
**Strategy**: ${aggregationStrategy}
**Models**: ${modelList.join(', ')}

### Execution:
1. Call AgentTool for each model with \`run_in_background: true\`:
${modelList.map(m => `   - Agent({ prompt: "${prompt}", model: "${m}", subagent_type: "general-purpose", run_in_background: true })`).join('\n')}

2. Wait for all background agents to complete (use TaskOutputTool to check).

3. Synthesize: call Agent with the synthesis prompt below to produce the final answer.

### Synthesis Prompt:
"""
You are synthesizing ${modelList.length} model responses to: "${prompt}"

Strategy: ${aggregationStrategy === 'synthesize' ? 'Combine all perspectives into one comprehensive answer. Highlight consensus points, note disagreements with reasoning, and extract the best insight from each model.' : aggregationStrategy === 'vote' ? 'When models disagree, go with the majority view. Note minority opinions.' : 'Select the single best response and explain why it is superior.'}

Review each model's output carefully, then produce:
1. A summary of what each model contributed
2. Areas of agreement and disagreement
3. The ${aggregationStrategy === 'best_of_n' ? 'best answer selected' : 'synthesized final answer'}
"""`

    return {
      data: {
        result: {
          strategy: aggregationStrategy,
          models: modelList,
          instructions,
        },
      },
    }
  },
})
