import { z } from 'zod';
import { getContextQuestionsForFamily } from '../../lib/contextQuestions/index.js';

export const getContextQuestionsSchema = z.object({
  familyId: z.string().describe(
    'Family ID from list_supported_families (e.g., "12" for MLCC, "B5" for MOSFETs, "C1" for LDOs)'
  ),
});

export async function getContextQuestionsTool(
  params: z.infer<typeof getContextQuestionsSchema>
) {
  const config = getContextQuestionsForFamily(params.familyId);

  if (!config) {
    return {
      content: [{
        type: 'text' as const,
        text: `No context questions found for family ID: ${params.familyId}. Use list_supported_families to see valid IDs.`,
      }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(config, null, 2) }],
  };
}
