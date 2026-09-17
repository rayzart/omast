"use strict"

const assert = require("node:assert/strict")
const model = require("../OmastModel.js")

assert.equal(model.isBlank(""), true)
assert.equal(model.isBlank("  \t\n"), true)
assert.equal(model.isBlank("问题"), false)

assert.equal(model.normalizeMode("launcher"), "launcher")
assert.equal(model.normalizeMode("quick_ai"), "quick_ai")
assert.equal(model.normalizeMode("unknown"), "launcher")

assert.equal(model.moveSelection(-1, 1, 3), 0)
assert.equal(model.moveSelection(-1, -1, 3), 2)
assert.equal(model.moveSelection(2, 1, 3), 0)
assert.equal(model.moveSelection(0, -1, 3), 2)
assert.equal(model.moveSelection(0, 1, 0), -1)

assert.deepEqual(model.inputSnapshot("abcdef", 4, 1, 4), {
  text: "abcdef",
  cursorPosition: 4,
  selectionStart: 1,
  selectionEnd: 4
})
assert.deepEqual(model.inputSnapshot("abc", 99, -2, 2), {
  text: "abc",
  cursorPosition: 3,
  selectionStart: 0,
  selectionEnd: 2
})

const hostilePrompt = "中文 'single' \"double\" `backtick`; | $(touch /tmp/omast-pwned) 💡"
const command = model.agentCommand(hostilePrompt)
assert.deepEqual(command, ["omarchy", "agent", "prompt", hostilePrompt])
assert.equal(command.length, 4)
assert.equal(model.agentCommand("   ").length, 0)
assert.deepEqual(model.agentCommand("  keep spacing  "), [
  "omarchy", "agent", "prompt", "  keep spacing  "
])

assert.match(model.launchError("Choose default agent with: omarchy default agent <name>"), /No default Agent/)
assert.equal(
  model.launchError("codex is not installed. Choose an installed agent"),
  "codex is not installed. Choose an installed agent"
)
assert.match(model.launchError(""), /Could not launch/)

console.log("model tests passed")
