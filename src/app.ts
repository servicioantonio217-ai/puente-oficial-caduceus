import {
  waitForEvenAppBridge,
  EvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  RebuildPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { transcribe, type SttConfig } from './stt'

/**
 * G2 Caduceus — Hermes Agent integration for Even Realities G2 smart glasses.
 *
 * Flow:
 *   1. Initialize Even Hub bridge
 *   2. Display welcome screen on glasses
 *   3. Press = start recording, Press again = stop + send
 *   4. Capture audio via glasses microphone (PCM 16kHz)
 *   5. Convert PCM → WAV, transcribe via Whisper (LiteLLM proxy)
 *   6. Send transcript to Hermes API
 *   7. Display response on glasses (paginated)
 *   8. Swipe up/down to scroll through pages
 *   9. Double-press to quit
 */

/** Configuration — can be loaded from localStorage in the future */
interface CaduceusConfig {
  hermesUrl: string
  stt: SttConfig
}

const DEFAULT_CONFIG: CaduceusConfig = {
  hermesUrl: 'http://10.2.1.15:3000',
  stt: {
    apiUrl: 'http://10.2.0.12:4000',
    apiKey: '',
    model: 'whisper-1',
    language: null,
    responseFormat: 'json',
  },
}

export class App {
  private bridge!: EvenAppBridge
  private config = DEFAULT_CONFIG
  private isRecording = false
  private audioChunks: Uint8Array[] = []
  private currentPage = 0
  private pages: string[] = []

  async init(): Promise<void> {
    console.log('[Caduceus] Initializing...')

    // Try loading config from localStorage
    this.loadConfig()

    try {
      this.bridge = await waitForEvenAppBridge()
      console.log('[Caduceus] Bridge ready')
    } catch {
      console.warn('[Caduceus] Bridge not available — running in browser mode')
      this.initBrowserFallback()
      return
    }

    this.setupEventListeners()
    await this.showWelcome()
    console.log('[Caduceus] Ready — press to speak')
  }

  private loadConfig(): void {
    try {
      const stored = localStorage.getItem('caduceus_config')
      if (stored) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
        console.log('[Caduceus] Config loaded from localStorage')
      }
    } catch {
      // Ignore parse errors, use defaults
    }
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('caduceus_config', JSON.stringify(this.config))
    } catch {
      // Ignore quota errors
    }
  }

  /**
   * Browser fallback for development without glasses.
   */
  private initBrowserFallback(): void {
    const app = document.getElementById('app')!
    app.innerHTML = `
      <div style="padding: 20px; font-family: monospace; max-width: 576px; margin: 0 auto;">
        <h2>Caduceus — Browser Mode</h2>
        <p>Even Hub bridge not detected. This is the development fallback.</p>
        <hr style="margin: 16px 0;">
        <div style="margin-bottom: 12px;">
          <label style="display:block; margin-bottom: 4px;">Hermes URL:</label>
          <input id="cfg-hermes" type="text" value="${this.config.hermesUrl}" 
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display:block; margin-bottom: 4px;">LiteLLM URL:</label>
          <input id="cfg-stt-url" type="text" value="${this.config.stt.apiUrl}" 
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display:block; margin-bottom: 4px;">STT Model:</label>
          <input id="cfg-stt-model" type="text" value="${this.config.stt.model}" 
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display:block; margin-bottom: 4px;">API Key (optional):</label>
          <input id="cfg-stt-key" type="password" value="${this.config.stt.apiKey}" 
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <button id="btn-save" style="padding: 8px 16px; cursor: pointer; margin-right: 8px;">Save Config</button>
        <button id="btn-record" style="padding: 8px 16px; cursor: pointer; margin-right: 8px;">Mic Test (STT)</button>
        <button id="btn-hermes" style="padding: 8px 16px; cursor: pointer;">Test Hermes</button>
        <pre id="debug-output" style="margin-top: 16px; padding: 12px; background: #111; color: #0f0; font-size: 12px; max-height: 400px; overflow: auto; white-space: pre-wrap;"></pre>
      </div>
    `
    const debug = document.getElementById('debug-output')!

    const log = (msg: string) => {
      const ts = new Date().toLocaleTimeString()
      debug.textContent += `[${ts}] ${msg}\n`
      debug.scrollTop = debug.scrollHeight
    }
    log('Browser mode active')

    // Save config
    document.getElementById('btn-save')!.onclick = () => {
      this.config.hermesUrl = (document.getElementById('cfg-hermes') as HTMLInputElement).value
      this.config.stt.apiUrl = (document.getElementById('cfg-stt-url') as HTMLInputElement).value
      this.config.stt.model = (document.getElementById('cfg-stt-model') as HTMLInputElement).value
      this.config.stt.apiKey = (document.getElementById('cfg-stt-key') as HTMLInputElement).value
      this.saveConfig()
      log('Config saved')
    }

    // STT test — uses browser MediaRecorder for real mic input
    document.getElementById('btn-record')!.onclick = async () => {
      log('Requesting microphone access...')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1 },
        })

        log('Recording 3 seconds of audio...')
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        const chunks: Blob[] = []

        recorder.ondataavailable = (e) => chunks.push(e.data)

        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop())
          const blob = new Blob(chunks, { type: 'audio/webm' })
          log(`Recorded ${blob.size} bytes (webm)`)

          // Send to Whisper via LiteLLM
          const formData = new FormData()
          formData.append('file', blob, 'recording.webm')
          formData.append('model', this.config.stt.model)
          formData.append('response_format', 'json')

          const headers: Record<string, string> = {}
          if (this.config.stt.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.stt.apiKey}`
          }

          log(`Sending to ${this.config.stt.apiUrl}/v1/audio/transcriptions ...`)
          try {
            const resp = await fetch(`${this.config.stt.apiUrl}/v1/audio/transcriptions`, {
              method: 'POST',
              headers,
              body: formData,
            })
            if (!resp.ok) {
              const err = await resp.text()
              log(`STT error ${resp.status}: ${err}`)
              return
            }
            const data = await resp.json()
            log(`Transcription: "${data.text}"`)
            if (data.language) log(`Detected language: ${data.language}`)
          } catch (err) {
            log(`STT fetch error: ${err}`)
          }
        }

        recorder.start()
        setTimeout(() => recorder.stop(), 3000)
      } catch (err) {
        log(`Mic error: ${err}`)
      }
    }

    // Hermes test
    document.getElementById('btn-hermes')!.onclick = async () => {
      log('Testing Hermes API...')
      try {
        const response = await this.sendToHermes('Hello from Caduceus browser test')
        log(`Hermes response: "${response}"`)
      } catch (err) {
        log(`Hermes error: ${err}`)
      }
    }
  }

  /**
   * Set up Even Hub event listeners for touch input and audio.
   */
  private setupEventListeners(): void {
    this.bridge.onEvenHubEvent(async (event) => {
      // Handle audio events (PCM data from glasses mic)
      if (event.audioEvent) {
        this.audioChunks.push(event.audioEvent.audioPcm)
        return
      }

      // Handle text/touch events
      if (event.textEvent) {
        const eventType = event.textEvent.eventType
        switch (eventType) {
          case OsEventTypeList.CLICK_EVENT:
          case undefined:
            await this.handlePress()
            break
          case OsEventTypeList.DOUBLE_CLICK_EVENT:
            await this.handleDoublePress()
            break
          case OsEventTypeList.SCROLL_TOP_EVENT:
            this.handleScrollUp()
            break
          case OsEventTypeList.SCROLL_BOTTOM_EVENT:
            this.handleScrollDown()
            break
        }
      }
    })
  }

  /**
   * Show initial welcome screen on glasses.
   */
  private async showWelcome(): Promise<void> {
    const container = new CreateStartUpPageContainer({
      containerTotalNum: 3,
      textObject: [
        new TextContainerProperty({
          xPosition: 0, yPosition: 40, width: 576, height: 48,
          containerID: 1, containerName: 'title',
          content: '  > CADETCEUS',
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          xPosition: 0, yPosition: 100, width: 576, height: 96,
          containerID: 2, containerName: 'status',
          content: 'Press to speak\nDouble-press to quit',
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          xPosition: 0, yPosition: 0, width: 576, height: 288,
          containerID: 3, containerName: 'input',
          content: '',
          isEventCapture: 1,
        }),
      ],
    })

    const result = await this.bridge.createStartUpPageContainer(container)
    console.log('[Caduceus] Startup page created:', result)
  }

  /**
   * Handle single press — toggle recording.
   */
  private async handlePress(): Promise<void> {
    if (this.isRecording) {
      this.isRecording = false
      await this.bridge.audioControl(false)
      await this.updateStatus('Processing...')
      await this.processAudio()
    } else {
      this.isRecording = true
      this.audioChunks = []
      await this.bridge.audioControl(true)
      await this.updateStatus('Listening...')
    }
  }

  /**
   * Handle double press — quit app.
   */
  private async handleDoublePress(): Promise<void> {
    if (this.isRecording) {
      await this.bridge.audioControl(false)
      this.isRecording = false
    }
    await this.bridge.shutDownPageContainer(0)
  }

  private handleScrollUp(): void {
    if (this.currentPage > 0) {
      this.currentPage--
      this.showPage(this.currentPage)
    }
  }

  private handleScrollDown(): void {
    if (this.currentPage < this.pages.length - 1) {
      this.currentPage++
      this.showPage(this.currentPage)
    }
  }

  /**
   * Update the status text container on the glasses.
   */
  private async updateStatus(text: string): Promise<void> {
    const rebuild = new RebuildPageContainer({
      containerTotalNum: 3,
      textObject: [
        new TextContainerProperty({
          xPosition: 0, yPosition: 40, width: 576, height: 48,
          containerID: 1, containerName: 'title', content: '  > CADETCEUS',
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          xPosition: 0, yPosition: 100, width: 576, height: 144,
          containerID: 2, containerName: 'status', content: text,
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          xPosition: 0, yPosition: 0, width: 576, height: 288,
          containerID: 3, containerName: 'input', content: '',
          isEventCapture: 1,
        }),
      ],
    })
    await this.bridge.rebuildPageContainer(rebuild)
  }

  /**
   * Process recorded audio: concatenate PCM → WAV → STT → Hermes → Display
   */
  private async processAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      await this.updateStatus('No audio captured')
      return
    }

    // Concatenate all PCM chunks
    const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const pcmData = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of this.audioChunks) {
      pcmData.set(chunk, offset)
      offset += chunk.length
    }

    console.log(`[Caduceus] Captured ${pcmData.length} bytes PCM audio`)

    try {
      // Step 1: Speech-to-Text via Whisper
      await this.updateStatus('Transcribing...')
      const sttResult = await transcribe(pcmData, 16000, this.config.stt)
      console.log(`[Caduceus] STT result: "${sttResult.text}" (lang: ${sttResult.language})`)

      if (!sttResult.text.trim()) {
        await this.updateStatus('Could not\nunderstand audio')
        return
      }

      // Step 2: Send to Hermes
      await this.updateStatus(`"${sttResult.text.slice(0, 80)}"`)
      const response = await this.sendToHermes(sttResult.text)

      // Step 3: Display response
      this.displayResponse(response)
    } catch (err) {
      console.error('[Caduceus] Error:', err)
      await this.updateStatus(`Error:\n${String(err).slice(0, 200)}`)
    }
  }

  /**
   * Send a text prompt to the Hermes API.
   */
  private async sendToHermes(prompt: string): Promise<string> {
    console.log('[Caduceus] Sending to Hermes:', prompt)

    const response = await fetch(`${this.config.hermesUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'default',
        messages: [
          {
            role: 'system',
            content: 'You are Hermes, a concise AI assistant displayed on smart glasses. Keep responses under 500 characters. Use short sentences. No markdown formatting.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      throw new Error(`Hermes ${response.status}: ${await response.text()}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'No response'
  }

  /**
   * Display a response on the glasses, paginated at ~400 chars per page.
   */
  private displayResponse(text: string): void {
    const pageSize = 400
    this.pages = []

    for (let i = 0; i < text.length; i += pageSize) {
      this.pages.push(text.slice(i, i + pageSize))
    }

    if (this.pages.length === 0) {
      this.pages = ['(empty)']
    }

    this.currentPage = 0
    this.showPage(0)
  }

  /**
   * Show a specific page on the glasses display.
   */
  private showPage(index: number): void {
    const content = this.pages[index]
    const pageInfo = this.pages.length > 1
      ? `── ${index + 1}/${this.pages.length} ──\n`
      : ''
    this.updateStatus(`${pageInfo}${content}`)
  }
}
