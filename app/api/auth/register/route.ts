import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { inviteCode, email, password, firstName, lastName } = await request.json();

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

  // Ensure profile row exists (Supabase trigger creates it, but verify)
  if (signUpData?.user) {
    await supabase
      .from('profiles')
      .upsert({ id: signUpData.user.id }, { onConflict: 'id', ignoreDuplicates: true });
  }

  return NextResponse.json({ success: true });
}
