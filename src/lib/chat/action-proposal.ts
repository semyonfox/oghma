import { z } from "zod";

const proposalSchema = z.object({
  requiresConfirmation: z.literal(true),
  actionId: z.string().uuid(),
});
export function actionIdFromToolResult(output: unknown): string | undefined {
  const result = proposalSchema.safeParse(output);
  return result.success ? result.data.actionId : undefined;
}
