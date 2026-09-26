"use strict"

// Test-only transport harness for the Phase 2 interaction reducer. It never
// starts a process or calls a model. Tests explicitly deliver decoded stdout,
// stderr, EOF, and exit callbacks tagged with a transport generation token.
var InteractionReducer = require("./InteractionReducer.js")

var PROTOCOL_VERSION = 1
var MAX_STDERR_LENGTH = 4096

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

function canonicalJson(value) {
  if (Array.isArray(value)) {
    var arrayValues = []
    for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex++)
      arrayValues.push(canonicalJson(value[arrayIndex]))
    return "[" + arrayValues.join(",") + "]"
  }
  if (value && typeof value === "object") {
    var keys = Object.keys(value).sort()
    var objectValues = []
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex++) {
      var key = keys[keyIndex]
      objectValues.push(JSON.stringify(key) + ":" + canonicalJson(value[key]))
    }
    return "{" + objectValues.join(",") + "}"
  }
  return JSON.stringify(value)
}

function isInteger(value) {
  return typeof value === "number" && Number.isFinite(value)
    && Math.trunc(value) === value
}

function isTerminal(state) {
  return state.generation === InteractionReducer.GENERATION.COMPLETE
    || state.generation === InteractionReducer.GENERATION.ERROR
}

function bridgeError(code, message) {
  var error = new Error(message)
  error.code = code
  return error
}

function ignoredResult(state) {
  return {
    ignored: true,
    events: [],
    errors: [],
    state: state
  }
}

function FakeAgentBridge(openGeneration) {
  this.state = InteractionReducer.createState(openGeneration)
  this.nextTransportToken = 1
  this.transportToken = 0
  this.jsonlState = InteractionReducer.createJsonlState()

  this.readyVersion = 0
  this.capabilitiesReceived = false
  this.capabilities = Object.freeze({})
  this.capabilitiesCanonical = ""
  this.handshakeComplete = false
  this.protocolError = null
  this.ignoredRequestEvents = 0

  this.stdoutFinished = false
  this.exitReceived = false
  this.exitCode = null
  this.transportFinalized = false
  this.validationErrors = []
  this.stderrText = ""
  this.stderrTruncated = false

  this.terminalNotificationCount = 0
  this.terminalNotifications = []
  this.notifiedAttempts = Object.create(null)
}

FakeAgentBridge.prototype.beginTransport = function() {
  var token = this.nextTransportToken
  this.nextTransportToken += 1
  this.transportToken = token
  this.jsonlState = InteractionReducer.createJsonlState()

  this.readyVersion = 0
  this.capabilitiesReceived = false
  this.capabilities = Object.freeze({})
  this.capabilitiesCanonical = ""
  this.handshakeComplete = false
  this.protocolError = null
  this.ignoredRequestEvents = 0

  this.stdoutFinished = false
  this.exitReceived = false
  this.exitCode = null
  this.transportFinalized = false
  this.validationErrors = []
  this.stderrText = ""
  this.stderrTruncated = false
  return token
}

FakeAgentBridge.prototype.isCurrentToken = function(token) {
  return isInteger(token) && token === this.transportToken
}

FakeAgentBridge.prototype.requireCurrentTransport = function(token) {
  if (!this.isCurrentToken(token))
    throw bridgeError("stale_transport", "transport token is no longer active")
  if (this.transportFinalized)
    throw bridgeError("transport_ended", "transport has ended")
}

FakeAgentBridge.prototype.updateHandshake = function() {
  this.handshakeComplete = this.protocolError === null
    && this.readyVersion === PROTOCOL_VERSION
    && this.capabilitiesReceived
}

FakeAgentBridge.prototype.attemptKey = function(state) {
  return state.openGeneration + ":" + state.activeRequestId
}

FakeAgentBridge.prototype.noteTerminal = function() {
  if (!isTerminal(this.state) || !this.state.activeRequestId) return
  var key = this.attemptKey(this.state)
  if (this.notifiedAttempts[key]) return
  this.notifiedAttempts[key] = true
  this.terminalNotificationCount += 1
  this.terminalNotifications.push(Object.freeze({
    openGeneration: this.state.openGeneration,
    requestId: this.state.activeRequestId,
    generation: this.state.generation
  }))
}

FakeAgentBridge.prototype.setState = function(nextState) {
  this.state = nextState
  this.noteTerminal()
}

FakeAgentBridge.prototype.setProtocolError = function(detail) {
  if (this.protocolError) return
  this.protocolError = Object.freeze({
    code: "protocol_error",
    userMessage: "Agent protocol handshake failed.",
    detail: String(detail || "invalid handshake")
  })
  this.handshakeComplete = false

  if (this.state.activeRequestId && !isTerminal(this.state)) {
    this.setState(InteractionReducer.reduceEvent(this.state, {
      type: "request.error",
      openGeneration: this.state.openGeneration,
      requestId: this.state.activeRequestId,
      code: this.protocolError.code,
      userMessage: this.protocolError.userMessage
    }))
  }
}

FakeAgentBridge.prototype.handleReady = function(event) {
  if (event.protocolVersion !== PROTOCOL_VERSION) {
    this.setProtocolError("unsupported protocol version " + event.protocolVersion)
    return
  }
  if (this.readyVersion === 0) this.readyVersion = event.protocolVersion
  else if (this.readyVersion !== event.protocolVersion) {
    this.setProtocolError("conflicting ready event")
    return
  }
  this.updateHandshake()
}

FakeAgentBridge.prototype.handleCapabilities = function(event) {
  var incomingCanonical = canonicalJson(event.capabilities)
  if (!this.capabilitiesReceived) {
    this.capabilities = cloneFrozen(event.capabilities)
    this.capabilitiesCanonical = incomingCanonical
    this.capabilitiesReceived = true
  } else if (this.capabilitiesCanonical !== incomingCanonical) {
    this.setProtocolError("conflicting capabilities event")
    return
  }
  this.updateHandshake()
}

FakeAgentBridge.prototype.handleEvent = function(event) {
  if (event.type === "ready") {
    this.handleReady(event)
    return
  }
  if (event.type === "capabilities") {
    this.handleCapabilities(event)
    return
  }
  if (!this.handshakeComplete || this.protocolError) {
    this.ignoredRequestEvents += 1
    return
  }
  this.setState(InteractionReducer.reduceEvent(this.state, event))
}

FakeAgentBridge.prototype.consumeParsed = function(result) {
  this.jsonlState = result.state
  for (var errorIndex = 0; errorIndex < result.errors.length; errorIndex++)
    this.validationErrors.push(result.errors[errorIndex])
  for (var eventIndex = 0; eventIndex < result.events.length; eventIndex++)
    this.handleEvent(result.events[eventIndex])

  return {
    ignored: false,
    events: result.events,
    errors: result.errors,
    state: this.state
  }
}

FakeAgentBridge.prototype.start = function(token, request) {
  this.requireCurrentTransport(token)
  if (this.protocolError)
    throw bridgeError(this.protocolError.code, this.protocolError.userMessage)
  if (!this.handshakeComplete)
    throw bridgeError("handshake_required", "ready and capabilities are required before start")
  this.setState(InteractionReducer.beginAttempt(this.state, request))
  return Object.freeze({
    openGeneration: this.state.openGeneration,
    requestId: this.state.activeRequestId,
    snapshot: this.state.snapshot
  })
}

FakeAgentBridge.prototype.retry = function(token) {
  this.requireCurrentTransport(token)
  if (this.protocolError)
    throw bridgeError(this.protocolError.code, this.protocolError.userMessage)
  if (!this.handshakeComplete)
    throw bridgeError("handshake_required", "ready and capabilities are required before retry")
  this.setState(InteractionReducer.retryAttempt(this.state))
  return Object.freeze({
    openGeneration: this.state.openGeneration,
    requestId: this.state.activeRequestId,
    snapshot: this.state.snapshot
  })
}

FakeAgentBridge.prototype.pushDecodedChunk = function(token, chunk) {
  if (!this.isCurrentToken(token) || this.stdoutFinished)
    return ignoredResult(this.state)
  if (typeof chunk !== "string")
    throw new TypeError("decoded JSONL chunk must be a string")
  return this.consumeParsed(
    InteractionReducer.pushDecodedChunk(this.jsonlState, chunk))
}

FakeAgentBridge.prototype.pushStderr = function(token, chunk) {
  if (!this.isCurrentToken(token)) return { ignored: true }
  if (typeof chunk !== "string") throw new TypeError("stderr chunk must be a string")

  var remaining = Math.max(0, MAX_STDERR_LENGTH - this.stderrText.length)
  if (remaining > 0) this.stderrText += chunk.slice(0, remaining)
  if (chunk.length > remaining) this.stderrTruncated = true
  return { ignored: false }
}

FakeAgentBridge.prototype.cancel = function(token) {
  this.requireCurrentTransport(token)
  this.setState(InteractionReducer.requestCancel(this.state))
  return this.state
}

FakeAgentBridge.prototype.acknowledgeCancel = function(token) {
  this.requireCurrentTransport(token)
  this.setState(InteractionReducer.reduceEvent(this.state, {
    type: "request.cancelled",
    openGeneration: this.state.openGeneration,
    requestId: this.state.activeRequestId
  }))
  return this.state
}

FakeAgentBridge.prototype.transportError = function(code, userMessage) {
  if (!this.state.activeRequestId || isTerminal(this.state)) return
  this.setState(InteractionReducer.reduceEvent(this.state, {
    type: "request.error",
    openGeneration: this.state.openGeneration,
    requestId: this.state.activeRequestId,
    code: code,
    userMessage: userMessage
  }))
}

FakeAgentBridge.prototype.finalizeTransport = function() {
  if (this.transportFinalized || !this.stdoutFinished || !this.exitReceived) return
  this.transportFinalized = true

  if (!this.handshakeComplete && !this.protocolError)
    this.setProtocolError("transport ended before protocol handshake completed")

  // An explicit backend terminal event is authoritative and sticky. A cancel
  // requested before transport teardown converges to cancelled completion,
  // regardless of whether the process reports a clean or non-zero exit.
  if (!this.state.activeRequestId || isTerminal(this.state)) return
  if (this.state.generation === InteractionReducer.GENERATION.CANCELING) {
    this.setState(InteractionReducer.reduceEvent(this.state, {
      type: "request.cancelled",
      openGeneration: this.state.openGeneration,
      requestId: this.state.activeRequestId
    }))
    return
  }
  if (this.exitCode !== 0) {
    this.transportError(
      "transport_exit_nonzero",
      "Agent transport exited with code " + this.exitCode + ".")
  } else {
    this.transportError(
      "transport_eof",
      "Agent transport ended before a terminal request event.")
  }
}

FakeAgentBridge.prototype.finishStdout = function(token) {
  if (!this.isCurrentToken(token)) return ignoredResult(this.state)
  if (this.stdoutFinished) return ignoredResult(this.state)

  var result = this.consumeParsed(
    InteractionReducer.finishDecodedStream(this.jsonlState))
  this.stdoutFinished = true
  this.finalizeTransport()
  result.state = this.state
  return result
}

FakeAgentBridge.prototype.exitTransport = function(token, exitCode) {
  if (!this.isCurrentToken(token)) return { ignored: true, state: this.state }
  if (!isInteger(exitCode)) throw new TypeError("exitCode must be an integer")
  if (this.exitReceived) {
    if (this.exitCode !== exitCode)
      throw bridgeError("conflicting_exit", "transport reported conflicting exit codes")
    return { ignored: true, state: this.state }
  }

  this.exitReceived = true
  this.exitCode = exitCode
  this.finalizeTransport()
  return { ignored: false, state: this.state }
}

FakeAgentBridge.prototype.advanceOpenGeneration = function() {
  this.setState(InteractionReducer.advanceOpenGeneration(this.state))
  return this.state
}

FakeAgentBridge.PROTOCOL_VERSION = PROTOCOL_VERSION
FakeAgentBridge.MAX_STDERR_LENGTH = MAX_STDERR_LENGTH

module.exports = FakeAgentBridge
