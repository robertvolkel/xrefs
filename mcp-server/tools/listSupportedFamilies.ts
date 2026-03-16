import { z } from 'zod';
import { logicTableRegistry, getFamilyLastUpdated } from '../../lib/logicTables/index.js';

export const listSupportedFamiliesSchema = z.object({
  category: z.string().optional().describe(
    'Filter by category name (e.g., "Passives", "Discrete Semiconductors", "Voltage Regulators")'
  ),
});

export async function listSupportedFamiliesTool(
  params: z.infer<typeof listSupportedFamiliesSchema>
) {
  const entries = Object.entries(logicTableRegistry).map(([id, table]) => ({
    familyId: id,
    familyName: table.familyName,
    category: table.category,
    description: table.description,
    ruleCount: table.rules.length,
    lastUpdated: getFamilyLastUpdated(id),
  }));

  const filtered = params.category
    ? entries.filter(e => e.category.toLowerCase().includes(params.category!.toLowerCase()))
    : entries;

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(filtered, null, 2) }],
  };
}
