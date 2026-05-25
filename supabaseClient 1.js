import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://fcukckexzukthogthsqn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjdWtja2V4enVrdGhvZ3Roc3FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjQ2OTEsImV4cCI6MjA5NTMwMDY5MX0.RtuJumrUIsm3HjpMIUlz6zxADxQLW6SvsjgBnIjRr4Q';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storage:            window.localStorage,
  },
});

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) { console.error('getCurrentUser:', error.message); return null; }
  return user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) { console.error('getCurrentProfile:', error.message); return null; }
  return data;
}
