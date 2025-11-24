// assets/js/auth.js
// assets/js/auth.js
import supabase from './supabaseClient.js';

/**
 * small UUID fallback for older browsers
 */
function genUuidFallback() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}
function makeUuid() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : genUuidFallback();
}

/**
 * signUp
 * - creates the auth user via Supabase Auth
 * - upserts parents row (fills name & password when possible)
 *
 * NOTE: password is saved plaintext here (for development). Replace with hashed password via an Edge Function for production.
 */
export async function signUp(name, email, password) {
  // 1) create auth user
  const { data: signData, error: signErr } = await supabase.auth.signUp({
    email,
    password,
    // optionally store name in user metadata so onAuthStateChange can pick it up
    options: { data: { full_name: name } }
  });

  if (signErr) {
    console.error('signUp error:', signErr);
    throw signErr;
  }

  // 2) get user (if confirm-email is OFF you'll usually have it immediately)
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) console.warn('getUser warning after signUp:', userErr);

  const user = userData?.user;

  // If no session/user yet (confirm-email ON) return signData; initAuthListener will handle upsert later
  if (!user) return signData;

  // 3) upsert parents row (will update if trigger already created)
  // If you have RLS policies, ensure they allow the logged in user to upsert their row.
  const { error: pErr } = await supabase
    .from('parents')
    .upsert([{
      id: user.id,
      email: user.email,
      name: name,
      password: password, // plaintext for now - secure this in production
      family_key: makeUuid()
    }], { onConflict: 'id' });

  if (pErr) {
    console.error('parents upsert error:', pErr);
    throw pErr;
  }

  return signData;
}

/**
 * signIn
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) {
    console.error('signIn error:', error);
    throw error;
  }
  return data;
}

/**
 * signOut
 */
export async function signOut() {
  await supabase.auth.signOut();
  // cleanup client state
  try { localStorage.removeItem('active_child_id'); } catch (e) {}
  // redirect to login page (adjust if needed)
  window.location.href = 'index.html';
}

/**
 * getSessionUser — returns the currently authenticated user, or null
 */
export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * initAuthListener
 * - Call once when your app loads.
 * - If a session appears (e.g., confirm-email flow or fresh login), this will upsert the parents row using metadata.full_name (if available).
 * - It returns the unsubscribe function from Supabase's listener.
 */
export function initAuthListener(onChangeCallback = null) {
  const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      const user = session?.user ?? null;
      if (onChangeCallback) onChangeCallback(event, session);

      if (!user) return;

      // try to read name from user metadata (we set it during signUp via options.data)
      const metaName = user.user_metadata?.full_name ?? null;

      // Upsert parents row to ensure it exists and fill name if available.
      // Note: we cannot retrieve the user's plaintext password here (for security) so we only set name/email/family_key.
      const { error: pErr } = await supabase
        .from('parents')
        .upsert([{
          id: user.id,
          email: user.email,
          name: metaName,
          family_key: makeUuid()
        }], { onConflict: 'id' });

      if (pErr) {
        // If RLS blocks this, make sure policies allow the user to upsert their own row.
        console.warn('initAuthListener parents upsert error:', pErr);
      } else {
        console.log('parents upserted in initAuthListener for', user.id);
      }
    } catch (err) {
      console.error('auth listener error:', err);
    }
  });

  // return unsubscribe function
  return () => sub?.subscription?.unsubscribe?.();
}
