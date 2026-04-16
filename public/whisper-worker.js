import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'

let transcriber = null

self.onmessage = async (e) => {
  const { audioData, sampleRate } = e.data

  if (!transcriber) {
    self.postMessage({ status: 'loading' })
    try {
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en')
    } catch (err) {
      console.error('Worker model load error:', err)
      self.postMessage({ status: 'error', error: 'model_load_failed' })
      return
    }
  }

  try {
    // Pass Float32Array directly — no AudioContext needed in worker
    const result = await transcriber(audioData, {
      sampling_rate: sampleRate,
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    self.postMessage({ status: 'done', text: result.text })
  } catch (err) {
    console.error('Worker transcription error:', err)
    self.postMessage({ status: 'error', error: 'transcribe_failed' })
  }
}