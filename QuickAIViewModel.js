"use strict"

// Pure Quick AI presentation state. The production QML can consume
// createViewState() without knowing about transport events; the deterministic
// controller below is exported only through CommonJS for Node tests.
var STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  STREAMING: "streaming",
  COMPLETE: "complete",
  ERROR: "error",
  CANCELLED: "cancelled"
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
  var keys = Object.keys(value)
  for (var index = 0; index < keys.length; index++)
    freezeDeep(value[keys[index]])
  return Object.freeze(value)
}

function cloneFrozen(value) {
  return freezeDeep(JSON.parse(JSON.stringify(value)))
}

function action(id, label, shortcut, enabled) {
  return {
    id: id,
    label: label,
    shortcut: shortcut,
    enabled: enabled !== false
  }
}

function hint(shortcut, label) {
  return { shortcut: shortcut, label: label }
}

function visibleStatus(state) {
  if (state.generation === "STARTING" || state.generation === "CANCELING")
    return STATUS.LOADING
  if (state.generation === "STREAMING") return STATUS.STREAMING
  if (state.generation === "ERROR") return STATUS.ERROR
  if (state.generation === "COMPLETE")
    return state.cancelled ? STATUS.CANCELLED : STATUS.COMPLETE
  return STATUS.IDLE
}

function statusLabel(state, status) {
  if (state.generation === "CANCELING") return "Stopping…"
  if (status === STATUS.LOADING) return "Thinking…"
  if (status === STATUS.STREAMING) return "Answering…"
  if (status === STATUS.COMPLETE) return "Complete"
  if (status === STATUS.ERROR) return "Request failed"
  if (status === STATUS.CANCELLED) return "Stopped"
  return "Ready"
}

function createViewState(state, capabilities) {
  var source = state || {}
  var supported = capabilities || {}
  var status = visibleStatus(source)
  var responseText = String(source.responseText || "")
  var hasResponse = responseText.length > 0
  var hasSnapshot = source.snapshot !== null && source.snapshot !== undefined
  var hasSession = String(source.sessionId || "").length > 0
  var isStarting = source.generation === "STARTING"
  var isStreaming = source.generation === "STREAMING"
  var isCanceling = source.generation === "CANCELING"
  var isTerminal = status === STATUS.COMPLETE
    || status === STATUS.ERROR || status === STATUS.CANCELLED
  var canCancel = supported.cancel === true && (isStarting || isStreaming)
  var canFollowUp = supported.followUp === true
    && hasSession && status === STATUS.COMPLETE
  var canHandoff = (supported.handoff === true || supported.fullChat === true)
    && hasSession && isTerminal
  var actions = []
  var keyboardHints = []

  if (canCancel) actions.push(action("stop", "Stop", "Esc"))
  else if (isCanceling) actions.push(action("stop", "Stopping", "", false))

  if (hasResponse) actions.push(action("copy", "Copy response", "Ctrl+C"))
  if (isTerminal && hasSnapshot) actions.push(action("retry", "Retry", "R"))
  if (canFollowUp) actions.push(action("follow_up", "Follow up", "Enter"))
  if (canHandoff)
    actions.push(action("open_full_chat", "Open in Full Chat", "Ctrl+J"))

  if (canCancel) keyboardHints.push(hint("Esc", "Stop"))
  else keyboardHints.push(hint("Esc", "Close"))
  if (status === STATUS.IDLE) keyboardHints.unshift(hint("Enter", "Ask"))
  if (canFollowUp) keyboardHints.unshift(hint("Enter", "Follow up"))
  if (isTerminal && hasSnapshot) keyboardHints.push(hint("R", "Retry"))
  if (hasResponse) keyboardHints.push(hint("Ctrl+C", "Copy"))
  if (canHandoff) keyboardHints.push(hint("Ctrl+J", "Full Chat"))

  var error = source.error && typeof source.error === "object"
    ? {
        code: String(source.error.code || "provider_failure"),
        message: String(source.error.userMessage || "The request failed.")
      }
    : null

  return freezeDeep({
    status: status,
    generation: String(source.generation || "IDLE"),
    statusLabel: statusLabel(source, status),
    responseText: responseText,
    hasResponse: hasResponse,
    error: error,
    busy: isStarting || isStreaming || isCanceling,
    composerEnabled: status === STATUS.IDLE
      || (status === STATUS.COMPLETE && canFollowUp),
    escapeBehavior: canCancel ? "cancel" : "close",
    actions: actions,
    keyboardHints: keyboardHints
  })
}

function requireFakeBridge() {
  if (typeof require !== "function")
    throw new Error("deterministic fake streams are available only in Node tests")
  return require("./FakeAgentBridge.js")
}

function jsonl(event) {
  return JSON.stringify(event) + "\n"
}

function DeterministicFakeStreamController(options) {
  var config = options || {}
  var FakeAgentBridge = requireFakeBridge()
  this.bridge = new FakeAgentBridge(config.openGeneration || 0)
  this.token = this.bridge.beginTransport()
  this.capabilities = cloneFrozen(Object.assign({
    streaming: true,
    followUp: true,
    cancel: true,
    handoff: false
  }, config.capabilities || {}))
  this.steps = []
  this.stepIndex = 0
  this.attempt = null

  this.bridge.pushDecodedChunk(this.token, jsonl({
    type: "ready",
    protocolVersion: FakeAgentBridge.PROTOCOL_VERSION
  }))
  this.bridge.pushDecodedChunk(this.token, jsonl({
    type: "capabilities",
    capabilities: this.capabilities
  }))
}

DeterministicFakeStreamController.prototype.setSteps = function(steps) {
  if (!Array.isArray(steps)) throw new TypeError("steps must be an array")
  this.steps = cloneFrozen(steps)
  this.stepIndex = 0
}

DeterministicFakeStreamController.prototype.start = function(request, steps) {
  this.attempt = this.bridge.start(this.token, request)
  this.setSteps(steps || [])
  return this.viewState()
}

DeterministicFakeStreamController.prototype.retry = function(steps) {
  this.attempt = this.bridge.retry(this.token)
  this.setSteps(steps || [])
  return this.viewState()
}

DeterministicFakeStreamController.prototype.eventForAttempt = function(step) {
  if (!step || typeof step !== "object" || Array.isArray(step))
    throw new TypeError("fake stream step must be an event object")
  return Object.assign({}, step, {
    openGeneration: this.attempt.openGeneration,
    requestId: this.attempt.requestId
  })
}

DeterministicFakeStreamController.prototype.advance = function() {
  if (!this.attempt) throw new Error("start a fake request before advancing")
  if (this.stepIndex >= this.steps.length) return this.viewState()
  var event = this.eventForAttempt(this.steps[this.stepIndex])
  this.stepIndex += 1
  this.bridge.pushDecodedChunk(this.token, jsonl(event))
  return this.viewState()
}

DeterministicFakeStreamController.prototype.cancel = function() {
  this.bridge.cancel(this.token)
  return this.viewState()
}

DeterministicFakeStreamController.prototype.acknowledgeCancel = function() {
  this.bridge.acknowledgeCancel(this.token)
  return this.viewState()
}

DeterministicFakeStreamController.prototype.viewState = function() {
  return createViewState(this.bridge.state, this.capabilities)
}

DeterministicFakeStreamController.prototype.hasNext = function() {
  return this.stepIndex < this.steps.length
}

if (typeof module !== "undefined") {
  module.exports = {
    STATUS: STATUS,
    createViewState: createViewState,
    DeterministicFakeStreamController: DeterministicFakeStreamController
  }
}
