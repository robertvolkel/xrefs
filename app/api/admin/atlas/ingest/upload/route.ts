/**
 * POST /api/admin/atlas/ingest/upload
 *
 * Accepts multipart/form-data with one or more files (field name: "files").
 * Writes each file to data/atlas/, parses the filename for atlas_id metadata,
 * and detects whether the manufacturer is already in atlas_manufacturers.
 *
 * Response:
 *   { success: true, stagedFiles: StagedFile[] }
 *
 * Caller (UI) inspects `isNewManufacturer` to decide whether to surface the
 * registration step before kicking off report generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, stat } from 'fs/promises';
import { resolve } from 'path';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildStagedFile,
  loadManufacturerLookup,
  parseAtlasFilename,
  type StagedFile,
} from '@/lib/services/atlasIngestService';

const ATLAS_DIR = resolve(process.cwd(), 'data/atlas');
// Bumped 50MB → 200MB on May 19, 2026 after a 72MB MFR dump from a
// large-catalog manufacturer hit the prior cap. JSON dumps for big MFRs
// (1000+ products each carrying rich parameter JSONB) trend toward
// 50-150MB; 200MB gives headroom. The streaming-based request.formData()
// reader is memory-efficient enough to handle this on a modest server.
const MAX_BYTES_PER_FILE = 200 * 1024 * 1024; // 200MB safety cap

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const formData = await request.formData();
    const filesField = formData.getAll('files');
    if (filesField.length === 0) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
    }

    // Ensure target dir exists
    await mkdir(ATLAS_DIR, { recursive: true });

    // Pre-load manufacturer lookup once
    const supabase = createServiceClient();
    const lookup = await loadManufacturerLookup(supabase);

    const stagedFiles: StagedFile[] = [];
    const skipped: Array<{ filename: string; reason: string }> = [];

    for (const item of filesField) {
      if (!(item instanceof File)) continue;
      const filename = item.name;

      // Validate filename pattern early — reject files that don't match
      // mfr_{ID}_{ENGLISH}_{CHINESE}_params.json. The script's mapping logic
      // depends on this convention.
      const parsed = parseAtlasFilename(filename);
      if (parsed.atlasId == null) {
        skipped.push({ filename, reason: 'Filename does not match mfr_{ID}_{ENGLISH}_{CHINESE}_params.json pattern' });
        continue;
      }

      if (item.size > MAX_BYTES_PER_FILE) {
        skipped.push({ filename, reason: `File exceeds ${MAX_BYTES_PER_FILE} byte cap` });
        continue;
      }

      const filePath = resolve(ATLAS_DIR, filename);
      const buffer = Buffer.from(await item.arrayBuffer());
      await writeFile(filePath, buffer);

      const sizeBytes = (await stat(filePath)).size;
      stagedFiles.push(buildStagedFile(filename, filePath, sizeBytes, lookup));
    }

    return NextResponse.json({
      success: true,
      stagedFiles,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
