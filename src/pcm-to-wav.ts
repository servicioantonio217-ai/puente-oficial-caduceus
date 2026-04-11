/**
 * PCM to WAV converter — pure JavaScript, no dependencies.
 *
 * Converts raw PCM audio data (Int16 LE, mono) to a WAV file buffer
 * with proper RIFF header. Used to prepare audio from the G2 glasses
 * microphone for the Whisper STT API.
 */

const WAV_HEADER_SIZE = 44

/**
 * Write a 32-bit little-endian integer into a buffer at offset.
 */
function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}

/**
 * Write a 16-bit little-endian integer into a buffer at offset.
 */
function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

/**
 * Convert raw PCM Int16 LE mono samples to a WAV file (ArrayBuffer).
 *
 * @param pcmData - Raw PCM samples (16-bit signed, little-endian, mono)
 * @param sampleRate - Sample rate in Hz (default: 16000 — G2 glasses output)
 * @param numChannels - Number of channels (default: 1 — G2 is mono)
 * @returns WAV file as ArrayBuffer
 */
export function pcmToWav(
  pcmData: Uint8Array | ArrayBuffer,
  sampleRate = 16000,
  numChannels = 1,
): ArrayBuffer {
  const pcm = pcmData instanceof Uint8Array ? pcmData : new Uint8Array(pcmData)
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length
  const totalSize = WAV_HEADER_SIZE + dataSize

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  // RIFF header
  writeUint32LE(view, 0, 0x52494646)         // "RIFF"
  writeUint32LE(view, 4, totalSize - 8)      // File size - 8
  writeUint32LE(view, 8, 0x57415645)         // "WAVE"

  // fmt sub-chunk
  writeUint32LE(view, 12, 0x666d7420)        // "fmt "
  writeUint32LE(view, 16, 16)                 // Sub-chunk size (PCM = 16)
  writeUint16LE(view, 20, 1)                  // Audio format (1 = PCM)
  writeUint16LE(view, 22, numChannels)        // Channels
  writeUint32LE(view, 24, sampleRate)         // Sample rate
  writeUint32LE(view, 28, byteRate)           // Byte rate
  writeUint16LE(view, 32, blockAlign)         // Block align
  writeUint16LE(view, 34, bitsPerSample)      // Bits per sample

  // data sub-chunk
  writeUint32LE(view, 36, 0x64617461)        // "data"
  writeUint32LE(view, 40, dataSize)           // Data size

  // Copy PCM data after header
  const wavData = new Uint8Array(buffer)
  wavData.set(pcm, WAV_HEADER_SIZE)

  return buffer
}

/**
 * Get WAV file size for a given PCM data length.
 */
export function wavFileSize(pcmLength: number): number {
  return WAV_HEADER_SIZE + pcmLength
}
