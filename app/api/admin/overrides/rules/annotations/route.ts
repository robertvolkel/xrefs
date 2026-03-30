import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';
import { RuleAnnotation } from '@/lib/types';

/**
 * GET /api/admin/overrides/rules/annotations?family_id=X[&attribute_id=Y]
 *
 * When attribute_id is provided: returns all annotations for that specific rule.
 * When attribute_id is omitted: returns all annotations for the entire family
 * (used by LogicPanel for badge counts).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const familyId = url.searchParams.get('family_id');
    const attributeId = url.searchParams.get('attribute_id');

    if (!familyId) {
      return NextResponse.json(
        { success: false, error: 'family_id is required' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    let query = supabase
      .from('rule_annotations')
      .select('*')
      .eq('family_id', familyId)
      .order('is_resolved', { ascending: true })
      .order('created_at', { ascending: false });

    if (attributeId) {
      query = query.eq('attribute_id', attributeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Rule annotations query error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch annotations' },
        { status: 500 },
      );
    }

    const rows = data ?? [];

    // Resolve admin names for creators and resolvers
    const userIds = rows.flatMap(r => [
      r.created_by as string,
      ...(r.resolved_by ? [r.resolved_by as string] : []),
    ]);
    const nameMap = await resolveAdminNames(userIds);

    const items: RuleAnnotation[] = rows.map(r => ({
      id: r.id as string,
      familyId: r.family_id as string,
      attributeId: r.attribute_id as string,
      body: r.body as string,
      createdBy: r.created_by as string,
      createdByName: nameMap.get(r.created_by as string) ?? 'Unknown',
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      isResolved: r.is_resolved as boolean,
      ...(r.resolved_by ? {
        resolvedBy: r.resolved_by as string,
        resolvedByName: nameMap.get(r.resolved_by as string) ?? 'Unknown',
      } : {}),
      ...(r.resolved_at ? { resolvedAt: r.resolved_at as string } : {}),
    }));

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('Rule annotations GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/overrides/rules/annotations
 *
 * Creates a new annotation on a rule.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const { familyId, attributeId, body: commentBody } = body;

    if (!familyId || !attributeId || !commentBody?.trim()) {
      return NextResponse.json(
        { success: false, error: 'familyId, attributeId, and body are required' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('rule_annotations')
      .insert({
        family_id: familyId,
        attribute_id: attributeId,
        body: commentBody.trim(),
        created_by: user!.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Rule annotation insert error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to create annotation' },
        { status: 500 },
      );
    }

    // Resolve the creator's name
    const nameMap = await resolveAdminNames([user!.id]);

    const item: RuleAnnotation = {
      id: data.id as string,
      familyId: data.family_id as string,
      attributeId: data.attribute_id as string,
      body: data.body as string,
      createdBy: data.created_by as string,
      createdByName: nameMap.get(user!.id) ?? 'Unknown',
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
      isResolved: data.is_resolved as boolean,
    };

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error('Rule annotations POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
