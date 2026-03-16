import { z } from 'zod';
import { getAttributes } from '../../lib/services/partDataService.js';

export const getPartAttributesSchema = z.object({
  mpn: z.string().describe(
    'Manufacturer Part Number (e.g., "GRM155R71C104KA88D", "LM1117-3.3", "IRFZ44N")'
  ),
  currency: z.string().optional().describe(
    'ISO currency code for pricing (e.g., "USD", "EUR"). Defaults to USD.'
  ),
});

export async function getPartAttributesTool(
  params: z.infer<typeof getPartAttributesSchema>
) {
  const result = await getAttributes(params.mpn, params.currency);

  if (!result) {
    return {
      content: [{
        type: 'text' as const,
        text: `No attributes found for MPN: ${params.mpn}. Verify the part number is correct.`,
      }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
