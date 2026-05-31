// Image prompt helpers (no network I/O).

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildImagePromptStructured(ctx) {
  const theme = normalizeWhitespace(ctx.theme || '');
  const base = normalizeWhitespace(ctx.characterDesc || '');
  const appearance = normalizeWhitespace(ctx.physicalDescription || '');

  const subject = appearance || base || 'a fantasy adventurer';
  const themeLine = theme ? `Theme: ${theme}` : '';

  return [
    'Subject:',
    `- ${subject}`,
    themeLine ? '' : null,
    themeLine ? themeLine : null,
    '',
    'Composition:',
    '- full body, centered, readable silhouette',
    'Style:',
    '- high detail, crisp linework, cinematic lighting, sharp focus',
    'Background:',
    '- simple, theme-appropriate environment, not cluttered',
    'Quality:',
    '- highres, detailed textures',
  ].filter(Boolean).join('\n');
}

function extractSimpleTags(text) {
  const t = String(text || '').toLowerCase();
  const tags = new Set();

  const maybeAdd = (cond, tag) => { if (cond) tags.add(tag); };

  maybeAdd(t.includes('cloak'), 'cloak');
  maybeAdd(t.includes('hood'), 'hood');
  maybeAdd(t.includes('robe'), 'robe');
  maybeAdd(t.includes('armor') || t.includes('armour'), 'armor');
  maybeAdd(t.includes('leather'), 'leather_armor');
  maybeAdd(t.includes('plate'), 'plate_armor');
  maybeAdd(t.includes('sword'), 'sword');
  maybeAdd(t.includes('dagger'), 'dagger');
  maybeAdd(t.includes('bow'), 'bow_(weapon)');
  maybeAdd(t.includes('staff'), 'staff');
  maybeAdd(t.includes('shield'), 'shield');
  maybeAdd(t.includes('helmet'), 'helmet');
  maybeAdd(t.includes('gloves'), 'gloves');
  maybeAdd(t.includes('boots'), 'boots');
  maybeAdd(t.includes('cape'), 'cape');
  maybeAdd(t.includes('mask'), 'mask');
  maybeAdd(t.includes('scar'), 'scar');

  return [...tags];
}

function buildImagePromptDanbooru(ctx) {
  const theme = normalizeWhitespace(ctx.theme || '').toLowerCase();
  const base = normalizeWhitespace(ctx.characterDesc || '').toLowerCase();
  const appearance = normalizeWhitespace(ctx.physicalDescription || '').toLowerCase();
  const text = `${theme} ${base} ${appearance}`.trim();

  const tags = new Set([
    'solo',
    'full_body',
    'fantasy',
    'adventurer',
    'highres',
    'detailed',
    'cinematic_lighting',
    'sharp_focus',
  ]);

  for (const tag of extractSimpleTags(text)) tags.add(tag);
  if (text.includes('gothic')) tags.add('gothic');
  if (text.includes('sci-fi') || text.includes('scifi') || text.includes('science fiction')) tags.add('science_fiction');

  return [...tags].join(', ');
}

function buildImagePromptFromContext(ctx, format) {
  const fmt = String(format || '').toLowerCase();
  if (fmt === 'danbooru') return buildImagePromptDanbooru(ctx);
  return buildImagePromptStructured(ctx);
}

