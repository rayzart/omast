# Omast Phase 2 — Raycast-like Quick AI Plan

This plan turns the interaction specification in
`omast_raycast_quickai_interaction_spec.md` into implementation work that fits
the current Omarchy shell contract.

## Outcome

Phase 2 keeps the Phase 1 launcher surface and universal input, then adds a
compact Quick AI conversation mode:

```text
Launcher
  └─ Tab → Quick AI input
               ├─ submit → loading / streaming / response
               ├─ follow-up → same temporary session
               └─ Ctrl+J → Full Chat handoff, when supported
```

The terminal launcher remains a truthful fallback. It must not be presented as
embedded streaming.

## Current capability boundary

Available now:

- one shell-hosted `PanelWindow` and compositor IPC toggle;
- scoped `shell.appLibrary` app search and launch;
- a universal QML input and keyboard state machine;
- safe argv handoff through `omarchy agent prompt`;
- `Process` stdin/stdout/stderr and lifecycle primitives;
- fake streaming events for UI and reducer development.

Not available from Omarchy today:

- a stable cross-Agent structured streaming protocol;
- a cross-Agent session identifier and follow-up contract;
- reliable cancel/retry semantics;
- model/tool/attachment capability discovery;
- a portable Full Chat session-import or handoff API.

Therefore real embedded answers, follow-ups, cancellation, and Full Chat
escalation are blocked on an explicit backend protocol. Parsing ANSI terminal
output is not an acceptable substitute.

## State model

Keep surface, mode, and generation as orthogonal dimensions rather than one
large enum.

```text
surface:     CLOSED | FLOATING | FULL_CHAT
mode:        LAUNCHER | QUICK_AI
launcher:    EMPTY | QUERY
generation:  IDLE | STARTING | STREAMING | CANCELING | COMPLETE | ERROR
```

Critical invariants:

1. `universalText` has one owner and is never copied during mode changes.
2. Tab/Shift+Tab preserve text, cursor position, selection, and IME state where
   Qt exposes it safely.
3. Every backend event carries `requestId` and `sessionId`; stale events from a
   prior open generation are ignored.
4. Prompt, context, and attachments are frozen into a request snapshot before
   generation starts.
5. Failure, cancellation, and retry never discard the prompt or conversation.

## Component and data flow

```text
Hyprland binding
  → omarchy-shell toggle
  → Omast.qml
      → InteractionReducer.js
      → LauncherProvider (scoped appLibrary)
      → UniversalInput
      → QuickAISessionStore
      → AgentBridge
          ├─ TerminalHandoffBridge (current fallback)
          └─ StreamBridge (future JSONL protocol)
      → ResponseView / Composer / ActionPalette
```

QML renders state and forwards events. State transitions, stale-event checks,
selection clamping, and session snapshots belong in pure JavaScript so they can
be tested with Node.

## Required AgentBridge contract

The UI should depend on this logical interface:

```text
capabilities()
start(request)
sendFollowUp(sessionId, request)
cancel(requestId)
retry(requestId)
handoff(sessionId)
```

Suggested future transport:

```text
omarchy agent stream --protocol jsonl-v1
```

Minimum request fields:

```text
protocolVersion, requestId, sessionId?, messages, cwd?, context[],
attachments[], agentId?, modelId?, tools[]
```

Minimum JSONL events:

```text
ready / capabilities
session.started
message.started / message.delta / message.completed
tool.started / tool.delta / tool.completed
request.error / request.cancelled / request.done
```

Every event must include the relevant `requestId` and `sessionId`; deltas also
need `messageId` and monotonic `seq`. Errors use stable codes such as
`no_default_agent`, `agent_missing`, `auth_required`, `unsupported`,
`provider_failure`, and `cancelled`. Stderr remains diagnostic only.

## Work packages

### P2.0 — Protocol decision (blocking)

Owner: project maintainer + Omarchy backend owner.

- Decide whether the protocol belongs upstream in Omarchy or in an Omast
  adapter service.
- Choose initial Agent coverage; do not promise all Agents before adapters
  exist.
- Freeze `jsonl-v1`, capability handshake, cancellation, and handoff semantics.

Exit: protocol fixtures and error codes are approved.

### P2.1 — Interaction reducer and fake bridge

Owner: logic/testing subagent.

- Implement the orthogonal state reducer.
- Implement request/session IDs and open-generation stale-event guards.
- Add fake JSONL parser and deterministic event fixtures.
- Cover UTF-8 split boundaries, malformed events, stderr, non-zero exit,
  cancellation races, retry, and late events.

Exit: the entire Quick AI state machine passes without a real model.

### P2.2 — Quick AI surface

Owner: Cursor primary implementation track.

- Reuse the Phase 1 `PanelWindow` and `TextField`.
- Add loading, response, error, retry, stop, and follow-up states.
- Implement first-Escape cancel / second-Escape close.
- Keep the composer visible while the response area scrolls.
- Add copy response and open-in-full-chat affordances behind capabilities.

Exit: fake streaming is keyboard-complete and visually stable.

### P2.3 — Response rendering

Owner: UI subagent.

- Start with safe plain text and basic Qt Markdown.
- Define safe link activation.
- Add code-block copy and horizontal scrolling.
- Treat syntax highlighting and complex tables as separate follow-ups.

Exit: long English/Chinese responses, code, lists, and links render safely.

### P2.4 — Real StreamBridge

Owner: Cursor primary implementation track after P2.0.

- Start one structured backend process using an argv array.
- Feed request JSON through stdin; parse JSONL incrementally.
- Implement capability-driven cancel, retry, follow-up, and errors.
- Fall back to `TerminalHandoffBridge` when streaming is unavailable.

Exit: supported Agents pass the protocol conformance suite.

### P2.5 — Full Chat handoff

Owner: integration subagent after backend support exists.

- Transfer opaque `sessionId` or `handoffToken`, not reconstructed transcript
  text.
- Preserve messages, model, attachments, context, and tool state.
- Keep Quick AI open with an actionable error if handoff fails.

Exit: Ctrl+J opens a non-empty Full Chat at the same conversation state.

### P2.6 — Context service

Owner: separate privacy/security workstream.

- Begin with explicit clipboard and active-window metadata.
- Add selected text, browser URL, files, and screenshots only through explicit
  capability and consent paths.
- Display every attached context item as a removable chip.

Exit: no context is silently captured or injected.

## QA gates

- Tab/Shift+Tab preserve exact text, cursor, selection, Chinese IME pre-edit,
  and do not recreate the window.
- Twenty rapid toggles produce at most one `omast` layer.
- Up/Down/Enter/Escape/Ctrl+K/Ctrl+L/Ctrl+J work without a mouse.
- First Escape during generation cancels; a later Escape closes.
- Late deltas/errors after close, retry, or a new request are ignored.
- UTF-8 chunks split inside Chinese characters and emoji reassemble correctly.
- Errors retain prompt, context, and previous messages.
- Active-monitor placement and previous-window focus restoration are verified
  under Wayland.
- Accessibility includes focus order, visible focus, control names/roles, and
  status/error announcements.
- Clean clone → validate → add → enable → restart shell → disable → enable →
  update → remove passes without silent Hyprland edits.

## Phase 2 completion definition

Phase 2 is complete only when a supported backend streams structured answer
events into the floating surface, follow-up preserves the same backend session,
cancel/retry are race-safe, and all unsupported Agents visibly fall back to the
terminal handoff. A styled fake stream or parsed terminal output does not meet
this definition.
