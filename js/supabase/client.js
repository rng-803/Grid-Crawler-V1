// Supabase browser client (UMD build) + lightweight session helper.
// This project is plain HTML/JS (no bundler), so we use the CDN UMD global `supabase`.
//
// IMPORTANT: The key used here is a publishable/anon key (safe to ship to browsers).
(function () {
  const SUPABASE_URL = 'https://mwtseghrpbstyojrxyja.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Gm7DRbXOJYvPNce830JDtQ_h64lR4yT';

  function getClient() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    if (!window.__gcSupabaseClient) {
      window.__gcSupabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
      );
    }
    return window.__gcSupabaseClient;
  }

  async function ensureSession() {
    const client = getClient();
    if (!client) return null;

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data && data.session) return data.session;
    } catch (_) {
      // Continue to anonymous sign-in attempt below.
    }

    if (client.auth && typeof client.auth.signInAnonymously === 'function') {
      try {
        const { data, error } = await client.auth.signInAnonymously();
        if (error) throw error;
        return data && data.session ? data.session : null;
      } catch (_) {
        return null;
      }
    }

    return null;
  }

  window.GC_SUPABASE = {
    getClient,
    ensureSession,
  };
})();
