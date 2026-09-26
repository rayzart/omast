"use strict"

const assert = require("node:assert/strict")
const reducer = require("../InteractionReducer.js")
const viewModel = require("../QuickAIViewModel.js")

const actionIds = view => view.actions.map(action => action.id)
const hintShortcuts = view => view.keyboardHints.map(hint => hint.shortcut)
const event = (type, state, extra = {}) => Object.assign({
  type,
  openGeneration: state.openGeneration,
  requestId: state.activeRequestId
}, extra)

let state = reducer.createState(5)
let view = viewModel.createViewState(state, {})
assert.equal(view.status, "idle")
assert.equal(view.statusLabel, "Ready")
assert.equal(view.composerEnabled, true)
assert.equal(view.escapeBehavior, "close")
assert.deepEqual(hintShortcuts(view), ["Enter", "Esc"])
assert.equal(Object.isFrozen(view), true)
assert.equal(Object.isFrozen(view.actions), true)

state = reducer.beginAttempt(state, { prompt: "Explain deterministic UI" })
view = viewModel.createViewState(state, { cancel: true })
assert.equal(view.status, "loading")
assert.equal(view.statusLabel, "Thinking…")
assert.equal(view.busy, true)
assert.equal(view.composerEnabled, false)
assert.equal(view.escapeBehavior, "cancel")
assert.deepEqual(actionIds(view), ["stop"])

state = reducer.reduceEvent(state, event("session.started", state, {
  sessionId: "session-ui"
}))
state = reducer.reduceEvent(state, event("message.delta", state, {
  messageId: "message-ui",
  seq: 0,
  delta: "First"
}))
view = viewModel.createViewState(state, { cancel: true })
assert.equal(view.status, "streaming")
assert.equal(view.statusLabel, "Answering…")
assert.equal(view.responseText, "First")
assert.equal(view.hasResponse, true)
assert.deepEqual(actionIds(view), ["stop", "copy"])
assert.deepEqual(hintShortcuts(view), ["Esc", "Ctrl+C"])

state = reducer.requestCancel(state)
view = viewModel.createViewState(state, { cancel: true })
assert.equal(view.status, "loading")
assert.equal(view.generation, "CANCELING")
assert.equal(view.statusLabel, "Stopping…")
assert.equal(view.escapeBehavior, "close")
assert.deepEqual(actionIds(view), ["stop", "copy"])
assert.equal(view.actions[0].enabled, false)

state = reducer.reduceEvent(state, event("request.cancelled", state))
view = viewModel.createViewState(state, {
  followUp: true,
  handoff: true
})
assert.equal(view.status, "cancelled")
assert.equal(view.statusLabel, "Stopped")
assert.equal(view.responseText, "First")
assert.equal(view.composerEnabled, false)
assert.deepEqual(actionIds(view), ["copy", "retry", "open_full_chat"])

state = reducer.retryAttempt(state)
state = reducer.reduceEvent(state, event("message.delta", state, {
  messageId: "message-ui-error",
  seq: 0,
  delta: "Partial answer"
}))
state = reducer.reduceEvent(state, event("request.error", state, {
  code: "provider_failure",
  userMessage: "Provider unavailable."
}))
view = viewModel.createViewState(state, { followUp: true, handoff: true })
assert.equal(view.status, "error")
assert.deepEqual(view.error, {
  code: "provider_failure",
  message: "Provider unavailable."
})
assert.equal(view.responseText, "Partial answer")
assert.deepEqual(actionIds(view), ["copy", "retry", "open_full_chat"])

state = reducer.retryAttempt(state)
state = reducer.reduceEvent(state, event("message.completed", state, {
  messageId: "message-ui-retry",
  text: "Finished answer"
}))
state = reducer.reduceEvent(state, event("request.done", state))
view = viewModel.createViewState(state, {
  followUp: true,
  cancel: true,
  fullChat: true
})
assert.equal(view.status, "complete")
assert.equal(view.responseText, "Finished answer")
assert.equal(view.composerEnabled, true)
assert.deepEqual(actionIds(view), [
  "copy", "retry", "follow_up", "open_full_chat"
])
assert.deepEqual(hintShortcuts(view), [
  "Enter", "Esc", "R", "Ctrl+C", "Ctrl+J"
])

const controller = new viewModel.DeterministicFakeStreamController({
  openGeneration: 9,
  capabilities: { handoff: true }
})
const fakeSteps = [
  { type: "session.started", sessionId: "session-controller" },
  { type: "message.started", messageId: "message-controller" },
  {
    type: "message.delta",
    messageId: "message-controller",
    seq: 0,
    delta: "你好"
  },
  {
    type: "message.delta",
    messageId: "message-controller",
    seq: 1,
    delta: "，Omast 💡"
  },
  {
    type: "message.completed",
    messageId: "message-controller",
    text: "你好，Omast 💡"
  },
  { type: "request.done" }
]
view = controller.start({ prompt: "Stream deterministically" }, fakeSteps)
fakeSteps[2].delta = "mutated"
assert.equal(view.status, "loading")
assert.equal(controller.hasNext(), true)
assert.equal(controller.advance().status, "loading")
assert.equal(controller.advance().status, "streaming")
assert.equal(controller.advance().responseText, "你好")
assert.equal(controller.advance().responseText, "你好，Omast 💡")
assert.equal(controller.advance().status, "streaming")
view = controller.advance()
assert.equal(view.status, "complete")
assert.equal(view.responseText, "你好，Omast 💡")
assert.deepEqual(actionIds(view), [
  "copy", "retry", "follow_up", "open_full_chat"
])
assert.equal(controller.hasNext(), false)
assert.deepEqual(controller.advance(), view)

view = controller.retry([
  {
    type: "message.delta",
    messageId: "message-retry",
    seq: 0,
    delta: "Again"
  },
  {
    type: "message.delta",
    messageId: "message-retry",
    seq: 1,
    delta: " ignored after cancel"
  }
])
assert.equal(view.status, "loading")
assert.equal(controller.bridge.state.activeRequestId, 2)
assert.equal(controller.advance().responseText, "Again")
view = controller.cancel()
assert.equal(view.status, "loading")
assert.equal(view.statusLabel, "Stopping…")
assert.equal(controller.advance().responseText, "Again")
view = controller.acknowledgeCancel()
assert.equal(view.status, "cancelled")
assert.equal(view.responseText, "Again")

const callerCapabilities = { nested: { value: true } }
new viewModel.DeterministicFakeStreamController({
  capabilities: callerCapabilities
})
assert.equal(Object.isFrozen(callerCapabilities), false)
assert.equal(Object.isFrozen(callerCapabilities.nested), false)

console.log("quick AI view-model tests passed")
