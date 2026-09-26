"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const FakeAgentBridge = require("../FakeAgentBridge.js")
const reducer = require("../InteractionReducer.js")

const fixture = name => fs.readFileSync(
  path.join(__dirname, "fixtures", name), "utf8")
const jsonl = event => JSON.stringify(event) + "\n"

function handshake(bridge, token, capabilities = {
  streaming: true,
  followUp: true,
  cancel: true
}) {
  bridge.pushDecodedChunk(token, jsonl({
    type: "ready",
    protocolVersion: FakeAgentBridge.PROTOCOL_VERSION
  }))
  bridge.pushDecodedChunk(token, jsonl({ type: "capabilities", capabilities }))
  assert.equal(bridge.handshakeComplete, true)
}

function requestEvent(type, attempt, extra = {}) {
  return Object.assign({
    type,
    openGeneration: attempt.openGeneration,
    requestId: attempt.requestId
  }, extra)
}

const guarded = new FakeAgentBridge(1)
const guardedToken = guarded.beginTransport()
assert.throws(
  () => guarded.start(guardedToken, { prompt: "too early" }),
  error => error.code === "handshake_required"
)
guarded.pushDecodedChunk(guardedToken, jsonl({
  type: "request.done",
  openGeneration: 1,
  requestId: 1
}))
assert.equal(guarded.ignoredRequestEvents, 1)
assert.equal(guarded.state.generation, reducer.GENERATION.IDLE)
handshake(guarded, guardedToken, { streaming: true, nested: { cancel: true } })
assert.equal(Object.isFrozen(guarded.capabilities), true)
assert.equal(Object.isFrozen(guarded.capabilities.nested), true)
guarded.pushDecodedChunk(guardedToken, jsonl({
  type: "ready",
  protocolVersion: FakeAgentBridge.PROTOCOL_VERSION
}) + jsonl({
  type: "capabilities",
  capabilities: { nested: { cancel: true }, streaming: true }
}))
assert.equal(guarded.protocolError, null)

const conflicting = new FakeAgentBridge(2)
const conflictingToken = conflicting.beginTransport()
handshake(conflicting, conflictingToken, { streaming: true })
conflicting.pushDecodedChunk(conflictingToken, jsonl({
  type: "capabilities",
  capabilities: { streaming: false }
}))
assert.equal(conflicting.protocolError.code, "protocol_error")
assert.equal(conflicting.handshakeComplete, false)
assert.throws(
  () => conflicting.start(conflictingToken, { prompt: "blocked" }),
  error => error.code === "protocol_error"
)

const unsupported = new FakeAgentBridge(3)
const unsupportedToken = unsupported.beginTransport()
unsupported.pushDecodedChunk(unsupportedToken, jsonl({
  type: "ready",
  protocolVersion: 2
}))
assert.equal(unsupported.protocolError.code, "protocol_error")

const handshakeEof = new FakeAgentBridge(3)
const handshakeEofToken = handshakeEof.beginTransport()
handshakeEof.exitTransport(handshakeEofToken, 0)
handshakeEof.finishStdout(handshakeEofToken)
assert.equal(handshakeEof.protocolError.code, "protocol_error")
assert.match(handshakeEof.protocolError.detail, /before protocol handshake/)

const success = new FakeAgentBridge(7)
const successToken = success.beginTransport()
const streamLines = fixture("interaction-stream.jsonl").trimEnd().split("\n")
success.pushDecodedChunk(successToken, streamLines.slice(0, 2).join("\n") + "\n")
const successAttempt = success.start(successToken, { prompt: "hello" })
assert.equal(successAttempt.requestId, 1)
const requestStream = streamLines.slice(2).join("\n") + "\n"
const boundaries = [19, 141, requestStream.indexOf("💡") + 1]
let chunkStart = 0
for (const chunkEnd of boundaries) {
  success.pushDecodedChunk(successToken, requestStream.slice(chunkStart, chunkEnd))
  chunkStart = chunkEnd
}
success.pushDecodedChunk(successToken, requestStream.slice(chunkStart))
assert.equal(success.state.generation, reducer.GENERATION.COMPLETE)
assert.equal(success.state.responseText, "你好，Omast 💡")
assert.equal(success.terminalNotificationCount, 1)
success.finishStdout(successToken)
success.exitTransport(successToken, 0)
assert.equal(success.state.generation, reducer.GENERATION.COMPLETE)
assert.equal(success.terminalNotificationCount, 1)

const exitFirst = new FakeAgentBridge(4)
const exitFirstToken = exitFirst.beginTransport()
handshake(exitFirst, exitFirstToken)
const exitFirstAttempt = exitFirst.start(exitFirstToken, { prompt: "exit first" })
exitFirst.exitTransport(exitFirstToken, 0)
assert.equal(exitFirst.state.generation, reducer.GENERATION.STARTING)
exitFirst.pushDecodedChunk(exitFirstToken, JSON.stringify(
  requestEvent("request.done", exitFirstAttempt)))
exitFirst.finishStdout(exitFirstToken)
assert.equal(exitFirst.state.generation, reducer.GENERATION.COMPLETE)

const cleanEof = new FakeAgentBridge(5)
const cleanEofToken = cleanEof.beginTransport()
handshake(cleanEof, cleanEofToken)
const cleanEofAttempt = cleanEof.start(cleanEofToken, { prompt: "partial" })
cleanEof.pushDecodedChunk(cleanEofToken, JSON.stringify(requestEvent(
  "message.delta", cleanEofAttempt, {
    messageId: "message-partial",
    seq: 0,
    delta: "partial"
  })))
cleanEof.finishStdout(cleanEofToken)
assert.equal(cleanEof.state.generation, reducer.GENERATION.STREAMING)
cleanEof.exitTransport(cleanEofToken, 0)
assert.equal(cleanEof.state.generation, reducer.GENERATION.ERROR)
assert.equal(cleanEof.state.error.code, "transport_eof")
assert.equal(cleanEof.state.responseText, "partial")

const crashed = new FakeAgentBridge(6)
const crashedToken = crashed.beginTransport()
handshake(crashed, crashedToken)
crashed.start(crashedToken, { prompt: "crash" })
crashed.exitTransport(crashedToken, 23)
crashed.finishStdout(crashedToken)
assert.equal(crashed.state.generation, reducer.GENERATION.ERROR)
assert.equal(crashed.state.error.code, "transport_exit_nonzero")
assert.match(crashed.state.error.userMessage, /23/)

const cancelled = new FakeAgentBridge(8)
const cancelledToken = cancelled.beginTransport()
handshake(cancelled, cancelledToken)
const cancelledAttempt = cancelled.start(cancelledToken, { prompt: "cancel" })
cancelled.pushDecodedChunk(cancelledToken, jsonl(requestEvent(
  "message.delta", cancelledAttempt, {
    messageId: "message-cancel",
    seq: 0,
    delta: "partial"
  })))
const firstCancelState = cancelled.cancel(cancelledToken)
assert.equal(firstCancelState.generation, reducer.GENERATION.CANCELING)
assert.equal(cancelled.cancel(cancelledToken), firstCancelState)
cancelled.pushDecodedChunk(cancelledToken, jsonl(requestEvent(
  "message.delta", cancelledAttempt, {
    messageId: "message-cancel",
    seq: 1,
    delta: " ignored"
  })))
assert.equal(cancelled.state.responseText, "partial")
cancelled.pushDecodedChunk(cancelledToken, jsonl(requestEvent(
  "request.done", cancelledAttempt)))
assert.equal(cancelled.state.generation, reducer.GENERATION.COMPLETE)
assert.equal(cancelled.state.cancelled, true)
assert.equal(cancelled.terminalNotificationCount, 1)
cancelled.finishStdout(cancelledToken)
cancelled.exitTransport(cancelledToken, 143)
assert.equal(cancelled.state.generation, reducer.GENERATION.COMPLETE)
assert.equal(cancelled.terminalNotificationCount, 1)

const localCancel = new FakeAgentBridge(9)
const localCancelToken = localCancel.beginTransport()
handshake(localCancel, localCancelToken)
localCancel.start(localCancelToken, { prompt: "local cancel" })
localCancel.cancel(localCancelToken)
localCancel.exitTransport(localCancelToken, 130)
localCancel.finishStdout(localCancelToken)
assert.equal(localCancel.state.generation, reducer.GENERATION.COMPLETE)
assert.equal(localCancel.state.cancelled, true)

const cancelError = new FakeAgentBridge(10)
const cancelErrorToken = cancelError.beginTransport()
handshake(cancelError, cancelErrorToken)
const cancelErrorAttempt = cancelError.start(cancelErrorToken, { prompt: "error" })
cancelError.cancel(cancelErrorToken)
cancelError.pushDecodedChunk(cancelErrorToken, jsonl(requestEvent(
  "request.error", cancelErrorAttempt, {
    code: "provider_failure",
    userMessage: "Provider refused cancellation."
  })))
cancelError.finishStdout(cancelErrorToken)
cancelError.exitTransport(cancelErrorToken, 1)
assert.equal(cancelError.state.generation, reducer.GENERATION.ERROR)
assert.equal(cancelError.state.error.code, "provider_failure")
assert.equal(cancelError.terminalNotificationCount, 1)

const stale = new FakeAgentBridge(11)
const staleToken = stale.beginTransport()
handshake(stale, staleToken)
const staleFirst = stale.start(staleToken, { prompt: "retry" })
stale.pushDecodedChunk(staleToken, jsonl(requestEvent(
  "request.error", staleFirst, {
    code: "provider_failure",
    userMessage: "first failed"
  })))
stale.finishStdout(staleToken)
stale.exitTransport(staleToken, 1)
assert.equal(stale.terminalNotificationCount, 1)

const retryToken = stale.beginTransport()
handshake(stale, retryToken)
const staleRetry = stale.retry(retryToken)
const beforeOldTransport = stale.state
assert.equal(stale.pushDecodedChunk(staleToken, "not-json\n").ignored, true)
assert.equal(stale.finishStdout(staleToken).ignored, true)
assert.equal(stale.exitTransport(staleToken, 99).ignored, true)
assert.equal(stale.pushStderr(staleToken, "old stderr").ignored, true)
assert.equal(stale.state, beforeOldTransport)
stale.pushDecodedChunk(retryToken, jsonl(requestEvent(
  "message.delta", staleFirst, {
    messageId: "old-request",
    seq: 0,
    delta: "ignored"
  })))
assert.equal(stale.state, beforeOldTransport)
stale.pushDecodedChunk(retryToken, jsonl({
  type: "message.delta",
  openGeneration: staleRetry.openGeneration - 1,
  requestId: staleRetry.requestId,
  messageId: "old-open",
  seq: 0,
  delta: "ignored"
}))
assert.equal(stale.state, beforeOldTransport)
stale.pushDecodedChunk(retryToken, jsonl(requestEvent(
  "request.done", staleRetry)))
assert.equal(stale.state.generation, reducer.GENERATION.COMPLETE)
assert.equal(stale.terminalNotificationCount, 2)

const malformed = new FakeAgentBridge(7)
const malformedToken = malformed.beginTransport()
handshake(malformed, malformedToken)
malformed.start(malformedToken, { prompt: "malformed" })
const malformedResult = malformed.pushDecodedChunk(
  malformedToken, fixture("interaction-malformed.jsonl"))
assert.deepEqual(malformedResult.errors.map(error => error.code), [
  "invalid_sequence",
  "invalid_json"
])
assert.equal(malformed.state.generation, reducer.GENERATION.ERROR)
assert.equal(malformed.state.error.code, "provider_failure")
malformed.finishStdout(malformedToken)
malformed.exitTransport(malformedToken, 0)
assert.equal(malformed.terminalNotificationCount, 1)

const stderr = new FakeAgentBridge(12)
const stderrToken = stderr.beginTransport()
stderr.pushStderr(stderrToken, "x".repeat(FakeAgentBridge.MAX_STDERR_LENGTH + 20))
assert.equal(stderr.stderrText.length, FakeAgentBridge.MAX_STDERR_LENGTH)
assert.equal(stderr.stderrTruncated, true)

console.log("fake agent bridge tests passed")
