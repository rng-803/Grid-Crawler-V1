// HTTP calls to the chat API (OpenAI-compatible).

function getApiFromDom() {
  return {
    apiKey: document.getElementById('api-key').value.trim(),
    apiUrl: document.getElementById('api-url').value.trim(),
    model: document.getElementById('api-model').value.trim(),
  };
}

// with streaming:
async function chatCompletion(userContent, options = {}) {
  const { apiKey, apiUrl, model } = getApiFromDom();
  if (!apiKey) throw new Error('API key required');

  const shouldStream = Boolean(options.stream && options.onChunk);

  const body = {
    model,
    messages: [{ role: 'user', content: userContent }],
    stream: shouldStream
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

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`API Error: ${response.status} ${errorText}`);
  }

  // Non-streaming mode: keep your current behavior
  if (!shouldStream) {
    const data = await response.json();
    return data.choices[0].message.content;
  }

  // Streaming mode
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');

    // Keep last partial line in buffer.
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || !trimmed.startsWith('data:')) {
        continue;
      }

      const data = trimmed.replace(/^data:\s*/, '');

      if (data === '[DONE]') {
        return fullText;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;

        if (content) {
          fullText += content;
          options.onChunk(content, fullText);
        }
      } catch (err) {
        console.warn('Could not parse streamed chunk:', data, err);
      }
    }
  }

  return fullText;
}
async function generateNarration(aiContext, promptText, onChunk) {
  const fullPrompt = buildNarratorFullPrompt(aiContext, promptText);

  try {
    const { apiKey } = getApiFromDom();
    if (!apiKey) return null;

    return await chatCompletion(fullPrompt, {
      stream: Boolean(onChunk),
      onChunk
    });
  } catch (err) {
    console.error("Narration error:", err);
    return null;
  }
}

// async function chatCompletion(userContent, options = {}) {
//   const { apiKey, apiUrl, model } = getApiFromDom();
//   if (!apiKey) throw new Error('API key required');

//   const body = {
//     model,
//     messages: [{ role: 'user', content: userContent }],
//   };
//   if (options.responseFormat) {
//     body.response_format = options.responseFormat;
//   }

//   const response = await fetch(`${apiUrl}/chat/completions`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': `Bearer ${apiKey}`
//     },
//     body: JSON.stringify(body)
//   });

//   if (!response.ok) throw new Error(`API Error: ${response.status}`);
//   const data = await response.json();
//   return data.choices[0].message.content;
// }

// async function generateNarration(aiContext, promptText) {
//   const fullPrompt = buildNarratorFullPrompt(aiContext, promptText);
//   try {
//     const { apiKey } = getApiFromDom();
//     if (!apiKey) return null;
//     return await chatCompletion(fullPrompt);
//   } catch (err) {
//     console.error("Narration error:", err);
//     return null;
//   }
// }

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
