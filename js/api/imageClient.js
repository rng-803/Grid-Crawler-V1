// HTTP calls to an OpenAI-compatible Images API.

function getImageApiFromDom() {
  const urlEl = document.getElementById('image-api-url');
  const keyEl = document.getElementById('image-api-key');
  const modelEl = document.getElementById('image-api-model');
  const sizeEl = document.getElementById('image-api-size');

  const fallback = typeof getApiFromDom === 'function' ? getApiFromDom() : { apiKey: '', apiUrl: '', model: '' };

  return {
    apiUrl: (urlEl && urlEl.value && urlEl.value.trim()) ? urlEl.value.trim() : fallback.apiUrl,
    apiKey: (keyEl && keyEl.value && keyEl.value.trim()) ? keyEl.value.trim() : fallback.apiKey,
    model: (modelEl && modelEl.value && modelEl.value.trim()) ? modelEl.value.trim() : '',
    size: (sizeEl && sizeEl.value) ? sizeEl.value : '1024x1024',
  };
}

async function imageGeneration(promptText, options = {}) {
  const { apiUrl, apiKey, model, size } = getImageApiFromDom();
  if (!apiUrl) throw new Error('Image API base URL required');
  if (!apiKey) throw new Error('Image API key required');
  if (!model) throw new Error('Image model required');

  const body = {
    model,
    prompt: promptText,
    size: options.size || size,
    n: 1,
    response_format: 'b64_json',
  };

  const response = await fetch(`${apiUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Image API Error: ${response.status}`);
  const data = await response.json();
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error('Image API response missing b64_json');
  return { b64, model };
}

