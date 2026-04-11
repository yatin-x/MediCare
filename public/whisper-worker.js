import { pipeline, read_audio } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'

let transcriber = null

self.onmessage = async (e) => {
  const { audioData, sampleRate } = e.data

  if (!transcriber) {
    self.postMessage({ status: 'loading' })
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en'
    )
  }

  try {
    // Pass the raw ArrayBuffer blob — Transformers.js handles webm/opus internally
    const blob = new Blob([audioData], { type: 'audio/webm' })
    const url = URL.createObjectURL(blob)
    
    const result = await transcriber(url, {
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    
    URL.revokeObjectURL(url)
    self.postMessage({ status: 'done', text: result.text })
  } catch (err) {
    console.error('Worker transcription error:', err)
    self.postMessage({ status: 'done', text: '' })
  }
}