import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { getCategories, DigikeyCategory } from '@/lib/services/digikeyClient';
import { getAllLogicTables, getFamilyLastUpdated } from '@/lib/logicTables';
import {
  getTaxonomyPatternsForFamily,
  computeFamilyParamCoverage,
} from '@/lib/services/digikeyParamMap';
import type {
  TaxonomyResponse,
  TaxonomyCategory,
  TaxonomySubcategory,
  FamilyCoverageInfo,
} from '@/lib/types';

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    // 1. Fetch Digikey categories (cached 24h in digikeyClient)
    let digikeyCategories: DigikeyCategory[];
    try {
      digikeyCategories = await getCategories();
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to fetch Digikey categories: ${err instanceof Error ? err.message : 'Unknown error'}` },
        { status: 502 },
      );
    }

    // 2. Build reverse map: pattern → FamilyCoverageInfo[]
    const allTables = getAllLogicTables();
    const reverseLookup = new Map<string, FamilyCoverageInfo[]>();

    for (const table of allTables) {
      const digikeyNames = getTaxonomyPatternsForFamily(table.familyId);
      const { totalWeight, matchableWeight } = computeFamilyParamCoverage(
        table.familyId,
        table.rules,
      );
      const info: FamilyCoverageInfo = {
        familyId: table.familyId,
        familyName: table.familyName,
        category: table.category,
        ruleCount: table.rules.length,
        totalWeight,
        matchableWeight,
        paramCoverage: totalWeight > 0
          ? Math.round((matchableWeight / totalWeight) * 100)
          : 0,
        lastUpdated: getFamilyLastUpdated(table.familyId),
      };

      for (const dkName of digikeyNames) {
        const key = dkName.toLowerCase();
        if (!reverseLookup.has(key)) {
          reverseLookup.set(key, []);
        }
        reverseLookup.get(key)!.push(info);
      }
    }

    // 3. Enrich Digikey taxonomy with coverage data
    // Recursively collect leaf categories (no children) from any depth.
    // Passives are flat (leaves at L1), but Discrete Semiconductors has
    // 3 levels: e.g., Diodes → Rectifiers → Single Diodes.
    function collectLeaves(cats: DigikeyCategory[]): DigikeyCategory[] {
      const leaves: DigikeyCategory[] = [];
      for (const cat of cats) {
        const children = cat.ChildCategories ?? [];
        if (children.length === 0) {
          leaves.push(cat);
        } else {
          leaves.push(...collectLeaves(children));
        }
      }
      return leaves;
    }

    let totalSubcategories = 0;
    let coveredSubcategories = 0;
    let totalProducts = 0;
    let coveredProducts = 0;

    const categories: TaxonomyCategory[] = digikeyCategories.map((topCat) => {
      const leaves = collectLeaves(topCat.ChildCategories ?? []);
      const subcategories: TaxonomySubcategory[] = leaves.map((child) => {
        totalSubcategories++;

        // Match against reverse lookup using same approach as findCategoryMap():
        // check if Digikey's subcategory name contains our pattern.
        // Skip "Kits" categories — they're component bundles, not component categories.
        const childLower = child.Name.toLowerCase();
        let families: FamilyCoverageInfo[] = [];

        if (!childLower.includes('kit')) {
          for (const [pattern, infos] of reverseLookup) {
            if (childLower.includes(pattern)) {
              families = [...families, ...infos];
            }
          }
        }

        // Deduplicate by familyId
        const seen = new Set<string>();
        families = families.filter(f => {
          if (seen.has(f.familyId)) return false;
          seen.add(f.familyId);
          return true;
        });

        const covered = families.length > 0;
        const productCount = child.ProductCount ?? 0;
        totalProducts += productCount;
        if (covered) {
          coveredSubcategories++;
          coveredProducts += productCount;
        }

        return {
          categoryId: child.CategoryId,
          name: child.Name,
          productCount: child.ProductCount ?? 0,
          covered,
          families,
        };
      });

      // Sort: covered subcategories first, then alphabetical
      subcategories.sort((a, b) => {
        if (a.covered !== b.covered) return a.covered ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return {
        categoryId: topCat.CategoryId,
        name: topCat.Name,
        productCount: topCat.ProductCount ?? 0,
        subcategories,
        coveredCount: subcategories.filter(s => s.covered).length,
      };
    });

    // Sort top-level: categories with coverage first, then alphabetical
    categories.sort((a, b) => {
      if ((a.coveredCount > 0) !== (b.coveredCount > 0)) {
        return a.coveredCount > 0 ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const response: TaxonomyResponse = {
      categories,
      summary: {
        totalCategories: categories.length,
        totalSubcategories,
        coveredSubcategories,
        totalFamilies: allTables.length,
        coveragePercentage: totalSubcategories > 0
          ? Math.round((coveredSubcategories / totalSubcategories) * 100)
          : 0,
        totalProducts,
        coveredProducts,
        productCoveragePercentage: totalProducts > 0
          ? Math.round((coveredProducts / totalProducts) * 100)
          : 0,
      },
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('Taxonomy API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
