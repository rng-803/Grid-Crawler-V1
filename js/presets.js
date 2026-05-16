// Browser-local presets (localStorage): API connection + theme/character setup.

const LS_API_LAST = 'gridCrawler_apiLastSession';
const LS_API_PRESETS = 'gridCrawler_apiPresets';
const LS_THEME_LAST = 'gridCrawler_themeLastSession';
const LS_THEME_PRESETS = 'gridCrawler_themePresets';

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
  return presetsSafeParse(localStorage.getItem(LS_THEME_PRESETS) || '[]', []);
}

function saveThemePresetList(arr) {
  localStorage.setItem(LS_THEME_PRESETS, JSON.stringify(arr));
}

function getCurrentThemeFields() {
  return {
    theme: document.getElementById('game-theme').value.trim(),
    curseTypes: document.getElementById('game-curse-types').value.trim(),
    characterDesc: document.getElementById('game-char-desc').value.trim(),
  };
}

function applyThemeFields(o) {
  if (!o) return;
  const themeParts = [];
  if (o.theme != null && String(o.theme).trim()) themeParts.push(String(o.theme).trim());
  if (o.themeDetails != null && String(o.themeDetails).trim()) themeParts.push(String(o.themeDetails).trim());
  document.getElementById('game-theme').value = themeParts.join('\n\n');
  document.getElementById('game-curse-types').value = o.curseTypes != null ? o.curseTypes : '';
  document.getElementById('game-char-desc').value = o.characterDesc != null ? o.characterDesc : '';
}

function persistThemeLastSession() {
  try {
    localStorage.setItem(LS_THEME_LAST, JSON.stringify(getCurrentThemeFields()));
  } catch (_) { /* quota / privacy mode */ }
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

function saveCurrentApiPreset() {
  const suggestion = document.getElementById('api-preset-select').value || '';
  const nameInput = prompt('Name for this API preset:', suggestion);
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

function saveGameplayApiPreset() {
  syncGameplayModelToApiFields();
  const suggestion = document.getElementById('game-api-preset-select').value || '';
  const nameInput = prompt('Name for this API preset:', suggestion);
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
    applyThemeFields({
      theme: found.theme,
      themeDetails: found.themeDetails,
      curseTypes: found.curseTypes,
      characterDesc: found.characterDesc,
    });
    persistThemeLastSession();
  }
}

function saveCurrentThemePreset() {
  const suggestion = document.getElementById('theme-preset-select').value || '';
  const nameInput = prompt(
    'Name for this story preset (theme + curses + character):',
    suggestion,
  );
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

function restoreSessionsFromStorage() {
  const apiRaw = localStorage.getItem(LS_API_LAST);
  if (apiRaw) {
    const o = presetsSafeParse(apiRaw, null);
    if (o) applyApiFields(o);
  }
  const themeRaw = localStorage.getItem(LS_THEME_LAST);
  if (themeRaw) {
    const o = presetsSafeParse(themeRaw, null);
    if (o) applyThemeFields(o);
  }
  refreshApiPresetSelect();
  refreshThemePresetSelect();
  syncGameplayApiControlsFromFields();
}

function wirePresetAutosave() {
  const ids = ['api-key', 'api-url', 'api-model', 'game-api-model', 'game-theme', 'game-curse-types', 'game-char-desc'];
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
  restoreSessionsFromStorage();
  wirePresetAutosave();
});
