     1|# G2 Caduceus — Phase 5 TODO (2026-04-13)
     2|
     3|## Bugs & Features (reported by user)
     4|
     5|- [feat] Multi-select for deleting sessions in Smartphone UI
     6|- [bug] Record button press via ring and touchpad does not work in glasses chat/session
     7|- [x] ~~[bug] No response received in chat via smartphone UI after sending inputs/messages~~ — Fixed: robust text extraction with fallbacks + empty response error
     8|- [x] ~~[bug] No back button to home after creating new chat in smartphone UI~~ — Fixed: HomeScreen + /chat route + back button in ChatLayout
     9|- [x] ~~[bug] Glasses UI chat header shows "Idle - 0 Messages |>Record" — redundant and ugly~~ — Fixed: action-aware header (Record/Recording/Thinking/Offline) + no ActionBar
    10|
    11|## Root Cause Analysis (initial)
    12|
    13|### Bug 5: ActionBar enshittification ✅ FIXED
    14|- even-toolkit `buildChatDisplay` requires `actionBar` (type `string`, NOT optional)
    15|- During a CI typecheck fix (commit 64f2a45), `buildStaticActionBar(['Record'], 0)` was added to satisfy the type
    16|- This overwrote the user's explicitly designed and tested minimalist header
    17|- **Original design** (commit c7a5ac6, session 20260412_222024_e760d2):
    18|  - ActionBar was completely REMOVED as redundant — `actionBar: undefined`
    19|  - Header format: `<State> · <N> Messages` via `fieldJoin()`
    20|  - States: Idle, Listening, Thinking, Offline (plain text, no symbols)
    21|  - Gained 1 content line (7 → 8)
    22|  - Record trigger via `SELECT_HIGHLIGHTED` only
    23|- **User's NEW vision** (2026-04-13):
    24|  - Header should combine action label + state in one line: `Record · 0 Messages`
    25|  - When recording: `Recording · 0 Messages` (status replaces action label)
    26|  - No separate "|>Record" action bar line — that's redundant and ugly
    27|  - The "·" (middle dot) is the intended separator — user uses "-" because they can't type "·" on keyboard
    28|  - This is cleaner than the original "Idle · 0 Messages" because it shows the available ACTION rather than a passive state
    29|- **Fix implemented**:
    30|  - Removed `buildStaticActionBar(['Record'], 0)` from chat.ts
    31|  - Pass `actionBar: ' '` (space string) to satisfy even-toolkit type requirement
    32|  - Changed header to action-aware labels: "Record" / "Recording" / "Thinking" / "Offline"
    33|  - Header format: `Record · N Messages` normally, `Recording · N Messages` when active
    34|
    35|### Bug 4: No home screen / broken back navigation ✅ FIXED
    36|- App.tsx route "/" WAS ChatLayout — no separate home screen in WebUI
    37|- ChatLayout had no back button (only sessions/settings icons)
    38|- After newSession(), currentSession is set → all navigate('/') goes to same chat
    39|- **Fix implemented**:
    40|  - Created HomeScreen component with New Session, Sessions, and Resume actions
    41|  - New route structure: `/` = HomeLayout, `/chat` = ChatLayout (with back button)
    42|  - ChatLayout has ChatBackButton that calls closeSession() + navigate('/')
    43|  - SessionsScreen navigates to `/chat` instead of `/`
    44|  - ChatScreen "no session" state has "Back to home" button
    45|
    46|### Bug 3: Silent empty responses ✅ FIXED
    47|- ChatScreen sendText → Bridge → Hermes. Response extraction looked for `item.type === 'message'` + `part.type === 'output_text'`
    48|- If Hermes API format differs, assistantText stayed empty → no visible response, no error
    49|- **Fix implemented**:
    50|  - Extracted `extractAssistantText()` with multiple fallback strategies:
    51|    1. Standard Responses API: output[].content[].text (any type, not just 'output_text')
    52|    2. Direct text on output items (some API variants)
    53|  - Empty response now shows error: "Received empty response from agent"
    54|  - Optimistic user message is removed on empty response (same as on failure)
    55|  - Applied same fix to audio recording path
    56|
    57|### Bug 2: Record button not working on G2 🔒 NEEDS HARDWARE
    58|- chat.ts handles SELECT_HIGHLIGHTED → toggleRecording()
    59|- Possible: ActionBar intercepts tap before it becomes SELECT_HIGHLIGHTED
    60|- **Update**: ActionBar removed (Bug 5 fix) — this may resolve the interception issue
    61|- Possible: Ring generates different action type
    62|- Needs hardware testing to verify
    63|