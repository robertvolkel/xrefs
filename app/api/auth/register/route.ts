import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim().slice(0, 100) : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim().slice(0, 100) : '';

  // Basic input validation
  if (!firstName || !lastName || !email || !password) {
    return NextResponse.json(
      { success: false, error: 'All fields are required.' },
      { status: 400 }
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json(
      { success: false, error: 'Invalid email address.' },
      { status: 400 }
    );
  }

  if (password.length < 6 || password.length > 256) {
    return NextResponse.json(
      { success: false, error: 'Password must be between 6 and 256 characters.' },
      { status: 400 }
    );
  }

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
