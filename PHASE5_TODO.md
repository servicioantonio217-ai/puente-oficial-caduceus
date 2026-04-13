# G2 Caduceus — Phase 5 TODO (2026-04-13)

## Bugs & Features (reported by user)

- [feat] Multi-select for deleting sessions in Smartphone UI
- [bug] Record button press via ring and touchpad does not work in glasses chat/session
- [x] ~~[bug] No response received in chat via smartphone UI after sending inputs/messages~~ — Fixed: robust text extraction with fallbacks + empty response error
- [x] ~~[bug] No back button to home after creating new chat in smartphone UI~~ — Fixed: HomeScreen + /chat route + back button in ChatLayout
- [x] ~~[bug] Glasses UI chat header shows "Idle - 0 Messages |>Record" — redundant and ugly~~ — Fixed: action-aware header (Record/Recording/Thinking/Offline) + no ActionBar

## Root Cause Analysis (initial)

### Bug 5: ActionBar enshittification ✅ FIXED
- even-toolkit `buildChatDisplay` requires `actionBar` (type `string`, NOT optional)
- During a CI typecheck fix (commit 64f2a45), `buildStaticActionBar(['Record'], 0)` was added to satisfy the type
- This overwrote the user's explicitly designed and tested minimalist header
- **Original design** (commit c7a5ac6, session 20260412_222024_e760d2):
  - ActionBar was completely REMOVED as redundant — `actionBar: undefined`
  - Header format: `<State> · <N> Messages` via `fieldJoin()`
  - States: Idle, Listening, Thinking, Offline (plain text, no symbols)
  - Gained 1 content line (7 → 8)
  - Record trigger via `SELECT_HIGHLIGHTED` only
- **User's NEW vision** (2026-04-13):
  - Header should combine action label + state in one line: `Record · 0 Messages`
  - When recording: `Recording · 0 Messages` (status replaces action label)
  - No separate "|>Record" action bar line — that's redundant and ugly
  - The "·" (middle dot) is the intended separator — user uses "-" because they can't type "·" on keyboard
  - This is cleaner than the original "Idle · 0 Messages" because it shows the available ACTION rather than a passive state
- **Fix implemented**:
  - Removed `buildStaticActionBar(['Record'], 0)` from chat.ts
  - Pass `actionBar: ' '` (space string) to satisfy even-toolkit type requirement
  - Changed header to action-aware labels: "Record" / "Recording" / "Thinking" / "Offline"
  - Header format: `Record · N Messages` normally, `Recording · N Messages` when active

### Bug 4: No home screen / broken back navigation ✅ FIXED
- App.tsx route "/" WAS ChatLayout — no separate home screen in WebUI
- ChatLayout had no back button (only sessions/settings icons)
- After newSession(), currentSession is set → all navigate('/') goes to same chat
- **Fix implemented**:
  - Created HomeScreen component with New Session, Sessions, and Resume actions
  - New route structure: `/` = HomeLayout, `/chat` = ChatLayout (with back button)
  - ChatLayout has ChatBackButton that calls closeSession() + navigate('/')
  - SessionsScreen navigates to `/chat` instead of `/`
  - ChatScreen "no session" state has "Back to home" button

### Bug 3: Silent empty responses ✅ FIXED
- ChatScreen sendText → Bridge → Hermes. Response extraction looked for `item.type === 'message'` + `part.type === 'output_text'`
- If Hermes API format differs, assistantText stayed empty → no visible response, no error
- **Fix implemented**:
  - Extracted `extractAssistantText()` with multiple fallback strategies:
    1. Standard Responses API: output[].content[].text (any type, not just 'output_text')
    2. Direct text on output items (some API variants)
  - Empty response now shows error: "Received empty response from agent"
  - Optimistic user message is removed on empty response (same as on failure)
  - Applied same fix to audio recording path

### Bug 2: Record button not working on G2 🔒 NEEDS HARDWARE
- chat.ts handles SELECT_HIGHLIGHTED → toggleRecording()
- Possible: ActionBar intercepts tap before it becomes SELECT_HIGHLIGHTED
- **Update**: ActionBar removed (Bug 5 fix) — this may resolve the interception issue
- Possible: Ring generates different action type
- Needs hardware testing to verify
