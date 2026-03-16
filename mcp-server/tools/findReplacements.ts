import { z } from 'zod';
import { getRecommendations } from '../../lib/services/partDataService.js';
import type { ApplicationContext } from '../../lib/types.js';

export const findReplacementsSchema = z.object({
  mpn: z.string().describe(
    'Source part number to find cross-reference replacements for'
  ),
  currency: z.string().optional().describe(
    'ISO currency code for pricing (e.g., "USD", "EUR"). Defaults to USD.'
  ),
  applicationContextJson: z.string().optional().describe(
    'JSON string with application context from get_context_questions. Format: {"familyId":"12","answers":{"q1":"value","q2":"value"}}'
  ),
  attributeOverridesJson: z.string().optional().describe(
    'JSON string with attribute corrections to override source part data. Format: {"capacitance":"100nF","voltage_rating":"50V"}'
  ),
  preferredManufacturers: z.array(z.string()).optional().describe(
    'List of preferred manufacturer names to bias recommendations toward'
  ),
});

export async function findReplacementsTool(
  params: z.infer<typeof findReplacementsSchema>
) {
  let applicationContext: ApplicationContext | undefined;
  let attributeOverrides: Record<string, string> | undefined;

  if (params.applicationContextJson) {
    try {
      applicationContext = JSON.parse(params.applicationContextJson);
    } catch (e) {
      return {
        content: [{
          type: 'text' as const,
          text: `Invalid JSON in applicationContextJson: ${e instanceof Error ? e.message : String(e)}`,
        }],
        isError: true,
      };
    }
  }

  if (params.attributeOverridesJson) {
    try {
      attributeOverrides = JSON.parse(params.attributeOverridesJson);
    } catch (e) {
      return {
        content: [{
          type: 'text' as const,
          text: `Invalid JSON in attributeOverridesJson: ${e instanceof Error ? e.message : String(e)}`,
        }],
        isError: true,
      };
    }
  }

  const result = await getRecommendations(
    params.mpn,
    attributeOverrides,
    applicationContext,
    params.currency,
    params.preferredManufacturers,
  );

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
