"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const reducer = require("../InteractionReducer.js")

const fixture = name => fs.readFileSync(
  path.join(__dirname, "fixtures", name), "utf8")

const request = {
  prompt: "Explain this safely",
  messages: [{ role: "user", content: "Explain this safely" }],
  context: [{ type: "selected_text", content: "const answer = 42" }],
  attachments: [{ name: "example.txt", path: "/tmp/example.txt" }],
  tools: [],
  metadata: { source: "test" },
  requestId: 999,
  openGeneration: 999
}

let state = reducer.createState(7)
assert.equal(state.generation, reducer.GENERATION.IDLE)
assert.equal(state.nextRequestId, 1)

state = reducer.beginAttempt(state, request)
assert.equal(state.generation, reducer.GENERATION.STARTING)
assert.equal(state.activeRequestId, 1)
assert.equal(state.nextRequestId, 2)
assert.equal(state.snapshot.requestId, undefined)
assert.equal(state.snapshot.openGeneration, undefined)
assert.equal(Object.isFrozen(state.snapshot), true)
assert.equal(Object.isFrozen(state.snapshot.messages), true)
assert.equal(Object.isFrozen(state.snapshot.messages[0]), true)

request.prompt = "mutated"
request.messages[0].content = "mutated"
request.context.push({ type: "clipboard", content: "mutated" })
assert.equal(state.snapshot.prompt, "Explain this safely")
assert.equal(state.snapshot.messages[0].content, "Explain this safely")
assert.equal(state.snapshot.context.length, 1)
assert.throws(() => { state.snapshot.prompt = "cannot mutate" }, TypeError)

let parser = reducer.createJsonlState()
const validSource = fixture("interaction-stream.jsonl")
const chunks = [
  validSource.slice(0, 17),
  validSource.slice(17, 143),
  validSource.slice(143, 317),
  validSource.slice(317, validSource.indexOf("💡") + 1),
  validSource.slice(validSource.indexOf("💡") + 1)
]
const parsedEvents = []
for (const chunk of chunks) {
  const result = reducer.pushDecodedChunk(parser, chunk)
  parser = result.state
  parsedEvents.push(...result.events)
  assert.deepEqual(result.errors, [])
}
const validFinish = reducer.finishDecodedStream(parser)
parsedEvents.push(...validFinish.events)
assert.deepEqual(validFinish.errors, [])
assert.equal(validFinish.state.buffer, "")
assert.equal(parsedEvents.length, 9)

for (const event of parsedEvents) state = reducer.reduceEvent(state, event)
assert.equal(state.generation, reducer.GENERATION.COMPLETE)
assert.equal(state.sessionId, "session-a")
assert.equal(state.responseText, "你好，Omast 💡")
assert.equal(state.lastSeq, 1)

const firstAttemptId = state.activeRequestId
const firstSnapshot = state.snapshot
state = reducer.retryAttempt(state)
assert.equal(state.generation, reducer.GENERATION.STARTING)
assert.equal(state.activeRequestId, firstAttemptId + 1)
assert.equal(state.nextRequestId, firstAttemptId + 2)
assert.deepEqual(state.snapshot, firstSnapshot)
assert.notEqual(state.snapshot, firstSnapshot)
assert.equal(Object.isFrozen(state.snapshot), true)
assert.equal(state.sessionId, "session-a")

const currentState = state
const staleRequestEvent = {
  type: "message.delta",
  openGeneration: 7,
  requestId: firstAttemptId,
  messageId: "late-old-request",
  seq: 100,
  delta: "must be ignored"
}
assert.equal(reducer.reduceEvent(state, staleRequestEvent), currentState)

state = reducer.advanceOpenGeneration(state)
assert.equal(state.openGeneration, 8)
assert.equal(state.generation, reducer.GENERATION.IDLE)
assert.equal(state.nextRequestId, 3)
const staleOpenEvent = {
  type: "request.error",
  openGeneration: 7,
  requestId: 2,
  code: "provider_failure",
  userMessage: "late old-open error"
}
assert.equal(reducer.reduceEvent(state, staleOpenEvent), state)

state = reducer.beginAttempt(state, { prompt: "cancel me" })
assert.equal(state.activeRequestId, 3)
state = reducer.requestCancel(state)
assert.equal(state.generation, reducer.GENERATION.CANCELING)
const duringCancel = reducer.reduceEvent(state, {
  type: "message.delta",
  openGeneration: 8,
  requestId: 3,
  messageId: "message-cancel",
  seq: 0,
  delta: "ignored while canceling"
})
assert.equal(duringCancel, state)
state = reducer.reduceEvent(state, {
  type: "request.cancelled",
  openGeneration: 8,
  requestId: 3
})
assert.equal(state.generation, reducer.GENERATION.COMPLETE)
assert.equal(state.cancelled, true)
assert.equal(state.responseText, "")

state = reducer.retryAttempt(state)
state = reducer.reduceEvent(state, {
  type: "message.delta",
  openGeneration: 8,
  requestId: 4,
  messageId: "message-cancel-done",
  seq: 0,
  delta: "partial"
})
state = reducer.requestCancel(state)
state = reducer.reduceEvent(state, {
  type: "request.done",
  openGeneration: 8,
  requestId: 4
})
assert.equal(state.generation, reducer.GENERATION.COMPLETE)
assert.equal(state.cancelled, true)
assert.equal(state.responseText, "partial")

state = reducer.retryAttempt(state)
assert.equal(state.activeRequestId, 5)
state = reducer.reduceEvent(state, {
  type: "request.error",
  openGeneration: 8,
  requestId: 5,
  code: "provider_failure",
  userMessage: "Backend failed."
})
assert.equal(state.generation, reducer.GENERATION.ERROR)
assert.deepEqual(state.error, {
  code: "provider_failure",
  userMessage: "Backend failed."
})
const failedId = state.activeRequestId
state = reducer.retryAttempt(state)
assert.equal(state.activeRequestId, failedId + 1)

let completionState = reducer.beginAttempt(reducer.createState(3), { prompt: "finish" })
completionState = reducer.reduceEvent(completionState, {
  type: "message.completed",
  openGeneration: 3,
  requestId: 1,
  messageId: "message-finish",
  text: "answer"
})
assert.equal(completionState.generation, reducer.GENERATION.STREAMING)
completionState = reducer.reduceEvent(completionState, {
  type: "request.error",
  openGeneration: 3,
  requestId: 1,
  code: "provider_failure",
  userMessage: "Failed after message completion."
})
assert.equal(completionState.generation, reducer.GENERATION.ERROR)
assert.equal(completionState.responseText, "answer")

let terminalState = reducer.beginAttempt(reducer.createState(4), { prompt: "done" })
terminalState = reducer.reduceEvent(terminalState, {
  type: "request.done",
  openGeneration: 4,
  requestId: 1
})
const terminalSnapshot = terminalState
terminalState = reducer.reduceEvent(terminalState, {
  type: "request.error",
  openGeneration: 4,
  requestId: 1,
  code: "late_error",
  userMessage: "ignored"
})
assert.equal(terminalState, terminalSnapshot)

let malformedParser = reducer.createJsonlState()
const malformed = reducer.pushDecodedChunk(
  malformedParser, fixture("interaction-malformed.jsonl"))
malformedParser = malformed.state
assert.equal(malformed.events.length, 1)
assert.equal(malformed.events[0].type, "request.error")
assert.deepEqual(malformed.errors.map(error => error.code), [
  "invalid_sequence",
  "invalid_json"
])
assert.deepEqual(malformed.errors.map(error => error.lineNumber), [1, 2])
assert.deepEqual(reducer.finishDecodedStream(malformedParser).errors, [])

const partialLine = JSON.stringify({
  type: "request.done",
  openGeneration: 8,
  requestId: 5
})
let partialParser = reducer.createJsonlState()
let partial = reducer.pushDecodedChunk(partialParser, partialLine.slice(0, 12))
assert.equal(partial.events.length, 0)
partial = reducer.pushDecodedChunk(partial.state, partialLine.slice(12))
assert.equal(partial.events.length, 0)
const partialFinish = reducer.finishDecodedStream(partial.state)
assert.equal(partialFinish.events.length, 1)
assert.equal(partialFinish.events[0].type, "request.done")

const crlf = reducer.pushDecodedChunk(
  reducer.createJsonlState(),
  "\r\n" + JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\r\n")
assert.equal(crlf.events.length, 1)
assert.equal(crlf.errors.length, 0)
let splitCrlf = reducer.pushDecodedChunk(
  reducer.createJsonlState(),
  JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\r")
assert.equal(splitCrlf.events.length, 0)
splitCrlf = reducer.pushDecodedChunk(splitCrlf.state, "\n")
assert.equal(splitCrlf.events.length, 1)
assert.equal(splitCrlf.errors.length, 0)
const truncatedFinish = reducer.finishDecodedStream(
  reducer.pushDecodedChunk(
    reducer.createJsonlState(), '{"type":"request.done"').state)
assert.equal(truncatedFinish.events.length, 0)
assert.equal(truncatedFinish.errors[0].code, "invalid_json")
assert.throws(
  () => reducer.pushDecodedChunk(reducer.createJsonlState(), Buffer.from("{}")),
  /must be a string/
)

assert.equal(
  reducer.validateJsonlLine("[]", 4).error.code,
  "invalid_event"
)
assert.equal(
  reducer.validateJsonlLine('{"type":"unknown"}', 5).error.code,
  "unknown_type"
)
for (const inheritedType of ["toString", "constructor", "__proto__"]) {
  const inherited = reducer.validateJsonlLine(JSON.stringify({
    type: inheritedType,
    openGeneration: 3,
    requestId: 1
  }), 6)
  assert.equal(inherited.ok, false)
  assert.equal(inherited.error.code, "unknown_type")
}

console.log("interaction reducer tests passed")
