// HTTP calls to the chat API (OpenAI-compatible).

function getApiFromDom() {
  return {
    apiKey: document.getElementById('api-key').value.trim(),
    apiUrl: document.getElementById('api-url').value.trim(),
    model: document.getElementById('api-model').value.trim(),
  };
}

async function chatCompletion(userContent, options = {}) {
  const { apiKey, apiUrl, model } = getApiFromDom();
  if (!apiKey) throw new Error('API key required');

  const body = {
    model,
    messages: [{ role: 'user', content: userContent }],
  };
  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateNarration(aiContext, promptText) {
  const fullPrompt = buildNarratorFullPrompt(aiContext, promptText);
  try {
    const { apiKey } = getApiFromDom();
    if (!apiKey) return null;
    return await chatCompletion(fullPrompt);
  } catch (err) {
    console.error("Narration error:", err);
    return null;
  }
}

async function generatePhysicalDescription(promptText) {
  try {
    const { apiKey } = getApiFromDom();
    if (!apiKey) return null;
    return await chatCompletion(promptText);
  } catch (err) {
    console.error("Physical description error:", err);
    return null;
  }
}

async function fetchGridNamingJson(theme, curseTypes, charDesc, manifest) {
  const prompt = buildGridNamingPrompt(theme, curseTypes, charDesc, manifest);
  return await chatCompletion(prompt, { responseFormat: { type: "json_object" } });
}

async function fetchGridNamingPromptJson(prompt) {
  return await chatCompletion(prompt, { responseFormat: { type: "json_object" } });
}
