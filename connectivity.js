// HTTP calls to the chat API (OpenAI-compatible).

let API_TIMING_LOG = [];

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function resetApiTimingLog(sessionLabel = '') {
  API_TIMING_LOG = [];
  if (sessionLabel) {
    API_TIMING_LOG.push({ label: `session:${sessionLabel}`, durationMs: 0, kind: 'session-start' });
  }
}

function recordApiTiming(entry) {
  API_TIMING_LOG.push({
    label: entry.label || 'api-call',
    durationMs: Number(entry.durationMs || 0),
    kind: entry.kind || 'request',
    ok: entry.ok !== false,
    extra: entry.extra || '',
  });
}

function getApiTimingLog() {
  return API_TIMING_LOG.map((entry) => ({ ...entry }));
}

function formatApiTimingLog() {
  return API_TIMING_LOG.map((entry) => {
    const duration = `${entry.durationMs.toFixed(1)} ms`;
    const status = entry.ok === false ? 'ERROR' : 'OK';
    const extra = entry.extra ? ` | ${entry.extra}` : '';
    return `${entry.kind} | ${entry.label} | ${duration} | ${status}${extra}`;
  }).join('\n');
}

function getApiFromDom() {
  return {
    apiKey: document.getElementById('api-key').value.trim(),
    apiUrl: document.getElementById('api-url').value.trim(),
    model: document.getElementById('api-model').value.trim(),
  };
}

// async function chatCompletion(userContent, onChunk) {
//   const { apiKey, apiUrl, model } = getApiFromDom();
//   if (!apiKey) throw new Error('API key required');

//   const body = {
//     model,
//     messages: [{ role: 'user', content: userContent }],
//     stream: true // Enable streaming
//   };

//   const response = await fetch(`${apiUrl}/chat/completions`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': `Bearer ${apiKey}`
//     },
//     body: JSON.stringify(body)
//   });

//   if (!response.ok) throw new Error(`API Error: ${response.status}`);

//   // Read the streaming response
//   const reader = response.body.getReader();
//   const decoder = new TextDecoder('utf-8');
//   let fullText = '';

//   while (true) {
//     const { done, value } = await reader.read();
//     if (done) break;
    
//     const chunk = decoder.decode(value, { stream: true });
//     const lines = chunk.split('\n').filter(line => line.trim() !== '');
    
//     for (const line of lines) {
//       if (line.replace(/^data: /, '').trim() === '[DONE]') return fullText;
      
//       if (line.startsWith('data: ')) {
//         const parsed = JSON.parse(line.replace(/^data: /, ''));
//         const content = parsed.choices[0].delta.content;
//         if (content) {
//           fullText += content;
//           onChunk(content); // Callback to update your game UI immediately
//         }
//       }
//     }
//   }
//   return fullText;
// }
async function chatCompletion(userContent, options = {}) {
  const { apiKey, apiUrl, model } = getApiFromDom();
  if (!apiKey) throw new Error('API key required');
  const startedAt = nowMs();
  const label = options.label || 'chatCompletion';

  const body = {
    model,
    messages: [{ role: 'user', content: userContent }],
  };
  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  try {
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
    recordApiTiming({
      label,
      durationMs: nowMs() - startedAt,
      ok: true,
      extra: model ? `model=${model}` : '',
    });
    return data.choices[0].message.content;
  } catch (err) {
    recordApiTiming({
      label,
      durationMs: nowMs() - startedAt,
      ok: false,
      extra: err.message || 'request failed',
    });
    throw err;
  }
}

async function generateNarration(aiContext, promptText) {
  const fullPrompt = buildNarratorFullPrompt(aiContext, promptText);
  try {
    const { apiKey } = getApiFromDom();
    if (!apiKey) return null;
    return await chatCompletion(fullPrompt, { label: 'narration' });
  } catch (err) {
    console.error("Narration error:", err);
    return null;
  }
}

async function generatePhysicalDescription(promptText) {
  try {
    const { apiKey } = getApiFromDom();
    if (!apiKey) return null;
    return await chatCompletion(promptText, { label: 'physicalDescription' });
  } catch (err) {
    console.error("Physical description error:", err);
    return null;
  }
}

async function fetchGridNamingPromptJson(prompt, label = 'namingPrompt') {
  return await chatCompletion(prompt, {
    responseFormat: { type: "json_object" },
    label,
  });
}
