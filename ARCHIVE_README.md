# Archive: Scroll Debug Attempts (2026-04-20)

## What happened

This branch preserves the broken state after a series of failed attempts to fix glasses scrolling in the Caduceus G2 integration.

## Timeline

### v1.0.2 (Working)
- Glasses scrolling worked correctly
- Markdown rendered correctly on smartphone

### v1.0.3 (SSE Streaming - Introduced Problems)
MR !116: "feat: add SSE streaming support for agent responses (opt-in)"
- Added SSE streaming for agent responses
- **Broke**: Markdown rendering on smartphone (raw `**bold**` etc. shown)
- **Broke**: Something in the message handling changed

### v1.0.4 (Scroll "Fix" - Made it Worse)
MR !117: "fix(glasses): complete refactor of chat scrolling with message boundaries"
- Refactored scroll logic with messageBoundaries
- **Broke**: Glasses UI became completely unresponsive/slow
- Changes were only in `app/src/glass/` but scrolling still didn't work

### MR !118 (Revert SSE + Debug Logs)
- Reverted SSE streaming MR !116
- Added debug console.logs
- **Broke**: Severe performance degradation (~10-15 display() calls/second with logging)

### MR !119 (Remove Debug Logs)
- Removed debug logs
- **Still broken**: UI still hanging, scrolling not working

## Root Cause (Unknown)

After all these attempts, the actual root cause was never identified:
1. Why did SSE streaming break Markdown on smartphone?
2. Why did the scroll refactor make glasses UI unresponsive?
3. Why is display() called 10-15x per second?

## Files Changed

### In v1.0.3 (SSE Streaming)
- `app/src/api.ts` - SSE streaming endpoints
- `app/src/contexts/AppContext.tsx` - Streaming logic
- `bridge/src/g2_bridge/routers/messages.py` - Stream endpoint
- `bridge/src/g2_bridge/routers/audio.py` - Audio streaming

### In v1.0.4 (Scroll Refactor)
- `app/src/glass/normalize-chat-lines.ts` - NormalizedChat with messageBoundaries
- `app/src/glass/screens/chat.ts` - buildMessageScrollTargets refactor
- `app/src/glass/AppGlasses.tsx` - messageCount integration
- `app/src/glass/shared.ts` - AppSnapshot changes

## Recovery

Main branch was reset to v1.0.2 (the last working state).

## Lessons Learned

1. **Don't stack fixes on fixes** - Each change made things worse
2. **Test incrementally** - Should have tested SSE streaming alone before adding scroll changes
3. **Debug logs can cause performance issues** - Console.log in hot paths = bad
4. **Understand before changing** - Never identified why the original scroll logic was "broken"
