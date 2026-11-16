/* Classroom Spot local AI fallback — Qwen3-4B ONNX */
import { pipeline, TextStreamer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let generator = null;
let activeDevice = null;

async function loadModel(send) {
  if (generator) return generator;
  send({ type: 'status', text: 'Loading Qwen3-4B locally. The first download is large; later visits use the browser cache…' });
  const model = 'onnx-community/Qwen3-4B-ONNX';
  if (navigator.gpu) {
    try {
      send({ type: 'status', text: 'Preparing Qwen3-4B with WebGPU…' });
      generator = await pipeline('text-generation', model, {
        device: 'webgpu',
        dtype: 'q4f16',
        progress_callback: p => send({ type: 'progress', progress: p })
      });
      activeDevice = 'WebGPU';
      return generator;
    } catch (err) {
      generator = null;
      send({ type: 'status', text: 'WebGPU setup failed; trying CPU mode (this may be slower)…' });
    }
  }
  generator = await pipeline('text-generation', model, {
    dtype: 'q4',
    progress_callback: p => send({ type: 'progress', progress: p })
  });
  activeDevice = 'CPU';
  return generator;
}

self.onmessage = async event => {
  const data = event.data || {};
  if (data.type !== 'generate') return;
  const send = payload => self.postMessage({ ...payload, id: data.id });
  try {
    const model = await loadModel(send);
    const messages = (data.messages || []).map(m => {
      let content = m.content;
      if (Array.isArray(content)) {
        content = content.filter(part => part && part.type === 'text')
          .map(part => part.text || '').join('\n');
        if (!content) content = '[An image was attached, but local Qwen fallback currently supports text only.]';
      }
      return { role: m.role, content: String(content || '') };
    });
    if (!messages.some(m => m.role === 'user')) throw new Error('There is no user message to answer.');
    send({ type: 'status', text: 'Qwen3-4B is generating locally on ' + activeDevice + '…' });
    let full = '';
    const streamer = new TextStreamer(model.tokenizer, {
      skip_prompt: true,
      callback_function: piece => {
        if (piece) {
          full += piece;
          send({ type: 'token', text: piece, full });
        }
      }
    });
    await model(messages, {
      max_new_tokens: 768,
      do_sample: true,
      temperature: 0.7,
      repetition_penalty: 1.05,
      streamer
    });
    if (!full.trim()) throw new Error('Qwen3-4B returned an empty response.');
    full = full.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    send({ type: 'complete', text: full, device: activeDevice });
  } catch (error) {
    send({ type: 'error', error: error && error.message ? error.message : String(error) });
  }
};
