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
const MAX_BYTES_PER_FILE = 50 * 1024 * 1024; // 50MB safety cap

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
