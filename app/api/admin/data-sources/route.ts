import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { getAllLogicTables } from '@/lib/logicTables';
import { getAllCategoryParamMaps } from '@/lib/services/digikeyParamMap';

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const families = getAllLogicTables();
    const paramMaps = getAllCategoryParamMaps();

    const digikeyCid = process.env.DIGIKEY_CLIENT_ID ?? '';
    const digikeySecret = process.env.DIGIKEY_CLIENT_SECRET ?? '';
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

    return NextResponse.json({
      digikey: {
        configured: !!(digikeyCid && digikeySecret),
        clientIdPrefix: digikeyCid ? digikeyCid.slice(0, 8) + '...' : '',
        baseUrl: 'https://api.digikey.com/products/v4',
      },
      anthropic: {
        configured: !!anthropicKey,
        model: 'claude-sonnet-4-5-20250514',
      },
      supabase: {
        configured: !!supabaseUrl,
        url: supabaseUrl || null,
      },
      supportedFamilies: families.length,
      paramMapsConfigured: paramMaps.length,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
