import { pcmToWav } from './pcm-to-wav'

/**
 * Speech-to-Text service using OpenAI Whisper API via LiteLLM proxy.
 *
 * OpenAI-compatible endpoint: POST /v1/audio/transcriptions
 * Accepts: multipart/form-data with audio file + parameters
 * LiteLLM proxy at 10.2.0.12:4000 forwards to the configured Whisper model
 */

export interface SttConfig {
  /** LiteLLM proxy base URL */
  apiUrl: string
  /** API key for authentication */
  apiKey: string
  /** Whisper model name (passed to LiteLLM, e.g. "whisper-1") */
  model: string
  /** Source language hint (ISO 639-1, e.g. "en", "de"). null = auto-detect */
  language?: string | null
  /** Response format: "text", "json", "verbose_json", "srt", "vtt" */
  responseFormat?: string
}

export interface SttResult {
  text: string
  language?: string
  duration?: number
}

const DEFAULT_CONFIG: SttConfig = {
  apiUrl: 'http://10.2.0.12:4000',
  apiKey: '',
  model: 'whisper-1',
  language: null,
  responseFormat: 'json',
}

/**
 * Transcribe audio PCM data to text using Whisper via LiteLLM.
 *
 * @param pcmData - Raw PCM audio (16-bit signed, little-endian, mono, 16kHz)
 * @param sampleRate - Sample rate of the PCM data (default: 16000)
 * @param config - STT configuration (uses defaults if not provided)
 * @returns Transcription result with text and optional metadata
 */
export async function transcribe(
  pcmData: Uint8Array,
  sampleRate = 16000,
  config: Partial<SttConfig> = {},
): Promise<SttResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (pcmData.length === 0) {
    throw new Error('No audio data to transcribe')
  }

  // Minimum viable audio: ~0.5s at 16kHz = 16000 bytes (32000 samples × 2 bytes)
  const minBytes = sampleRate * 0.3 * 2 // 0.3s minimum
  if (pcmData.length < minBytes) {
    throw new Error(`Audio too short: ${pcmData.length} bytes (min ${Math.round(minBytes)})`)
  }

  // Convert PCM to WAV
  const wavBuffer = pcmToWav(pcmData, sampleRate)
  const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' })

  // Build multipart form data
  const formData = new FormData()
  formData.append('file', wavBlob, 'recording.wav')
  formData.append('model', cfg.model)
  formData.append('response_format', cfg.responseFormat ?? 'json')

  if (cfg.language) {
    formData.append('language', cfg.language)
  }

  // Call Whisper API via LiteLLM proxy
  const url = `${cfg.apiUrl.replace(/\/+$/, '')}/v1/audio/transcriptions`
  const headers: Record<string, string> = {}
  if (cfg.apiKey) {
    headers['Authorization'] = `Bearer ${cfg.apiKey}`
  }

  console.log(`[STT] Sending ${wavBuffer.byteLength} bytes WAV to ${url}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000) // 15s timeout for STT

  let response: Response
  let lastErr: Error | undefined
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      })
      // Retry on 5xx
      if (response.status >= 500 && attempt === 0) {
        await new Promise(r => setTimeout(r, 1000))
        continue
      }
      break
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (lastErr.name === 'AbortError') {
        clearTimeout(timeout)
        throw new Error('STT request timed out (15s)')
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000))
    }
  }
  clearTimeout(timeout)

  if (!response) throw lastErr ?? new Error('STT request failed after retry')

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`STT API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()

  // Whisper returns different formats depending on response_format
  if (cfg.responseFormat === 'text') {
    return { text: typeof data === 'string' ? data : data.text || '' }
  }

  return {
    text: data.text || '',
    language: data.language,
    duration: data.duration,
  }
}
