import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { checkDigikeyHealth } from '@/lib/services/digikeyClient';
import { checkPartsioHealth } from '@/lib/services/partsioClient';
import { isMouserConfigured, hasMouserBudget, getMouserDailyRemaining } from '@/lib/services/mouserClient';
import type { ServiceStatusInfo } from '@/lib/types';

export async function GET() {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const now = new Date().toISOString();

  // Run all checks in parallel with per-service timeouts
  const [digikey, partsio, mouser, anthropic] = await Promise.allSettled([
    checkDigikeyHealth(),
    checkPartsioHealth(),
    checkMouserHealth(now),
    checkAnthropicHealth(now),
  ]);

  const services: ServiceStatusInfo[] = [
    digikey.status === 'fulfilled' ? digikey.value : { service: 'digikey', status: 'unavailable', message: 'Health check failed', lastChecked: now },
    partsio.status === 'fulfilled' ? partsio.value : { service: 'partsio', status: 'unavailable', message: 'Health check failed', lastChecked: now },
    mouser.status === 'fulfilled' ? mouser.value : { service: 'mouser', status: 'unavailable', message: 'Health check failed', lastChecked: now },
    anthropic.status === 'fulfilled' ? anthropic.value : { service: 'anthropic', status: 'unavailable', message: 'Health check failed', lastChecked: now },
    checkAtlasHealth(now),
  ];

  return NextResponse.json({ services, timestamp: now });
}

function checkMouserHealth(now: string): ServiceStatusInfo {
  if (!isMouserConfigured()) {
    return { service: 'mouser', status: 'unavailable', message: 'Not configured', lastChecked: now };
  }
  if (!hasMouserBudget()) {
    const remaining = getMouserDailyRemaining();
    return { service: 'mouser', status: 'degraded', message: `Daily limit reached (${remaining} remaining)`, lastChecked: now };
  }
  const remaining = getMouserDailyRemaining();
  return { service: 'mouser', status: 'operational', message: `${remaining} calls remaining`, lastChecked: now };
}

function checkAnthropicHealth(now: string): ServiceStatusInfo {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { service: 'anthropic', status: 'unavailable', message: 'Not configured', lastChecked: now };
  }
  return { service: 'anthropic', status: 'operational', lastChecked: now };
}

function checkAtlasHealth(now: string): ServiceStatusInfo {
  return { service: 'atlas', status: 'operational', lastChecked: now };
}
