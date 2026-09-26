# Changelog

All notable changes to Omast will be documented in this file.

## [Unreleased]

### Added

- Resident Omarchy-native launcher surface backed by the scoped application
  library, with up to six application results.
- Safe `DesktopEntries` fallback for Omarchy builds where the scoped
  application-library facade is unavailable at runtime, including Omarchy's
  hidden-entry filters and UWSM-aware application launch.
- One universal input for launcher and Quick AI modes, including lossless
  Tab/Shift+Tab mode switching.
- Keyboard and pointer application launch, wraparound Up/Down selection,
  surface-wide Escape dismissal, and outside-click dismissal.
- Safe argv-based handoff to the configured default Agent.
- Empty-input guard, duplicate-submit guard, and launch error feedback.
- Default Agent configuration shortcut.
- Manifest, model tests, smoke checks, and CI validation.
- Internal Phase 2 generation reducer and JSONL protocol fixtures with stale
  event, cancellation, retry, and malformed-stream coverage; not yet connected
  to the production UI.
- Test-only Fake Agent bridge covering handshake, transport-token isolation,
  stdout/exit ordering, bounded diagnostics, cancellation, and sticky terminal
  outcomes.
- Pure Quick AI view-model mapping reducer state to loading, streaming,
  complete, error, and cancelled presentation states, with capability-gated
  actions, keyboard hints, and a deterministic test-only stream controller.

## [0.1.0] - Unreleased

- Initial Marketplace release placeholder.
