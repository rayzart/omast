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

## Verified environment snapshot

As of 2026-09-24, the installed packages are Omarchy `4.0.4-1`, Quickshell
`0.3.1-1`, and Qt Declarative `6.11.2-1`. The earlier Phase 1 desktop run was
performed on Omarchy `4.0.3-1`; on that machine the plugin was injected with a
shell facade but `shell.appLibrary` was observed as `null` at runtime.

The packaged `4.0.4-1` shell source still constructs a scoped application
library facade for every manifest with the `menu` kind. Live injection must be
reverified after the updated plugin is installed and the desktop shell restarts;
the plan therefore preserves both application-provider paths.

The current worktree implements this provider order:

1. Prefer scoped `shell.appLibrary` for filtering, fuzzy ordering, icon
   fallback/refresh, launch feedback, and Omarchy's `uwsm-app` launch policy.
2. If that facade is absent, use Quickshell `DesktopEntries.applications` for
   discovery, apply Omarchy's configured and desktop-environment hidden-entry
   filters, and launch with a fixed `uwsm-app -- gtk-launch` argument array.

The fallback preserves visibility rules and UWSM launch scoping, and launcher
text is never evaluated as a command. It is still not behaviorally identical to
`shell.appLibrary`: it lacks the host's icon index/refresh and launch OSD, and
uses a simpler ranking algorithm. Those parity gaps remain documented and
tested rather than hidden behind a generic "application library" claim.

## Current capability boundary

Implemented now:

- one shell-hosted `PanelWindow` and compositor IPC toggle;
- application search and launch through scoped `shell.appLibrary` when
  available, with the explicit `DesktopEntries` fallback above;
- one resident universal QML input with Launcher/Quick AI mode switching;
- safe argv handoff through `omarchy agent prompt`;
- request-generation protection around the current terminal handoff.

Available platform primitives, but not yet a Phase 2 implementation:

- `Process` stdin/stdout/stderr and lifecycle primitives;
- deterministic fake streaming events for UI and reducer development.

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
3. Every request attempt gets a new `requestId`. Every applicable backend event
   carries that ID, plus `sessionId` once one exists; stale events from a prior
   request or open generation are ignored.
4. Prompt, context, and attachments are frozen into a request snapshot before
   generation starts.
5. Failure, cancellation, and retry never discard the prompt or conversation.

## Component and data flow

```text
Hyprland binding
  → omarchy-shell toggle
  → Omast.qml
      → InteractionReducer.js
      → LauncherProvider
          ├─ ScopedAppLibraryProvider (preferred)
          └─ DesktopEntriesProvider (compatibility fallback)
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
handoff(sessionId)
```

Retry is a controller operation, not `retry(requestId)`: it reuses the frozen
request snapshot but calls `start()` or `sendFollowUp()` with a new
`requestId`. Reusing the failed attempt's ID would make late events from that
attempt indistinguishable from the retry.

Suggested future transport:

```text
omarchy agent stream --protocol jsonl-v1
```

This command is an illustrative protocol endpoint only. It does not exist in
the verified Omarchy release and must not be invoked or advertised as a current
feature.

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

### P2.0 — Protocol decision (blocks P2.4 and P2.5)

Owner: project maintainer + Omarchy backend owner.

- Decide whether the protocol belongs upstream in Omarchy or in an Omast
  adapter service.
- Choose initial Agent coverage; do not promise all Agents before adapters
  exist.
- Freeze `jsonl-v1`, capability handshake, cancellation, and handoff semantics.

Exit: protocol fixtures and error codes are approved.

### P2.1 — Interaction reducer and fake bridge

Owner: logic/testing subagent.

P2.1a reducer/protocol seam is implemented in `InteractionReducer.js` with
deterministic Node fixtures. It is deliberately not wired to the production UI.

- Implement the orthogonal state reducer.
- Implement request/session IDs and open-generation stale-event guards.
- Add fake JSONL parser and deterministic event fixtures.
- Cover JSON lines split across decoded chunks, malformed events, stderr,
  non-zero exit, cancellation races, retry with a fresh request ID, and late
  events. Verify raw UTF-8 byte splitting separately with an integration
  fixture around Quickshell's process parser; JavaScript strings alone cannot
  model an incomplete multibyte sequence.

Exit: the entire Quick AI state machine passes without a real model.

### P2.2 — Quick AI surface

Owner: Cursor primary implementation track.

- Reuse the Phase 1 `PanelWindow` and `TextField`.
- Add loading, response, error, retry, stop, and follow-up states.
- Implement first-Escape cancel / second-Escape close.
- Keep the composer visible while the response area scrolls.
- Add copy response and open-in-full-chat affordances behind capabilities.
- Keep the existing single-line universal input for the first slice. Decide on
  a multiline Quick AI composer before claiming the specification's
  Shift+Enter newline behavior; do not silently replace the launcher input
  component during Launcher → Quick AI transition.

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
- Assign a fresh request ID to every retry while retaining the same immutable
  snapshot and, where supported, backend session.

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

- Exercise both application-provider paths. The preferred facade must retain
  Omarchy hidden-entry filtering, icon refresh, launch feedback, and launch
  scoping; the fallback must apply configured and desktop-environment hides,
  preserve UWSM launch scoping, never execute query text, and disclose its
  remaining icon/feedback/ranking gaps.
- After restarting the desktop shell, record `appLibraryAvailable` on Omarchy
  `4.0.4-1`; do not infer it from packaged source alone.
- Tab/Shift+Tab preserve exact text, cursor, selection, Chinese IME pre-edit,
  and do not recreate the window.
- Twenty rapid toggles produce at most one `omast` layer.
- Up/Down/Enter/Escape/Ctrl+K/Ctrl+L/Ctrl+J work without a mouse.
- First Escape during generation cancels; a later Escape closes.
- Late deltas/errors after close, retry, or a new request are ignored.
- An integration fixture that splits UTF-8 bytes inside Chinese characters and
  emoji reassembles them correctly before JSON event handling.
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

## Completed minimum implementation slice

P2.1a is implemented without changing the visible Phase 1 behavior:

1. Extract a pure generation reducer with `IDLE`, `STARTING`, `STREAMING`,
   `CANCELING`, `COMPLETE`, and `ERROR` transitions.
2. Add monotonic request IDs, open-generation guards, and immutable request
   snapshots; prove that retry uses a fresh ID and late events are ignored.
3. Add a line-level JSON event validator plus deterministic fake fixtures for
   start, delta, completion, error, cancellation, and malformed input.
4. Keep `omarchy agent prompt` as the only production bridge and leave the
   response UI disabled until the fake bridge can drive it in tests.

This slice establishes the protocol seam and race guarantees without implying
that Omarchy already supports embedded streaming. The next minimum slice is
P2.1b: a test-only `FakeBridge` that maps capability handshake, decoded chunks,
transport exit, and cancellation into reducer events. Production remains on
`omarchy agent prompt` until P2.0 defines a real structured backend.
