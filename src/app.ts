import {
  waitForEvenAppBridge,
  EvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  RebuildPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

/**
 * G2 Caduceus — Hermes Agent integration for Even Realities G2 smart glasses.
 *
 * Flow:
 *   1. Initialize Even Hub bridge
 *   2. Display welcome screen on glasses
 *   3. Wait for touch input (press = start recording, double-press = quit)
 *   4. Capture audio via glasses microphone
 *   5. Send to Hermes API for processing
 *   6. Display response on glasses (paginated)
 *   7. Scroll through pages with swipe up/down
 */

export class App {
  private bridge!: EvenAppBridge
  private isRecording = false
  private audioChunks: Uint8Array[] = []
  private currentPage = 0
  private pages: string[] = []
  private hermesUrl = 'http://10.2.1.15:3000' // Hermes API endpoint — configure via settings

  async init(): Promise<void> {
    console.log('[Caduceus] Initializing...')

    try {
      this.bridge = await waitForEvenAppBridge()
      console.log('[Caduceus] Bridge ready')
    } catch (err) {
      console.error('[Caduceus] Bridge not available — running in browser mode')
      this.initBrowserFallback()
      return
    }

    this.setupEventListeners()
    await this.showWelcome()
    console.log('[Caduceus] Ready — press to speak')
  }

  /**
   * Browser fallback for development without glasses.
   * Shows a minimal debug UI.
   */
  private initBrowserFallback(): void {
    const app = document.getElementById('app')!
    app.innerHTML = `
      <div style="padding: 20px; font-family: monospace; max-width: 576px; margin: 0 auto;">
        <h2>Caduceus — Browser Mode</h2>
        <p>Even Hub bridge not detected. This is the development fallback.</p>
        <p>Open this page on the Even Realities App (QR sideload) for full functionality.</p>
        <hr style="margin: 16px 0;">
        <button id="btn-record" style="padding: 12px 24px; font-size: 16px; cursor: pointer;">
          🎤 Start Recording
        </button>
        <button id="btn-stop" style="padding: 12px 24px; font-size: 16px; cursor: pointer; margin-left: 8px;" disabled>
          ⏹ Stop
        </button>
        <pre id="debug-output" style="margin-top: 16px; padding: 12px; background: #111; color: #0f0; font-size: 12px; max-height: 300px; overflow: auto; white-space: pre-wrap;"></pre>
      </div>
    `
    const debug = document.getElementById('debug-output')!
    const btnRecord = document.getElementById('btn-record') as HTMLButtonElement
    const btnStop = document.getElementById('btn-stop') as HTMLButtonElement

    const log = (msg: string) => {
      debug.textContent += msg + '\n'
      debug.scrollTop = debug.scrollHeight
    }
    log('[Caduceus] Browser mode active')

    btnRecord.onclick = () => {
      log('[Caduceus] Recording started (simulated)')
      btnRecord.disabled = true
      btnStop.disabled = false
    }
    btnStop.onclick = () => {
      log('[Caduceus] Recording stopped — sending to Hermes...')
      btnRecord.disabled = false
      btnStop.disabled = true
      this.sendToHermes('Test prompt from browser mode')
        .then(response => log(`[Caduceus] Response: ${response}`))
        .catch(err => log(`[Caduceus] Error: ${err}`))
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
          case undefined: // SDK normalizes 0 to undefined
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
        // Title
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 40,
          width: 576,
          height: 48,
          containerID: 1,
          containerName: 'title',
          content: '  > CADETCEUS',
          isEventCapture: 0,
        }),
        // Status
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 100,
          width: 576,
          height: 96,
          containerID: 2,
          containerName: 'status',
          content: 'Press to speak\nDouble-press to quit',
          isEventCapture: 0,
        }),
        // Event capture area (invisible, covers full screen)
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          containerID: 3,
          containerName: 'input',
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
      // Stop recording and send to Hermes
      this.isRecording = false
      await this.bridge.audioControl(false)
      await this.updateStatus('Processing...')
      await this.processAudio()
    } else {
      // Start recording
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

  /**
   * Handle scroll up — previous page.
   */
  private handleScrollUp(): void {
    if (this.currentPage > 0) {
      this.currentPage--
      this.showPage(this.currentPage)
    }
  }

  /**
   * Handle scroll down — next page.
   */
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
   * Process recorded audio — concatenate chunks and send to Hermes.
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

    // For MVP: send raw PCM to a transcription endpoint,
    // then send the transcribed text to Hermes.
    // This will need a STT step — either on-device or via an API.
    // For now, we'll use the Hermes API directly with a placeholder.

    try {
      const text = await this.transcribeAudio(pcmData)
      await this.updateStatus(`You said:\n${text}`)
      const response = await this.sendToHermes(text)
      this.displayResponse(response)
    } catch (err) {
      await this.updateStatus(`Error: ${err}`)
    }
  }

  /**
   * Transcribe audio PCM data to text.
   * TODO: Integrate with a real STT service (e.g., Whisper API).
   */
  private async transcribeAudio(_pcmData: Uint8Array): Promise<string> {
    // Placeholder — in production, send PCM to STT endpoint
    // Options: OpenAI Whisper, Deepgram, local Whisper, etc.
    console.log(`[Caduceus] Received ${_pcmData.length} bytes of PCM audio`)
    console.log('[Caduceus] STT not yet implemented — using placeholder')
    return 'Hello Hermes'
  }

  /**
   * Send a text prompt to the Hermes API and get a response.
   */
  private async sendToHermes(prompt: string): Promise<string> {
    console.log('[Caduceus] Sending to Hermes:', prompt)

    const response = await fetch(`${this.hermesUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'default',
        messages: [
          { role: 'system', content: 'You are Hermes, a concise AI assistant. Keep responses under 500 characters for display on smart glasses.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      throw new Error(`Hermes API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'No response'
  }

  /**
   * Display a response on the glasses, paginated.
   * Each page holds ~400 characters (recommended by Even Hub guidelines).
   */
  private displayResponse(text: string): void {
    const pageSize = 400
    this.pages = []

    for (let i = 0; i < text.length; i += pageSize) {
      this.pages.push(text.slice(i, i + pageSize))
    }

    if (this.pages.length === 0) {
      this.pages = ['(empty response)']
    }

    this.currentPage = 0
    this.showPage(0)
  }

  /**
   * Show a specific page on the glasses display.
   */
  private showPage(index: number): void {
    const pageContent = this.pages[index]
    const pageInfo = this.pages.length > 1
      ? `── ${index + 1}/${this.pages.length} ──\n`
      : ''

    this.updateStatus(`${pageInfo}${pageContent}`)
  }
}
