import { pipeline, TextStreamer, InterruptableStoppingCriteria, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useWasmCache = true;

const cores = self.navigator?.hardwareConcurrency || 4;
env.backends.onnx.wasm.simd = true;
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated
  ? Math.max(1, Math.min(8, cores - 1))
  : 1;

let generator = null;
let activeModel = '';
let activeDevice = '';
let stopping = null;
let generationActive = false;
let loadingActive = false;
let unloadRequested = false;

async function disposeActiveGenerator() {
  const current = generator;
  generator = null;
  activeModel = '';
  activeDevice = '';
  stopping = null;
  if (current && typeof current.dispose === 'function') {
    await current.dispose();
  }
}

function devicePlan(preference) {
  const plan = [];
  const hasWebNN = !!self.navigator?.ml;
  const hasWebGPU = !!self.navigator?.gpu;

  if (preference === 'cpu') {
    return [{ device: 'wasm', dtype: 'q4', label: 'CPU · WebAssembly' }];
  }
  if (preference === 'npu') {
    if (hasWebNN) plan.push({ device: 'webnn-npu', dtype: 'q4f16', label: 'NPU · WebNN' });
    if (hasWebGPU) plan.push({ device: 'webgpu', dtype: 'q4f16', label: 'GPU · WebGPU fallback' });
    plan.push({ device: 'wasm', dtype: 'q4', label: 'CPU · WebAssembly fallback' });
    return plan;
  }
  if (preference === 'gpu') {
    if (hasWebGPU) plan.push({ device: 'webgpu', dtype: 'q4f16', label: 'GPU · WebGPU' });
    plan.push({ device: 'wasm', dtype: 'q4', label: 'CPU · WebAssembly fallback' });
    return plan;
  }

  if (hasWebNN) plan.push({ device: 'webnn-npu', dtype: 'q4f16', label: 'NPU · WebNN' });
  if (hasWebGPU) plan.push({ device: 'webgpu', dtype: 'q4f16', label: 'GPU · WebGPU' });
  plan.push({ device: 'wasm', dtype: 'q4', label: 'CPU · WebAssembly' });
  return plan;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'delete-model') {
      const allowedModels = [
        'HuggingFaceTB/SmolLM3-3B-ONNX'
      ];
      if (!allowedModels.includes(data.modelId)) {
        throw new Error('That local model is not supported for deletion.');
      }

      if (activeModel === data.modelId) {
        stopping?.interrupt();
        if (generationActive || loadingActive) {
          throw new Error('Wait for the local model to finish loading or generating before deleting it.');
        }
        await disposeActiveGenerator();
      }

      if (!self.caches || typeof self.caches.open !== 'function') {
        throw new Error('This browser does not support deleting cached model files.');
      }

      const cache = await self.caches.open(env.cacheKey || 'transformers-cache');
      const requests = await cache.keys();
      const modelPath = '/' + data.modelId + '/';
      let deleted = 0;

      for (const request of requests) {
        try {
          const url = new URL(request.url);
          if (url.hostname === 'huggingface.co' && url.pathname.includes(modelPath)) {
            if (await cache.delete(request)) deleted++;
          }
        } catch (error) {
          // Ignore unrelated cache entries that cannot be parsed.
        }
      }

      postMessage({ type: 'deleted-model', modelId: data.modelId, deleted });
      return;
    }

    if (data.type === 'stop') {
      stopping?.interrupt();
      return;
    }

    if (data.type === 'unload') {
      unloadRequested = true;
      if (generationActive) {
        stopping?.interrupt();
        postMessage({ type: 'unloading' });
        return;
      }
      if (loadingActive) {
        postMessage({ type: 'unloading' });
        return;
      }
      await disposeActiveGenerator();
      postMessage({ type: 'unloaded' });
      return;
    }

    if (data.type === 'load') {
      if (data.model?.id !== 'HuggingFaceTB/SmolLM3-3B-ONNX') {
        throw new Error('Only SmolLM3 3B is enabled as the local model.');
      }
      if (generator && activeModel === data.model.id) {
        postMessage({ type: 'ready', model: activeModel, device: activeDevice });
        return;
      }

      await disposeActiveGenerator();
      unloadRequested = false;
      loadingActive = true;
      const plan = devicePlan(data.accelerator || 'auto');
      let lastError;

      try {
        for (const candidate of plan) {
          postMessage({
            type: 'progress',
            text: 'Preparing ' + candidate.label + '…',
            percent: 0,
            device: candidate.device
          });

          try {
            generator = await pipeline('text-generation', data.model.id, {
              dtype: candidate.dtype,
              device: candidate.device,
              progress_callback: progress => {
                if (progress.status === 'progress') {
                  postMessage({
                    type: 'progress',
                    text: 'Downloading ' + (progress.file || 'model files') + '…',
                    percent: progress.progress || 0,
                    device: candidate.device
                  });
                }
              }
            });

            if (unloadRequested) {
              await disposeActiveGenerator();
              postMessage({ type: 'unloaded' });
              return;
            }

            activeModel = data.model.id;
            activeDevice = candidate.device;
            postMessage({
              type: 'ready',
              model: activeModel,
              device: activeDevice,
              label: candidate.label
            });
            return;
          } catch (error) {
            lastError = error;
            await disposeActiveGenerator();
            if (unloadRequested) {
              postMessage({ type: 'unloaded' });
              return;
            }
            postMessage({
              type: 'progress',
              text: candidate.label + ' unavailable. Trying another option…',
              percent: 0
            });
          }
        }

        throw new Error(
          'Could not load this model on the available hardware. ' +
          (lastError?.message || 'Try a smaller model or choose CPU mode.')
        );
      } finally {
        loadingActive = false;
      }
    }

    if (data.type === 'generate') {
      if (!generator || activeModel !== data.model.id) {
        throw new Error('The selected local model is not loaded yet.');
      }

      unloadRequested = false;
      generationActive = true;
      stopping = new InterruptableStoppingCriteria();
      const started = Date.now();
      let output = '';

      try {
        const streamer = new TextStreamer(generator.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: token => {
            output += token;
            postMessage({ type: 'token', text: output });
          }
        });

        await generator(data.messages, {
          max_new_tokens: 384,
          do_sample: true,
          temperature: 0.6,
          top_p: 0.95,
          streamer,
          stopping_criteria: [stopping]
        });

        postMessage({
          type: 'done',
          text: output,
          elapsed: Date.now() - started,
          device: activeDevice
        });
      } finally {
        generationActive = false;
        stopping = null;
        if (unloadRequested) {
          await disposeActiveGenerator();
          postMessage({ type: 'unloaded' });
        }
      }
    }
  } catch (error) {
    postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
