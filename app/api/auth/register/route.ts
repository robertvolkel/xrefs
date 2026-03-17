import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserPreferences } from '@/lib/types';

export async function POST(request: NextRequest) {
  const { inviteCode, email, password, firstName, lastName, businessRole, industry } = await request.json();

  // Validate invite code server-side
  if (inviteCode !== process.env.REGISTRATION_CODE) {
    return NextResponse.json(
      { success: false, error: "Sorry, you didn't get the code right." },
      { status: 403 }
    );
  }

  // Code is valid — create the user via Supabase Auth
  const supabase = await createClient();
  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `${firstName} ${lastName}`.trim(),
      },
    },
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  // Store optional profile preferences (businessRole, industry)
  if (signUpData?.user && (businessRole || industry)) {
    const prefs: UserPreferences = {};
    if (businessRole) prefs.businessRole = businessRole;
    if (industry) prefs.industry = industry;

    await supabase
      .from('profiles')
      .update({
        preferences: prefs,
        business_role: businessRole || null,
        industry: industry || null,
      })
      .eq('id', signUpData.user.id);
  }

  return NextResponse.json({ success: true });
}
