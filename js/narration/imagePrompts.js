// Image prompt generation templates (no network I/O).

const IMAGE_PROMPT_SYSTEM_BASE =
  'You are an assistant generating detailed prompts for AI image generation.';

const IMAGE_PROMPT_SYSTEM_STRUCTURED = `${IMAGE_PROMPT_SYSTEM_BASE}
Return a compact, structured natural-language prompt (not tags).
Keep it suitable for SDXL/Flux-style models: subject first, then key details (outfit, equipment, body, mood), then lighting/style/background.
Do not include disclaimers or meta commentary.`;

const IMAGE_PROMPT_SYSTEM_DANBOORU = `${IMAGE_PROMPT_SYSTEM_BASE}
Return ONLY comma-separated danbooru-style tags (no prose, no sentences).
Use short tags and common conventions (underscores instead of spaces). Prefer concrete visual tags.
Avoid parenthetical explanations. Do not include disclaimers or meta commentary.`;

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function buildImagePromptSystem(format) {
  const fmt = String(format || '').toLowerCase();
  if (fmt === 'danbooru') return IMAGE_PROMPT_SYSTEM_DANBOORU;
  return IMAGE_PROMPT_SYSTEM_STRUCTURED;
}

function buildCharacterContextForImagePrompt({ equippedItems = [], curses = [] } = {}) {
  const items = Array.isArray(equippedItems) ? equippedItems : [];
  const statuses = Array.isArray(curses) ? curses : [];

  const equippedText = items.length
    ? `Equipped items: ${items.map(i => `${i.name}${i.desc ? ` (${i.desc})` : ''}`).join(', ')}`
    : 'Equipped items: none';

  const curseText = statuses.length
    ? `Curses/status effects: ${statuses.map(s => `${s.name}${s.attribute ? ` (${s.attribute} ${s.magnitude})` : ''}`).join(', ')}`
    : 'Curses/status effects: none';

  return `${equippedText}\n${curseText}`.trim();
}

function buildImagePromptGenerationPrompt({
  format,
  storyContext,
  characterContext,
  previousDescription,
  maxTokens,
} = {}) {
  const sys = buildImagePromptSystem(format);
  const story = normalizeWhitespace(storyContext || '');
  const charCtx = String(characterContext || '').trim();
  const prev = String(previousDescription || '').trim();
  const maxTok = Math.max(64, Math.min(1024, Number(maxTokens) || 350));

  return `SYSTEM PROMPT (obey first):
${sys}

TASK:
- Generate an image-generation prompt for the CURRENT moment of the story.
- Use the previous description as the base, and modify it to match the current state (items + curses).
- Keep the result short and model-friendly (aim for <= ${maxTok} tokens).

STORY CONTEXT (recent slice):
${story || 'none'}

CHARACTER CONTEXT (current state):
${charCtx || 'none'}

PREVIOUS CHARACTER DESCRIPTION (base to modify):
${prev || 'none'}

OUTPUT:
Return only the final image prompt in the requested format.`;
}

