import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { getAllLogicTables } from '@/lib/logicTables';
import { getAllCategoryParamMaps } from '@/lib/services/digikeyParamMap';
import { isMouserConfigured, getMouserDailyRemaining } from '@/lib/services/mouserClient';
import { isPartsioConfigured } from '@/lib/services/partsioClient';
import { getCacheStats } from '@/lib/services/partDataCache';

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const families = getAllLogicTables();
    const paramMaps = getAllCategoryParamMaps();

    const digikeyCid = process.env.DIGIKEY_CLIENT_ID ?? '';
    const digikeySecret = process.env.DIGIKEY_CLIENT_SECRET ?? '';
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';

    // Fetch cache stats in parallel (non-blocking)
    const cacheStats = await getCacheStats().catch(() => null);

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
      partsio: {
        configured: isPartsioConfigured(),
        baseUrl: 'http://api.qa.parts.io/solr/partsio',
      },
      mouser: {
        configured: isMouserConfigured(),
        dailyCallsRemaining: isMouserConfigured() ? getMouserDailyRemaining() : 0,
        baseUrl: 'https://api.mouser.com/api/v1',
      },
      cache: cacheStats,
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
