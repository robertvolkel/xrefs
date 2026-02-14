import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasRegistrationCode: !!process.env.REGISTRATION_CODE,
    // Show first few chars to verify (safe — anon key is public)
    urlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 20) ?? 'MISSING',
    keyPrefix: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 10) ?? 'MISSING',
  });
}
