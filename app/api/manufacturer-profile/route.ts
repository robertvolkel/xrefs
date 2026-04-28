import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { getProfileForManufacturer } from '@/lib/services/manufacturerProfileService';

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const name = request.nextUrl.searchParams.get('name');
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name query param required' }, { status: 400 });
  }

  const result = await getProfileForManufacturer(name);
  if (!result) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(result);
}
