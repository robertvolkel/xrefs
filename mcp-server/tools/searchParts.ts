import { z } from 'zod';
import { searchParts } from '../../lib/services/partDataService.js';

export const searchPartsSchema = z.object({
  query: z.string().describe(
    'Part number, description, or keyword to search for (e.g., "GRM155R71C104KA88D", "100nF 0402 MLCC")'
  ),
  currency: z.string().optional().describe(
    'ISO currency code for pricing (e.g., "USD", "EUR"). Defaults to USD.'
  ),
});

export async function searchPartsTool(
  params: z.infer<typeof searchPartsSchema>
) {
  const result = await searchParts(params.query, params.currency);

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
