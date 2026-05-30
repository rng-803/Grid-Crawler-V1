// Theme settings persistence in Supabase.
//
// Stores ONLY theme-related state (story presets + last session fields).
// API presets/keys remain browser-local.
(function () {
  const TABLE = 'theme_settings';

  async function getUserId() {
    const session = await (window.GC_SUPABASE && window.GC_SUPABASE.ensureSession
      ? window.GC_SUPABASE.ensureSession()
      : null);
    return session && session.user && session.user.id ? session.user.id : null;
  }

  async function loadThemeState() {
    const client = window.GC_SUPABASE && window.GC_SUPABASE.getClient ? window.GC_SUPABASE.getClient() : null;
    if (!client) return null;
    const userId = await getUserId();
    if (!userId) return null;

    const { data, error } = await client
      .from(TABLE)
      .select('theme_last,theme_presets')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return null;
    if (!data) return { themeLast: null, themePresets: [] };
    return {
      themeLast: data.theme_last || null,
      themePresets: Array.isArray(data.theme_presets) ? data.theme_presets : [],
    };
  }

  async function saveThemeState({ themeLast, themePresets }) {
    const client = window.GC_SUPABASE && window.GC_SUPABASE.getClient ? window.GC_SUPABASE.getClient() : null;
    if (!client) return { ok: false, error: 'Supabase not available' };
    const userId = await getUserId();
    if (!userId) return { ok: false, error: 'No session' };

    const payload = {
      user_id: userId,
      theme_last: themeLast || null,
      theme_presets: Array.isArray(themePresets) ? themePresets : [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from(TABLE)
      .upsert(payload, { onConflict: 'user_id' });

    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true };
  }

  // Debounced saver to avoid writing on every keystroke/blur.
  let saveTimer = null;
  let lastQueued = null;
  function queueSave(nextState, delayMs = 600) {
    lastQueued = nextState;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const toSave = lastQueued;
      lastQueued = null;
      try {
        await saveThemeState(toSave);
      } catch (_) {
        // ignore: keep local storage as fallback
      }
    }, delayMs);
  }

  window.GC_THEME_STORE = {
    loadThemeState,
    saveThemeState,
    queueSave,
  };
})();

