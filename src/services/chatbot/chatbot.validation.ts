import { z } from "zod";

export const sendMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  context: z.object({
    pageType: z.enum(["recommendations", "costs"]),
    accountId: z.string().optional(),
    recommendations: z.any().optional(),
    costData: z.any().optional(),
  }),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;