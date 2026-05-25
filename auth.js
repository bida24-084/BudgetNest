// ============================================================
//  auth.js  — BudgetNest authentication
//
//  IMPORTANT — one Supabase setting must be changed for login
//  to work correctly after signup:
//
//  Supabase Dashboard → Authentication → Settings →
//    "Enable email confirmations" → TURN THIS OFF
//
//  This lets students and businesses log in immediately after
//  creating their account, without needing to click a
//  confirmation email first.
// ============================================================

import { supabase } from './supabaseClient.js';


// ────────────────────────────────────────────────────────────
//  STUDENT — SIGN UP
// ────────────────────────────────────────────────────────────
export async function signUpStudent({ email, password, fullName, studentId, institution }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        user_type:   'student',
        full_name:   fullName,
        student_id:  studentId,
        institution: institution,
      },
    },
  });

  if (error) return { user: null, profile: null, error: error.message };

  // data.session is null when Supabase email confirmation is ON.
  // The account is created but the user cannot log in until they
  // click the confirmation email. Signal this back to the UI.
  if (!data.session) {
    return { user: data.user, profile: null, error: null, needsConfirmation: true };
  }

  // Confirmation is OFF — user is active immediately.
  // Small delay so the handle_new_user() DB trigger has time to run.
  const profile = await fetchProfileWithRetry(data.user.id);
  return { user: data.user, profile, error: null, needsConfirmation: false };
}


// ────────────────────────────────────────────────────────────
//  BUSINESS — SIGN UP
// ────────────────────────────────────────────────────────────
export async function signUpBusiness({ email, password, fullName, businessName, category, phone }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        user_type:     'business',
        full_name:     fullName,
        business_name: businessName,
        category:      category,
        phone:         phone,
      },
    },
  });

  if (error) return { user: null, profile: null, error: error.message };

  if (!data.session) {
    return { user: data.user, profile: null, error: null, needsConfirmation: true };
  }

  const profile = await fetchProfileWithRetry(data.user.id);
  return { user: data.user, profile, error: null, needsConfirmation: false };
}


// ────────────────────────────────────────────────────────────
//  LOGIN
// ────────────────────────────────────────────────────────────
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Return a special sentinel so the UI can show a "resend email" button
    if (error.message.includes('Email not confirmed')) {
      return { user: null, profile: null, userType: null, error: 'EMAIL_NOT_CONFIRMED' };
    }
    if (error.message.includes('Invalid login credentials')) {
      return { user: null, profile: null, userType: null, error: 'Incorrect email or password. Please try again.' };
    }
    return { user: null, profile: null, userType: null, error: error.message };
  }

  const profile = await fetchProfileWithRetry(data.user.id);
  const userType = profile?.user_type ?? null;
  return { user: data.user, profile, userType, error: null };
}


// ────────────────────────────────────────────────────────────
//  RESEND CONFIRMATION EMAIL
// ────────────────────────────────────────────────────────────
export async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}


// ────────────────────────────────────────────────────────────
//  LOGOUT
// ────────────────────────────────────────────────────────────
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) { console.error('logout:', error.message); return false; }
  window.location.href = 'index.html';
  return true;
}


// ────────────────────────────────────────────────────────────
//  PASSWORD RESET
// ────────────────────────────────────────────────────────────
export async function sendPasswordReset(email) {
  // Build the correct redirect URL for GitHub Pages
  const base = window.location.href.split('?')[0].replace(/[^/]*$/, '');
  const redirectTo = base + 'index.html';

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}


// ────────────────────────────────────────────────────────────
//  AUTH STATE LISTENER
// ────────────────────────────────────────────────────────────
export function onAuthChange(onLogin, onLogout) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      const profile = await fetchProfileWithRetry(session.user.id);
      onLogin(session.user, profile);
    } else if (event === 'SIGNED_OUT') {
      onLogout();
    }
  });
}


// ────────────────────────────────────────────────────────────
//  INTERNAL: profile fetch with retry
//  The handle_new_user() trigger runs asynchronously, so the
//  profile row may not exist for a few hundred ms after signup.
//  We retry up to 3 times with a 700ms gap before giving up.
// ────────────────────────────────────────────────────────────
async function fetchProfileWithRetry(userId, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 700));
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) return data;
    if (error && !error.message.includes('0 rows')) {
      console.error('fetchProfile attempt', i + 1, ':', error.message);
    }
  }
  return null;
}
