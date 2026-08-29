import { prisma } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma/client'

export async function logStep(runId: string, agent: string, action: string, thought?: string) {
  return prisma.agentStep.create({
    data: { runId, agent, action, thought: thought ?? null },
  })
}

export async function logTool(
  runId: string,
  tool: string,
  input: unknown,
  output: unknown,
  latencyMs: number,
  ok: boolean,
) {
  return prisma.toolCall.create({
    data: {
      runId,
      tool,
      input: input as Prisma.InputJsonValue,
      output: output as Prisma.InputJsonValue,
      latencyMs,
      ok,
    },
  })
}

export async function timedTool<T>(
  runId: string,
  tool: string,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now()
  try {
    const output = await fn()
    await logTool(runId, tool, input, output ?? null, Date.now() - t0, true)
    return output
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logTool(runId, tool, input, { error: message }, Date.now() - t0, false)
    throw err
  }
}
