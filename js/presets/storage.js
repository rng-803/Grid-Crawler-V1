// Browser-local presets (localStorage): API connection + theme/character setup.
// Note: cloud persistence (Supabase) is intentionally disabled for now.
const ENABLE_CLOUD_THEME_SYNC = false;

const LS_API_LAST = 'gridCrawler_apiLastSession';
const LS_API_PRESETS = 'gridCrawler_apiPresets';
const LS_THEME_LAST = 'gridCrawler_themeLastSession';
const LS_THEME_PRESETS = 'gridCrawler_themePresets';
const LS_NARRATION_PROMPT_DEBUG = 'gridCrawler_narrationPromptDebug';
const LS_DEBUG_SETTINGS = 'gridCrawler_debugSettings';

let __themePresetCache = null;
let __themeLastCache = null;

// Mobile-safe modal prompt helpers (replaces native `prompt()` which can break backspace/delete on some mobile browsers).
function ensureGcModalStyles() {
  if (document.getElementById('gc-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'gc-modal-styles';
  style.textContent = `
    .gc-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
    .gc-modal{width:min(520px,100%);max-height:min(80vh,640px);overflow:auto;background:var(--panel,#000410);border:1px solid var(--border,#1a3250);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.8);padding:14px}
    .gc-modal h3{margin:0 0 8px 0;font-size:1.05rem;color:var(--gold,#ffbe1a);letter-spacing:.5px;text-transform:uppercase}
    .gc-modal p{margin:0 0 10px 0;color:var(--text,#eaeaff);opacity:.95}
    .gc-modal input,.gc-modal textarea{width:100%;background:rgba(255,255,255,.04);color:var(--text,#eaeaff);border:1px solid var(--border,#1a3250);border-radius:10px;padding:10px 10px;font-family:inherit;font-size:16px;outline:none}
    .gc-modal textarea{min-height:90px;resize:vertical}
    .gc-modal .gc-modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
    .gc-modal .gc-modal-actions .btn{margin:0}
    .gc-modal .gc-modal-actions .btn.btn-continue{flex:0 0 auto}
    .gc-modal .gc-modal-actions .btn.btn-dir{flex:0 0 auto}
  `;
  document.head.appendChild(style);
}

function gcModalTextPrompt({ title, message, defaultValue = '', placeholder = '' } = {}) {
  ensureGcModalStyles();
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'gc-modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'gc-modal';
    modal.innerHTML = `
      <h3></h3>
      <p></p>
      <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="gc-modal-actions">
        <button type="button" class="btn btn-dir">Cancel</button>
        <button type="button" class="btn btn-continue">Save</button>
      </div>
    `;
    const [h3, p, input] = modal.querySelectorAll('h3, p, input');
    const [btnCancel, btnOk] = modal.querySelectorAll('button');
    h3.textContent = title || 'Input';
    p.textContent = message || '';
    input.value = defaultValue == null ? '' : String(defaultValue);
    input.placeholder = placeholder || '';

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    };

    const finish = (value) => {
      cleanup();
      resolve(value);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        btnOk.click();
      }
    };

    btnCancel.addEventListener('click', () => finish(null));
    btnOk.addEventListener('click', () => {
      const trimmed = String(input.value || '').trim();
      finish(trimmed ? trimmed : null);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(null);
    });

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKeyDown, true);

    // iOS/Safari: delay focus to ensure keyboard + editing works reliably.
    setTimeout(() => {
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  });
}

function presetsSafeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadApiPresetList() {
  return presetsSafeParse(localStorage.getItem(LS_API_PRESETS) || '[]', []);
}

function saveApiPresetList(arr) {
  localStorage.setItem(LS_API_PRESETS, JSON.stringify(arr));
}

function getCurrentApiFields() {
  return {
    apiKey: document.getElementById('api-key').value,
    apiUrl: document.getElementById('api-url').value.trim(),
    model: document.getElementById('api-model').value.trim(),
  };
}

function applyApiFields(o) {
  if (!o) return;
  const keyEl = document.getElementById('api-key');
  const urlEl = document.getElementById('api-url');
  const modelEl = document.getElementById('api-model');
  if (o.apiKey != null) keyEl.value = o.apiKey;
  if (o.apiUrl != null) urlEl.value = o.apiUrl;
  if (o.model != null) modelEl.value = o.model;
  syncGameplayApiControlsFromFields();
}

function persistApiLastSession() {
  try {
    localStorage.setItem(LS_API_LAST, JSON.stringify(getCurrentApiFields()));
  } catch (_) { /* quota / privacy mode */ }
}

function loadThemePresetList() {
  if (Array.isArray(__themePresetCache)) return __themePresetCache;
  __themePresetCache = presetsSafeParse(localStorage.getItem(LS_THEME_PRESETS) || '[]', []);
  return __themePresetCache;
}

function saveThemePresetList(arr) {
  __themePresetCache = Array.isArray(arr) ? arr : [];
  try {
    localStorage.setItem(LS_THEME_PRESETS, JSON.stringify(__themePresetCache));
  } catch (_) { /* quota / privacy mode */ }
  queueRemoteThemeSave();
}

function getCurrentThemeFields() {
  return {
    setting: document.getElementById('game-setting').value.trim(),
    themeDetails: document.getElementById('game-theme-details').value.trim(),
    enemyDetails: document.getElementById('game-enemy-details').value.trim(),
    curseDetails: document.getElementById('game-curse-details').value.trim(),
    townNpcDetails: document.getElementById('game-town-npc-details').value.trim(),
    characterDesc: document.getElementById('game-char-desc').value.trim(),
  };
}

function applyThemeFields(o) {
  if (!o) return;
  document.getElementById('game-setting').value = o.setting != null ? o.setting : '';
  document.getElementById('game-theme-details').value = o.themeDetails != null
    ? o.themeDetails
    : (o.theme != null ? o.theme : '');
  document.getElementById('game-enemy-details').value = o.enemyDetails != null ? o.enemyDetails : '';
  document.getElementById('game-curse-details').value = o.curseDetails != null
    ? o.curseDetails
    : (o.curseTypes != null ? o.curseTypes : '');
  document.getElementById('game-town-npc-details').value = o.townNpcDetails != null ? o.townNpcDetails : '';
  document.getElementById('game-char-desc').value = o.characterDesc != null ? o.characterDesc : '';
  if (typeof syncAdvancedSetupVisibility === 'function') syncAdvancedSetupVisibility();
}

function persistThemeLastSession() {
  __themeLastCache = getCurrentThemeFields();
  try {
    localStorage.setItem(LS_THEME_LAST, JSON.stringify(__themeLastCache));
  } catch (_) { /* quota / privacy mode */ }
  queueRemoteThemeSave();
}

function getCurrentDebugSettings() {
  return {
    imagePromptFormat: typeof IMAGE_PROMPT_FORMAT === 'string' ? IMAGE_PROMPT_FORMAT : 'structured',
    debugInfiniteHealth: Boolean(DEBUG_INFINITE_HEALTH),
    debugWinAllEncounters: Boolean(DEBUG_WIN_ALL_ENCOUNTERS),
    debugLoseAllEncounters: Boolean(DEBUG_LOSE_ALL_ENCOUNTERS),
    nonNarration: Boolean(NONARRATION),
  };
}

function applyDebugSettings(settings) {
  if (!settings) return;
  if (settings.imagePromptFormat != null) {
    IMAGE_PROMPT_FORMAT = String(settings.imagePromptFormat) === 'danbooru' ? 'danbooru' : 'structured';
  }
  if (settings.debugInfiniteHealth != null) DEBUG_INFINITE_HEALTH = Boolean(settings.debugInfiniteHealth);
  if (settings.debugWinAllEncounters != null) DEBUG_WIN_ALL_ENCOUNTERS = Boolean(settings.debugWinAllEncounters);
  if (settings.debugLoseAllEncounters != null) DEBUG_LOSE_ALL_ENCOUNTERS = Boolean(settings.debugLoseAllEncounters);
  if (settings.nonNarration != null) NONARRATION = Boolean(settings.nonNarration);
  if (typeof syncDebugMenuControls === 'function') syncDebugMenuControls();
  if (typeof updateImagePromptFormatNote === 'function') updateImagePromptFormatNote();
}

function persistDebugSettings() {
  try {
    localStorage.setItem(LS_DEBUG_SETTINGS, JSON.stringify(getCurrentDebugSettings()));
  } catch (_) { /* quota / privacy mode */ }
}

function queueRemoteThemeSave() {
  if (!ENABLE_CLOUD_THEME_SYNC) return;
  if (!window.GC_THEME_STORE || typeof window.GC_THEME_STORE.queueSave !== 'function') return;
  // Only theme settings: story presets + last session theme fields.
  window.GC_THEME_STORE.queueSave({
    themeLast: __themeLastCache || getCurrentThemeFields(),
    themePresets: loadThemePresetList(),
  });
}

function refreshApiPresetSelect() {
  const sel = document.getElementById('api-preset-select');
  if (!sel) return;
  const previous = sel.value;
  sel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— choose a preset —';
  sel.appendChild(placeholder);
  for (const p of loadApiPresetList()) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  if ([...sel.options].some(o => o.value === previous)) sel.value = previous;
  refreshGameplayApiPresetSelect();
}

function refreshGameplayApiPresetSelect() {
  const sel = document.getElementById('game-api-preset-select');
  if (!sel) return;
  const previous = sel.value;
  sel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— choose a preset —';
  sel.appendChild(placeholder);
  for (const p of loadApiPresetList()) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  if ([...sel.options].some(o => o.value === previous)) sel.value = previous;
}

function syncGameplayApiControlsFromFields() {
  const gameModelEl = document.getElementById('game-api-model');
  const setupModelEl = document.getElementById('api-model');
  if (gameModelEl && setupModelEl) gameModelEl.value = setupModelEl.value.trim();
  refreshGameplayApiPresetSelect();
}

function syncGameplayModelToApiFields() {
  const gameModelEl = document.getElementById('game-api-model');
  const setupModelEl = document.getElementById('api-model');
  if (!gameModelEl || !setupModelEl) return;
  setupModelEl.value = gameModelEl.value.trim();
  persistApiLastSession();
}

function escapePresetLogText(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function refreshThemePresetSelect() {
  const sel = document.getElementById('theme-preset-select');
  if (!sel) return;
  const previous = sel.value;
  sel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— choose a preset —';
  sel.appendChild(placeholder);
  for (const p of loadThemePresetList()) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  if ([...sel.options].some(o => o.value === previous)) sel.value = previous;
}

function applySelectedApiPreset() {
  const name = document.getElementById('api-preset-select').value;
  if (!name) return;
  const found = loadApiPresetList().find((p) => p.name === name);
  if (found) {
    applyApiFields({ apiKey: found.apiKey, apiUrl: found.apiUrl, model: found.model });
    persistApiLastSession();
    syncGameplayApiControlsFromFields();
  }
}

function applySelectedGameplayApiPreset() {
  const name = document.getElementById('game-api-preset-select').value;
  if (!name) return;
  const found = loadApiPresetList().find((p) => p.name === name);
  if (!found) return;
  applyApiFields({ apiKey: found.apiKey, apiUrl: found.apiUrl, model: found.model });
  persistApiLastSession();
  if (typeof G !== 'undefined' && G && typeof addLog === 'function') {
    const presetName = escapePresetLogText(found.name);
    const modelName = escapePresetLogText(found.model || 'no model set');
    addLog(`<span class="info-txt">Narrator API preset changed to <em>${presetName}</em>. Future narration will use <em>${modelName}</em>.</span>`, 'event-neutral');
  }
}

async function saveCurrentApiPreset() {
  const suggestion = document.getElementById('api-preset-select').value || '';
  const nameInput = await gcModalTextPrompt({
    title: 'Save API Preset',
    message: 'Name for this API preset:',
    defaultValue: suggestion,
    placeholder: 'e.g. OpenRouter · GPT-4o-mini',
  });
  if (!nameInput || !String(nameInput).trim()) return;
  const trimmed = String(nameInput).trim();
  const fields = getCurrentApiFields();
  let list = loadApiPresetList();
  const ix = list.findIndex((p) => p.name === trimmed);
  const entry = { name: trimmed, ...fields };
  if (ix >= 0) list[ix] = entry;
  else list.push(entry);
  saveApiPresetList(list);
  refreshApiPresetSelect();
  document.getElementById('api-preset-select').value = trimmed;
  const gameplaySel = document.getElementById('game-api-preset-select');
  if (gameplaySel) gameplaySel.value = trimmed;
  persistApiLastSession();
}

async function saveGameplayApiPreset() {
  syncGameplayModelToApiFields();
  const suggestion = document.getElementById('game-api-preset-select').value || '';
  const nameInput = await gcModalTextPrompt({
    title: 'Save API Preset',
    message: 'Name for this API preset:',
    defaultValue: suggestion,
    placeholder: 'e.g. Narrator (cheap/fast)',
  });
  if (!nameInput || !String(nameInput).trim()) return;
  const trimmed = String(nameInput).trim();
  const fields = getCurrentApiFields();
  let list = loadApiPresetList();
  const ix = list.findIndex((p) => p.name === trimmed);
  const entry = { name: trimmed, ...fields };
  if (ix >= 0) list[ix] = entry;
  else list.push(entry);
  saveApiPresetList(list);
  refreshApiPresetSelect();
  const setupSel = document.getElementById('api-preset-select');
  if (setupSel) setupSel.value = trimmed;
  document.getElementById('game-api-preset-select').value = trimmed;
  persistApiLastSession();
}

function deleteSelectedApiPreset() {
  const sel = document.getElementById('api-preset-select');
  const name = sel.value;
  if (!name) return;
  if (!confirm(`Delete API preset "${name}"?`)) return;
  saveApiPresetList(loadApiPresetList().filter((p) => p.name !== name));
  refreshApiPresetSelect();
}

function applySelectedThemePreset() {
  const name = document.getElementById('theme-preset-select').value;
  if (!name) return;
  const found = loadThemePresetList().find((p) => p.name === name);
  if (found) {
    applyThemeFields(found);
    persistThemeLastSession();
  }
}

async function saveCurrentThemePreset() {
  const suggestion = document.getElementById('theme-preset-select').value || '';
  const nameInput = await gcModalTextPrompt({
    title: 'Save Story Preset',
    message: 'Name for this story preset (setting + theme + details + character):',
    defaultValue: suggestion,
    placeholder: 'e.g. Cyber-noir · The Drowned Megacity',
  });
  if (!nameInput || !String(nameInput).trim()) return;
  const trimmed = String(nameInput).trim();
  const fields = getCurrentThemeFields();
  let list = loadThemePresetList();
  const ix = list.findIndex((p) => p.name === trimmed);
  const entry = { name: trimmed, ...fields };
  if (ix >= 0) list[ix] = entry;
  else list.push(entry);
  saveThemePresetList(list);
  refreshThemePresetSelect();
  document.getElementById('theme-preset-select').value = trimmed;
  persistThemeLastSession();
}

function deleteSelectedThemePreset() {
  const sel = document.getElementById('theme-preset-select');
  const name = sel.value;
  if (!name) return;
  if (!confirm(`Delete story preset "${name}"?`)) return;
  saveThemePresetList(loadThemePresetList().filter((p) => p.name !== name));
  refreshThemePresetSelect();
}

async function restoreSessionsFromStorage() {
  const apiRaw = localStorage.getItem(LS_API_LAST);
  if (apiRaw) {
    const o = presetsSafeParse(apiRaw, null);
    if (o) applyApiFields(o);
  }
  const themeRaw = localStorage.getItem(LS_THEME_LAST);
  if (themeRaw) {
    const o = presetsSafeParse(themeRaw, null);
    if (o) applyThemeFields(o);
    __themeLastCache = o;
  }
  const themePresetsRaw = localStorage.getItem(LS_THEME_PRESETS);
  if (themePresetsRaw) __themePresetCache = presetsSafeParse(themePresetsRaw, []);
  const debugSettingsRaw = localStorage.getItem(LS_DEBUG_SETTINGS);
  if (debugSettingsRaw) {
    const debugSettings = presetsSafeParse(debugSettingsRaw, null);
    if (debugSettings) applyDebugSettings(debugSettings);
  }

  refreshApiPresetSelect();
  refreshThemePresetSelect();
  syncGameplayApiControlsFromFields();
  if (typeof syncNarrationPromptDebugButton === 'function') {
    syncNarrationPromptDebugButton();
  }

  // Seed Image API defaults from Narrator API fields (non-persistent for now).
  const imageUrlEl = document.getElementById('image-api-url');
  const mainUrlEl = document.getElementById('api-url');
  if (imageUrlEl && mainUrlEl && !String(imageUrlEl.value || '').trim()) {
    imageUrlEl.value = mainUrlEl.value.trim();
  }

  // Optional cloud theme sync (currently disabled): if enabled, load remote theme state and override local.
  if (!ENABLE_CLOUD_THEME_SYNC) return;
  if (window.GC_THEME_STORE && typeof window.GC_THEME_STORE.loadThemeState === 'function') {
    try {
      const remote = await window.GC_THEME_STORE.loadThemeState();
      if (remote) {
        if (remote.themeLast) {
          __themeLastCache = remote.themeLast;
          applyThemeFields(remote.themeLast);
          try { localStorage.setItem(LS_THEME_LAST, JSON.stringify(remote.themeLast)); } catch (_) {}
        }
        if (Array.isArray(remote.themePresets)) {
          __themePresetCache = remote.themePresets;
          try { localStorage.setItem(LS_THEME_PRESETS, JSON.stringify(remote.themePresets)); } catch (_) {}
          refreshThemePresetSelect();
        }
      }
    } catch (_) {
      // ignore; local storage remains available
    }
  }
}

function wirePresetAutosave() {
  const ids = [
    'api-key',
    'api-url',
    'api-model',
    'game-api-model',
    'game-setting',
    'game-theme-details',
    'game-enemy-details',
    'game-curse-details',
    'game-town-npc-details',
    'game-char-desc',
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const handler = () => {
      if (id === 'game-api-model') syncGameplayModelToApiFields();
      else if (id.startsWith('api-')) {
        persistApiLastSession();
        syncGameplayApiControlsFromFields();
      }
      else persistThemeLastSession();
    };
    el.addEventListener('change', handler);
    el.addEventListener('blur', handler);
    if (id === 'game-api-model' || id === 'api-model') {
      el.addEventListener('input', handler);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // async (restore local sessions) but safe to fire-and-forget
  restoreSessionsFromStorage();
  wirePresetAutosave();
});
