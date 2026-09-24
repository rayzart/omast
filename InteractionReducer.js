"use strict"

var GENERATION = {
  IDLE: "IDLE",
  STARTING: "STARTING",
  STREAMING: "STREAMING",
  CANCELING: "CANCELING",
  COMPLETE: "COMPLETE",
  ERROR: "ERROR"
}

var REQUEST_EVENT_TYPES = {
  "request.started": true,
  "session.started": true,
  "message.started": true,
  "message.delta": true,
  "message.completed": true,
  "tool.started": true,
  "tool.delta": true,
  "tool.completed": true,
  "request.error": true,
  "request.cancelled": true,
  "request.done": true
}

function isRequestEventType(value) {
  return Object.prototype.hasOwnProperty.call(REQUEST_EVENT_TYPES, value)
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isInteger(value) {
  return typeof value === "number" && Number.isFinite(value)
    && Math.trunc(value) === value
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value

  var keys = Object.keys(value)
  for (var index = 0; index < keys.length; index++)
    freezeDeep(value[keys[index]])

  return Object.freeze(value)
}

function cloneJson(value, label) {
  var encoded
  try {
    encoded = JSON.stringify(value)
  } catch (error) {
    throw new TypeError((label || "value") + " must be JSON-serializable: " + error.message)
  }
  if (encoded === undefined)
    throw new TypeError((label || "value") + " must be JSON-serializable")
  return JSON.parse(encoded)
}

function createRequestSnapshot(request) {
  if (!isObject(request)) throw new TypeError("request must be an object")

  var snapshot = cloneJson(request, "request")
  // Attempt identity belongs to the transport envelope, not the reusable
  // request snapshot. A retry must reuse content while receiving a new ID.
  delete snapshot.requestId
  delete snapshot.openGeneration
  return freezeDeep(snapshot)
}

function normalizeOpenGeneration(value) {
  var generation = Number(value)
  if (!Number.isFinite(generation) || generation < 0)
    throw new TypeError("openGeneration must be a non-negative number")
  return Math.trunc(generation)
}

function createState(openGeneration) {
  return Object.freeze({
    generation: GENERATION.IDLE,
    openGeneration: normalizeOpenGeneration(openGeneration === undefined ? 0 : openGeneration),
    nextRequestId: 1,
    activeRequestId: 0,
    snapshot: null,
    sessionId: "",
    responseText: "",
    lastSeq: -1,
    error: null,
    cancelled: false
  })
}

function copyState(state, overrides) {
  var next = {
    generation: state.generation,
    openGeneration: state.openGeneration,
    nextRequestId: state.nextRequestId,
    activeRequestId: state.activeRequestId,
    snapshot: state.snapshot,
    sessionId: state.sessionId,
    responseText: state.responseText,
    lastSeq: state.lastSeq,
    error: state.error,
    cancelled: state.cancelled
  }
  var keys = Object.keys(overrides || {})
  for (var index = 0; index < keys.length; index++)
    next[keys[index]] = overrides[keys[index]]
  return Object.freeze(next)
}

function advanceOpenGeneration(state) {
  return copyState(state, {
    generation: GENERATION.IDLE,
    openGeneration: state.openGeneration + 1,
    activeRequestId: 0,
    snapshot: null,
    sessionId: "",
    responseText: "",
    lastSeq: -1,
    error: null,
    cancelled: false
  })
}

function canBeginAttempt(state) {
  return state.generation === GENERATION.IDLE
    || state.generation === GENERATION.COMPLETE
    || state.generation === GENERATION.ERROR
}

function beginWithSnapshot(state, snapshot, sessionId) {
  if (!canBeginAttempt(state))
    throw new Error("cannot begin a request while generation is " + state.generation)
  if (!isInteger(state.nextRequestId) || state.nextRequestId < 1)
    throw new Error("nextRequestId must be a positive integer")

  return copyState(state, {
    generation: GENERATION.STARTING,
    nextRequestId: state.nextRequestId + 1,
    activeRequestId: state.nextRequestId,
    snapshot: snapshot,
    sessionId: String(sessionId || ""),
    responseText: "",
    lastSeq: -1,
    error: null,
    cancelled: false
  })
}

function beginAttempt(state, request) {
  return beginWithSnapshot(state, createRequestSnapshot(request), request.sessionId)
}

function retryAttempt(state) {
  if ((state.generation !== GENERATION.ERROR
       && state.generation !== GENERATION.COMPLETE) || !state.snapshot)
    throw new Error("retry requires a completed or failed request snapshot")

  // Clone and freeze again so an attempt owns its snapshot even if a caller
  // retains an older state object.
  var snapshot = createRequestSnapshot(state.snapshot)
  return beginWithSnapshot(state, snapshot, state.sessionId)
}

function requestCancel(state) {
  if (state.generation !== GENERATION.STARTING
      && state.generation !== GENERATION.STREAMING) return state
  return copyState(state, { generation: GENERATION.CANCELING })
}

function eventMatchesAttempt(state, event) {
  return isObject(event)
    && event.openGeneration === state.openGeneration
    && event.requestId === state.activeRequestId
}

function eventError(event) {
  return freezeDeep({
    code: String(event.code || "provider_failure"),
    userMessage: String(event.userMessage || "The request failed.")
  })
}

function reduceEvent(state, event) {
  if (!isObject(event) || !isRequestEventType(event.type)) return state
  if (!eventMatchesAttempt(state, event)) return state

  if (event.type === "request.started") {
    if (state.generation !== GENERATION.STARTING) return state
    return state
  }

  if (event.type === "session.started") {
    if (state.generation !== GENERATION.STARTING
        && state.generation !== GENERATION.STREAMING) return state
    return copyState(state, { sessionId: String(event.sessionId || "") })
  }

  if (event.type === "message.started") {
    if (state.generation !== GENERATION.STARTING
        && state.generation !== GENERATION.STREAMING) return state
    return copyState(state, { generation: GENERATION.STREAMING })
  }

  if (event.type === "message.delta") {
    if (state.generation !== GENERATION.STARTING
        && state.generation !== GENERATION.STREAMING) return state
    if (!isInteger(event.seq) || event.seq <= state.lastSeq) return state
    return copyState(state, {
      generation: GENERATION.STREAMING,
      responseText: state.responseText + String(event.delta || ""),
      lastSeq: event.seq
    })
  }

  if (event.type === "message.completed") {
    if (state.generation !== GENERATION.STARTING
        && state.generation !== GENERATION.STREAMING) return state
    var completedText = event.text === undefined
      ? state.responseText : String(event.text)
    return copyState(state, {
      generation: GENERATION.STREAMING,
      responseText: completedText
    })
  }

  if (event.type === "request.error") {
    if (state.generation === GENERATION.COMPLETE
        || state.generation === GENERATION.ERROR) return state
    return copyState(state, {
      generation: GENERATION.ERROR,
      error: eventError(event)
    })
  }

  if (event.type === "request.cancelled") {
    if (state.generation !== GENERATION.CANCELING
        && state.generation !== GENERATION.STARTING
        && state.generation !== GENERATION.STREAMING) return state
    return copyState(state, {
      generation: GENERATION.COMPLETE,
      cancelled: true
    })
  }

  if (event.type === "request.done") {
    if (state.generation === GENERATION.CANCELING)
      return copyState(state, {
        generation: GENERATION.COMPLETE,
        cancelled: true
      })
    if (state.generation !== GENERATION.STARTING
        && state.generation !== GENERATION.STREAMING) return state
    return copyState(state, { generation: GENERATION.COMPLETE })
  }

  // Tool events are validated and routed by the bridge, but P2.1a does not
  // yet add tool state to the generation reducer.
  return state
}

function parserState(buffer, nextLineNumber) {
  return Object.freeze({
    buffer: String(buffer || ""),
    nextLineNumber: nextLineNumber
  })
}

function createJsonlState() {
  return parserState("", 1)
}

function validationError(lineNumber, code, message, line) {
  return Object.freeze({
    lineNumber: lineNumber,
    code: code,
    message: message,
    line: line
  })
}

function requireString(event, key) {
  return typeof event[key] === "string" && event[key].length > 0
}

function validateEvent(event, lineNumber, line) {
  if (!isObject(event))
    return validationError(lineNumber, "invalid_event", "event must be a JSON object", line)
  if (!requireString(event, "type"))
    return validationError(lineNumber, "invalid_type", "event.type must be a non-empty string", line)

  if (event.type === "ready") {
    if (!isInteger(event.protocolVersion) || event.protocolVersion < 1)
      return validationError(lineNumber, "invalid_protocol", "ready.protocolVersion must be a positive integer", line)
    return null
  }

  if (event.type === "capabilities") {
    if (!isObject(event.capabilities))
      return validationError(lineNumber, "invalid_capabilities", "capabilities must be an object", line)
    return null
  }

  if (!isRequestEventType(event.type))
    return validationError(lineNumber, "unknown_type", "unsupported event type: " + event.type, line)
  if (!isInteger(event.openGeneration) || event.openGeneration < 0)
    return validationError(lineNumber, "invalid_open_generation", "openGeneration must be a non-negative integer", line)
  if (!isInteger(event.requestId) || event.requestId < 1)
    return validationError(lineNumber, "invalid_request_id", "requestId must be a positive integer", line)

  if (event.type === "session.started" && !requireString(event, "sessionId"))
    return validationError(lineNumber, "invalid_session_id", "session.started requires sessionId", line)

  if ((event.type === "message.started"
       || event.type === "message.delta"
       || event.type === "message.completed")
      && !requireString(event, "messageId"))
    return validationError(lineNumber, "invalid_message_id", event.type + " requires messageId", line)

  if (event.type === "message.delta") {
    if (!isInteger(event.seq) || event.seq < 0)
      return validationError(lineNumber, "invalid_sequence", "message.delta.seq must be a non-negative integer", line)
    if (typeof event.delta !== "string")
      return validationError(lineNumber, "invalid_delta", "message.delta.delta must be a string", line)
  }

  if (event.type === "message.completed"
      && event.text !== undefined && typeof event.text !== "string")
    return validationError(lineNumber, "invalid_message_text", "message.completed.text must be a string", line)

  if ((event.type === "tool.started"
       || event.type === "tool.delta"
       || event.type === "tool.completed")
      && !requireString(event, "toolCallId"))
    return validationError(lineNumber, "invalid_tool_id", event.type + " requires toolCallId", line)

  if (event.type === "request.error") {
    if (!requireString(event, "code"))
      return validationError(lineNumber, "invalid_error_code", "request.error requires code", line)
    if (!requireString(event, "userMessage"))
      return validationError(lineNumber, "invalid_error_message", "request.error requires userMessage", line)
  }

  return null
}

function validateJsonlLine(line, lineNumber) {
  var source = String(line || "")
  var event
  try {
    event = JSON.parse(source)
  } catch (error) {
    return {
      ok: false,
      error: validationError(lineNumber, "invalid_json", error.message, source)
    }
  }

  var error = validateEvent(event, lineNumber, source)
  return error ? { ok: false, error: error } : { ok: true, event: freezeDeep(event) }
}

function consumeLine(line, lineNumber, events, errors) {
  var source = line.length > 0 && line.charAt(line.length - 1) === "\r"
    ? line.slice(0, -1) : line
  if (!source.trim()) return

  var result = validateJsonlLine(source, lineNumber)
  if (result.ok) events.push(result.event)
  else errors.push(result.error)
}

function pushDecodedChunk(state, chunk) {
  if (typeof chunk !== "string")
    throw new TypeError("decoded JSONL chunk must be a string")

  var parts = (state.buffer + chunk).split("\n")
  var remainder = parts.pop()
  var events = []
  var errors = []
  var lineNumber = state.nextLineNumber

  for (var index = 0; index < parts.length; index++) {
    consumeLine(parts[index], lineNumber, events, errors)
    lineNumber += 1
  }

  return {
    state: parserState(remainder, lineNumber),
    events: events,
    errors: errors
  }
}

function finishDecodedStream(state) {
  var events = []
  var errors = []
  var lineNumber = state.nextLineNumber

  if (state.buffer.length > 0) {
    consumeLine(state.buffer, lineNumber, events, errors)
    lineNumber += 1
  }

  return {
    state: parserState("", lineNumber),
    events: events,
    errors: errors
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    GENERATION: GENERATION,
    createRequestSnapshot: createRequestSnapshot,
    createState: createState,
    advanceOpenGeneration: advanceOpenGeneration,
    beginAttempt: beginAttempt,
    retryAttempt: retryAttempt,
    requestCancel: requestCancel,
    reduceEvent: reduceEvent,
    createJsonlState: createJsonlState,
    validateJsonlLine: validateJsonlLine,
    pushDecodedChunk: pushDecodedChunk,
    finishDecodedStream: finishDecodedStream
  }
}
