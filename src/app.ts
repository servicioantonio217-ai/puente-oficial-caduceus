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
 * Fetch with automatic retry and exponential backoff for transient errors.
 *
 * Retries on network failures and 5xx server errors.
 * Does NOT retry on 4xx client errors (those are not transient).
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit & { retryMax?: number; retryBaseMs?: number },
): Promise<Response> {
  const { retryMax = 2, retryBaseMs = 1000, ...fetchOpts } = options

  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retryMax; attempt++) {
    try {
      const response = await fetch(url, fetchOpts)

      // Retry on 5xx server errors (not on 4xx client errors)
      if (response.status >= 500 && attempt < retryMax) {
        const delay = retryBaseMs * Math.pow(2, attempt)
        console.warn(`[fetchWithRetry] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retryMax})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      return response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Don't retry on abort (timeout) — those are intentional
      if (lastError.name === 'AbortError') throw lastError
      if (attempt < retryMax) {
        const delay = retryBaseMs * Math.pow(2, attempt)
        console.warn(`[fetchWithRetry] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${retryMax}):`, lastError.message)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError ?? new Error('fetchWithRetry: all retries exhausted')
}

/** Map raw errors to user-friendly messages for the glasses display */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('timed out')) return 'Request timed out\nCheck connection'
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'Network error\nCheck connection'
  if (msg.includes('STT API error')) return 'Speech service\nunavailable'
  if (msg.includes('Hermes')) return 'Hermes service\nunavailable'
  return 'Error occurred\nTry again'
}

/**
 * G2 Caduceus — Hermes Agent integration for Even Realities G2 smart glasses.
 *
 * Architecture:
 *   - WebUI is always rendered (phone or browser) as a companion interface
 *   - Glasses display runs independently via Even Hub bridge (when available)
 *   - Config changes via WebUI take effect immediately for both interfaces
 *
 * Glasses flow:
 *   1. Press = start recording, Press again = stop + send
 *   2. Capture audio via glasses microphone (PCM 16kHz)
 *   3. Convert PCM → WAV, transcribe via Whisper (LiteLLM proxy)
 *   4. Send transcript to Hermes API
 *   5. Display response on glasses (paginated)
 *   6. Swipe up/down to scroll through pages
 *   7. Double-press to quit
 */

/** Configuration — persisted in localStorage, editable via WebUI */
interface CaduceusConfig {
  hermesUrl: string
  hermesApiKey: string
  stt: SttConfig
  onboarded: boolean
}

const DEFAULT_CONFIG: CaduceusConfig = {
  hermesUrl: '',
  hermesApiKey: '',
  stt: {
    apiUrl: '',
    apiKey: '',
    model: 'whisper-1',
    language: null,
    responseFormat: 'json',
  },
  onboarded: false,
}

export class App {
  private bridge!: EvenAppBridge
  private hasBridge = false
  private config = DEFAULT_CONFIG
  private isRecording = false
  private audioChunks: Uint8Array[] = []
  private currentPage = 0
  private pages: string[] = []

  async init(): Promise<void> {
    console.log('[Caduceus] Initializing...')

    // Always load config first
    this.loadConfig()

    // Show onboarding or main WebUI
    if (!this.config.onboarded) {
      this.initOnboarding()
    } else {
      this.initWebUI()
    }

    // Try connecting to glasses bridge (runs independently of WebUI)
    try {
      this.bridge = await waitForEvenAppBridge()
      this.hasBridge = true
      console.log('[Caduceus] Bridge ready')

      this.setupEventListeners()
      await this.showWelcome()
      console.log('[Caduceus] Ready — press to speak')
    } catch {
      console.warn('[Caduceus] Bridge not available — glasses mode disabled')
    }
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
   * Onboarding screen — shown on first launch when no config exists.
   * Guides the user through setting up Hermes URL and STT endpoint.
   */
  private initOnboarding(): void {
    const app = document.getElementById('app')!
    app.innerHTML = `
      <div class="caduceus-container">
        <h2>Caduceus Setup</h2>
        <p style="color: #888; margin: 0 0 16px 0;">Connect your AI assistant to your G2 glasses.</p>
        <hr>
        <div class="field">
          <label>Hermes URL:</label>
          <input id="onb-hermes" type="text" placeholder="http://your-server:3000">
          <small style="color: #666;">Your Hermes Agent API endpoint</small>
        </div>
        <div class="field">
          <label>STT Endpoint:</label>
          <input id="onb-stt-url" type="text" placeholder="http://your-server:4000">
          <small style="color: #666;">Whisper-compatible Speech-to-Text API</small>
        </div>
        <div class="field">
          <label>STT API Key (optional):</label>
          <input id="onb-stt-key" type="password" placeholder="Leave empty if not required">
        </div>
        <div class="field">
          <label>STT Model:</label>
          <input id="onb-stt-model" type="text" value="whisper-1" placeholder="whisper-1">
        </div>
        <div class="btn-row">
          <button id="btn-onb-save">Save and Start</button>
        </div>
        <p style="color: #555; font-size: 12px; margin-top: 16px;">
          You can change these settings later in the companion WebUI.
          Audio is sent to your own servers — see Privacy Policy below.
        </p>
        <hr>
        <details style="margin-top: 8px;">
          <summary style="cursor: pointer; color: #888; font-size: 12px;">Privacy Policy</summary>
          <div style="margin-top: 8px; font-size: 12px; color: #666; line-height: 1.5;">
            <p><strong>Data Collection:</strong> Caduceus sends audio recordings to your configured
            Speech-to-Text endpoint and text prompts to your configured Hermes Agent endpoint.
            No data is sent to any third-party server beyond what you configure.</p>
            <p><strong>Audio Processing:</strong> Microphone audio from the G2 glasses (PCM 16kHz)
            is converted to WAV and sent to your STT service for transcription. The transcription
            text is then forwarded to your Hermes Agent for AI response generation.</p>
            <p><strong>Storage:</strong> All configuration is stored locally on your device (localStorage).
            No audio, transcripts, or conversation history is stored by Caduceus itself.</p>
            <p><strong>Network:</strong> Caduceus communicates exclusively with the endpoints you
            configure. There are no analytics, telemetry, or tracking mechanisms.</p>
            <p><strong>Open Source:</strong> Caduceus is open-source software. You can audit the code
            at gitlab.pfandl.cloud/coding-agent/g2-caduceus</p>
          </div>
        </details>
      </div>
    `

    document.getElementById('btn-onb-save')!.onclick = () => {
      const hermesUrl = (document.getElementById('onb-hermes') as HTMLInputElement).value.trim()
      const sttUrl = (document.getElementById('onb-stt-url') as HTMLInputElement).value.trim()
      const sttKey = (document.getElementById('onb-stt-key') as HTMLInputElement).value.trim()
      const sttModel = (document.getElementById('onb-stt-model') as HTMLInputElement).value.trim()

      if (!hermesUrl) {
        alert('Please enter your Hermes URL')
        return
      }
      if (!sttUrl) {
        alert('Please enter your STT Endpoint')
        return
      }

      this.config.hermesUrl = hermesUrl
      this.config.stt.apiUrl = sttUrl
      this.config.stt.apiKey = sttKey
      this.config.stt.model = sttModel || 'whisper-1'
      this.config.onboarded = true
      this.saveConfig()

      console.log('[Caduceus] Onboarding complete — switching to main UI')
      this.initWebUI()
    }
  }

  /**
   * WebUI — always rendered as companion interface.
   * Shows settings, status, mic test, and debug log.
   * Works on phone (Even Hub WebView) and in regular browsers.
   */
  private initWebUI(): void {
    const app = document.getElementById('app')!
    app.innerHTML = `
      <div style="padding: 20px; font-family: monospace; max-width: 576px; margin: 0 auto;">
        <h2>Caduceus</h2>
        <hr style="margin: 16px 0;">
        <div style="margin-bottom: 12px;">
          <label style="display:block; margin-bottom: 4px;">Hermes URL:</label>
          <input id="cfg-hermes" type="text" value=""
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display:block; margin-bottom: 4px;">Hermes API Key (optional):</label>
          <input id="cfg-hermes-key" type="password" value=""
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display:block; margin-bottom: 4px;">STT Endpoint:</label>
          <input id="cfg-stt-url" type="text" value=""
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display:block; margin-bottom: 4px;">STT Model:</label>
          <input id="cfg-stt-model" type="text" value=""
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display:block; margin-bottom: 4px;">STT API Key (optional):</label>
          <input id="cfg-stt-key" type="password" value=""
                 style="width:100%; padding:8px; background:#1a1a1a; color:#0f0; border:1px solid #333;">
        </div>
        <button id="btn-save" style="padding: 8px 16px; cursor: pointer; margin-right: 8px;">Save Config</button>
        <button id="btn-record" style="padding: 8px 16px; cursor: pointer; margin-right: 8px;">Mic Test (STT)</button>
        <button id="btn-hermes" style="padding: 8px 16px; cursor: pointer; margin-right: 8px;">Test Hermes</button>
        <button id="btn-reset" style="padding: 8px 16px; cursor: pointer; color: #f80; border-color: #f80;">Reset</button>
        <pre id="debug-output" style="margin-top: 16px; padding: 12px; background: #111; color: #0f0; font-size: 12px; max-height: 400px; overflow: auto; white-space: pre-wrap;"></pre>
      </div>
    `
    // Set config values via DOM API to prevent XSS from template literal injection
    const setVal = (id: string, val: string) => { const el = document.getElementById(id) as HTMLInputElement; if (el) el.value = val }
    setVal('cfg-hermes', this.config.hermesUrl)
    setVal('cfg-hermes-key', this.config.hermesApiKey)
    setVal('cfg-stt-url', this.config.stt.apiUrl)
    setVal('cfg-stt-model', this.config.stt.model)
    setVal('cfg-stt-key', this.config.stt.apiKey)
    const debug = document.getElementById('debug-output')!

    const log = (msg: string) => {
      const ts = new Date().toLocaleTimeString()
      debug.textContent += `[${ts}] ${msg}\n`
      debug.scrollTop = debug.scrollHeight
    }

    /** Helper to disable/enable a button with visual feedback */
    const withButton = async (id: string, label: string, fn: () => Promise<void>) => {
      const btn = document.getElementById(id) as HTMLButtonElement
      if (!btn) return
      const orig = btn.textContent ?? label
      btn.disabled = true
      btn.textContent = `${label}...`
      btn.style.opacity = '0.6'
      try {
        await fn()
      } finally {
        btn.disabled = false
        btn.textContent = orig
        btn.style.opacity = '1'
      }
    }

    log('Caduceus started')

    // Save config
    document.getElementById('btn-save')!.onclick = () => {
      this.config.hermesUrl = (document.getElementById('cfg-hermes') as HTMLInputElement).value
      this.config.hermesApiKey = (document.getElementById('cfg-hermes-key') as HTMLInputElement).value
      this.config.stt.apiUrl = (document.getElementById('cfg-stt-url') as HTMLInputElement).value
      this.config.stt.model = (document.getElementById('cfg-stt-model') as HTMLInputElement).value
      this.config.stt.apiKey = (document.getElementById('cfg-stt-key') as HTMLInputElement).value
      this.saveConfig()
      log('Config saved')
    }

    // STT test — uses browser MediaRecorder for real mic input
    document.getElementById('btn-record')!.onclick = () => withButton('btn-record', 'Mic Test', async () => {
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

          // Send to Whisper via STT endpoint
          const formData = new FormData()
          formData.append('file', blob, 'recording.webm')
          formData.append('model', this.config.stt.model)
          formData.append('response_format', 'json')

          const headers: Record<string, string> = {}
          if (this.config.stt.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.stt.apiKey}`
          }

          const sttUrl = `${this.config.stt.apiUrl}/v1/audio/transcriptions`
          log(`Sending to ${sttUrl} ...`)
          try {
            const resp = await fetch(sttUrl, {
              method: 'POST',
              headers,
              body: formData,
            })
            if (!resp.ok) {
              const err = await resp.text()
              log(`STT error ${resp.status}: ${err}`)
              if (resp.type === 'opaque') {
                log('Hint: This may be a CORS issue — ensure the STT server allows requests from this origin')
              }
              return
            }
            const data = await resp.json()
            log(`Transcription: "${data.text}"`)
            if (data.language) log(`Detected language: ${data.language}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
              log(`STT fetch error: ${msg}`)
              log('Hint: Check that the STT endpoint is reachable and has CORS headers configured')
            } else {
              log(`STT fetch error: ${msg}`)
            }
          }
        }

        recorder.start()
        setTimeout(() => recorder.stop(), 3000)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Permission') || msg.includes('NotAllowed')) {
          log(`Mic error: Permission denied — microphone access was rejected`)
          log('Hint: Allow microphone access in browser settings or use HTTPS')
        } else if (msg.includes('NotFoundError')) {
          log(`Mic error: No microphone found`)
        } else {
          log(`Mic error: ${msg}`)
        }
      }
    })

    // Hermes test
    document.getElementById('btn-hermes')!.onclick = () => withButton('btn-hermes', 'Test Hermes', async () => {
      log('Testing Hermes API...')
      try {
        const response = await this.sendToHermes('Hello from Caduceus browser test')
        log(`Hermes response: "${response}"`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          log(`Hermes error: ${msg}`)
          log('Hint: Check that the Hermes URL is reachable and has CORS headers configured')
        } else {
          log(`Hermes error: ${msg}`)
        }
      }
    }))

    // Reset config — go back to onboarding
    document.getElementById('btn-reset')!.onclick = () => {
      if (confirm('Reset all settings and start setup again?')) {
        localStorage.removeItem('caduceus_config')
        this.config = { ...DEFAULT_CONFIG }
        console.log('[Caduceus] Config reset — returning to onboarding')
        this.initOnboarding()
      }
    }
  }
  /**
   * Set up Even Hub event listeners for touch input and audio.
   * Only called when bridge is available — glasses run independently of WebUI.
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
          content: '  > CADEUCEUS',
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
    if (!this.hasBridge) return

    const rebuild = new RebuildPageContainer({
      containerTotalNum: 3,
      textObject: [
        new TextContainerProperty({
          xPosition: 0, yPosition: 40, width: 576, height: 48,
          containerID: 1, containerName: 'title', content: '  > CADEUCEUS',
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

      // Step 3: Display response on glasses
      this.displayResponse(response)
    } catch (err) {
      console.error('[Caduceus] Error:', err)
      await this.updateStatus(`Error:\n${friendlyError(err)}`)
    }
  }

  /**
   * Send a text prompt to the Hermes API.
   */
  private async sendToHermes(prompt: string): Promise<string> {
    console.log('[Caduceus] Sending to Hermes:', prompt)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000) // 30s timeout for Hermes

    const response = await fetchWithRetry(`${this.config.hermesUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.hermesApiKey ? { 'Authorization': `Bearer ${this.config.hermesApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: 'default',
        messages: [
          {
            role: 'system',
            content: 'You are Hermes, a concise AI assistant displayed on smart glasses (576x288px, 4-bit greyscale, monospace). Keep responses under 400 characters. Use short sentences. No markdown. ASCII only. Max ~50 chars per line for readability. Separate paragraphs with blank lines for pagination.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
      }),
      signal: controller.signal,
      retryMax: 2,
      retryBaseMs: 1000,
    })
    clearTimeout(timeout)

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
