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

const appEntries = [
  { id: "org.mozilla.firefox", name: "Firefox", genericName: "Web Browser", keywords: ["web"] },
  { id: "com.visualstudio.code", name: "Visual Studio Code", genericName: "Code Editor", keywords: ["development"] },
  { id: "hidden.app", name: "Hidden", noDisplay: true },
  { id: "org.example.terminal", name: "Terminal", comment: "Command line shell" }
]
assert.deepEqual(
  model.hiddenEntryIds("hidden.desktop\norg.example.tool\n\n"),
  { hidden: true, "org.example.tool": true }
)
assert.deepEqual(
  model.fallbackAppEntries(appEntries, "fire", 6).map(row => row.entry.id),
  ["org.mozilla.firefox"]
)
assert.deepEqual(
  model.fallbackAppEntries(appEntries, "code editor", 6).map(row => row.entry.id),
  ["com.visualstudio.code"]
)
assert.deepEqual(
  model.fallbackAppEntries(appEntries, "", 2).map(row => row.entry.id),
  ["org.mozilla.firefox", "org.example.terminal"]
)
assert.deepEqual(
  model.fallbackAppEntries(
    appEntries, "", 6,
    { "org.mozilla.firefox": true },
    { "org.example.terminal": true }
  ).map(row => row.entry.id),
  ["com.visualstudio.code"]
)
assert.deepEqual(
  model.desktopLaunchCommand("org.telegram.desktop"),
  ["uwsm-app", "--", "gtk-launch", "org.telegram.desktop.desktop"]
)
assert.deepEqual(model.desktopLaunchCommand(""), [])

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
