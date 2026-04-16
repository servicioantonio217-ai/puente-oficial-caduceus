     1|# QR Sideload Development Workflow
     2|
     3|Live development and testing on G2 glasses using QR code sideloading with hot-reload support.
     4|
     5|## Overview
     6|
     7|The Even Realities App can load custom apps via QR codes during development. This enables rapid iteration — code changes on your dev machine are reflected on the glasses in real time via Vite's hot module replacement (HMR).
     8|
     9|```
    10|Dev Machine (Vite) ──WiFi──► Phone (Even Realities App) ──BT──► G2 Glasses
    11|     0.0.0.0:5173              WebView (evenhub-cli)            Display + Audio
    12|```
    13|
    14|## Prerequisites
    15|
    16|### 1. Even Hub CLI
    17|
    18|Install the Even Hub CLI globally:
    19|
    20|```bash
    21|npm install -g @evenrealities/evenhub-cli
    22|```
    23|
    24|> **TypeScript peer dep conflict**: The Even Hub SDK requires `typescript@^5`, while some Vite versions ship `typescript@~6`. If `npm install -g` fails with a peer dependency error, use:
    25|> ```bash
    26|> npm install -g @evenrealities/evenhub-cli --legacy-peer-deps
    27|> ```
    28|
    29|### 2. Even Realities Account
    30|
    31|Authenticate with your Even Realities developer account:
    32|
    33|```bash
    34|evenhub login -e your@email.com
    35|```
    36|
    37|If you don't have a developer account yet, register at [hub.evenrealities.com](https://hub.evenrealities.com).
    38|
    39|### 3. Network Setup
    40|
    41|Your development machine and phone must be on the **same local network**. The phone connects to the Vite dev server directly via your machine's LAN IP — no cloud service is involved.
    42|
    43|- **Wi-Fi**: Phone and dev machine on the same SSID
    44|- **Firewall**: Port `5173` must be open for inbound connections from the local network
    45|- **Static IP (recommended)**: Assign a static IP to your dev machine or reserve one in your DHCP server. This avoids having to regenerate the QR code every time your IP changes.
    46|
    47|## Workflow
    48|
    49|### Step 1: Start the Dev Server
    50|
    51|```bash
    52|cd app
    53|npm install          # or: npm install --legacy-peer-deps
    54|npm run dev          # serves on http://0.0.0.0:5173
    55|```
    56|
    57|Vite binds to `0.0.0.0` by default, making it accessible from other devices on the network.
    58|
    59|### Step 2: Find Your Local IP
    60|
    61|```bash
    62|# Linux
    63|ip addr show | grep "inet " | grep -v 127.0.0.1
    64|
    65|# macOS
    66|ipconfig getifaddr en0
    67|```
    68|
    69|Note the IP address reachable from your phone (e.g., `192.168.1.50`).
    70|
    71|### Step 3: Generate the QR Code
    72|
    73|```bash
    74|npx @evenrealities/evenhub-cli qr --url "http://192.168.1.50:5173"
    75|```
    76|
    77|Replace `192.168.1.50` with your actual local IP.
    78|
    79|### Step 4: Scan and Test
    80|
    81|1. Open the **Even Realities App** on your phone
    82|2. Tap the QR scan option and point your camera at the generated code
    83|3. The app loads inside the Even Hub WebView on your phone
    84|4. Put on your G2 glasses — you'll see the Caduceus home screen
    85|5. Any code change triggers an instant HMR update on the glasses
    86|
    87|## app.json Network Whitelist
    88|
    89|The Even Hub app manifest (`app.json`) declares network permissions. **All domains that the app fetches from must be listed** in the `permissions` array. The Even Hub QA process greps the source code for undeclared fetch targets and rejects submissions with missing entries.
    90|
    91|Currently declared:
    92|
    93|```json
    94|{
    95|  "permissions": [
    96|    {
    97|      "name": "network",
    98|      "desc": "Connects to the G2 Bridge server for AI chat sessions."
    99|    }
   100|  ]
   101|}
   102|```
   103|
   104|The `"network"` permission grants blanket network access. If you add new external endpoints (e.g., a different STT provider), verify the manifest still covers them.
   105|
   106|## Audio Testing
   107|
   108|The `EvenAppBridge` audio API (PCM capture, voice recording) is **only available inside the Even Realities App's WebView**. Audio features will not work in a desktop browser — this is expected.
   109|
   110|When testing audio:
   111|
   112|1. Ensure your G2 glasses are paired and connected via Bluetooth
   113|2. Start a recording session on the glasses (tap to record)
   114|3. Speak normally — the 4-mic array captures audio at 16kHz PCM
   115|4. The VAD (Voice Activity Detection) auto-stops after 1.5s of silence
   116|5. The WAV is sent to the bridge server for STT processing
   117|
   118|For audio testing without glasses, use the phone WebUI at `http://localhost:5173` — text chat works in any browser.
   119|
   120|## Simulator (No Hardware Required)
   121|
   122|For UI layout testing without G2 glasses, use the Even Hub simulator:
   123|
   124|```bash
   125|npx @evenrealities/evenhub-simulator@latest http://localhost:5173
   126|```
   127|
   128|The simulator renders the glasses display in a browser window. Note that audio features and touchpad input are not available in the simulator.
   129|
   130|## Troubleshooting
   131|
   132|### QR scan fails or app doesn't load
   133|
   134|- Verify the phone can reach `http://192.168.x.x:5173` in its browser
   135|- Check firewall rules — port 5173 must be open for inbound connections
   136|- Ensure both devices are on the same network (same subnet)
   137|
   138|### App loads but glasses show nothing
   139|
   140|- Make sure G2 glasses are paired and connected to the Even Realities App
   141|- Check Bluetooth status on the phone
   142|- Restart the Even Realities App and try scanning the QR code again
   143|
   144|### `evenhub login` fails
   145|
   146|- Ensure you have an Even Realities developer account
   147|- Visit [hub.evenrealities.com](https://hub.evenrealities.com) to register
   148|- Check your email for verification
   149|
   150|### Vite proxy / CORS errors in production
   151|
   152|During development, Vite's dev server handles CORS transparently. In production (published app), the Bridge server must return `Access-Control-Allow-Origin: *` headers. For local development, this is not an issue.
   153|
   154|### `npm ci` fails with lockfile mismatch
   155|
   156|If you used `--legacy-peer-deps` locally, the generated `package-lock.json` may not be compatible with strict `npm ci`. Regenerate without flags:
   157|
   158|```bash
   159|rm -f package-lock.json
   160|npm install
   161|npm ci --dry-run    # verify it works
   162|```
   163|
   164|### TypeScript errors on `npm install`
   165|
   166|The Even Hub SDK requires `typescript@^5` while some Vite versions ship `typescript@~6`. Use `npm install --legacy-peer-deps` to bypass the conflict. The lockfile should still be generated without the flag (see above).
   167|
   168|### Hot-reload not working after phone lock
   169|
   170|If the WebView loses the connection when the phone locks, simply scan the QR code again. Vite's dev server stays running and the app reloads from the last state.
   171|