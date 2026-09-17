function isBlank(value) {
  return /^\s*$/.test(String(value === undefined || value === null ? "" : value))
}

function normalizeMode(value) {
  return value === "quick_ai" ? "quick_ai" : "launcher"
}

function moveSelection(currentIndex, delta, itemCount) {
  var count = Math.max(0, Number(itemCount) || 0)
  if (count === 0) return -1

  var current = Number(currentIndex)
  if (!Number.isFinite(current) || current < 0 || current >= count)
    return delta < 0 ? count - 1 : 0

  var next = (current + Number(delta || 0)) % count
  return next < 0 ? next + count : next
}

function inputSnapshot(text, cursorPosition, selectionStart, selectionEnd) {
  var value = String(text === undefined || text === null ? "" : text)
  var limit = value.length
  function clamp(position) {
    var number = Number(position)
    if (!Number.isFinite(number)) return limit
    return Math.max(0, Math.min(limit, Math.trunc(number)))
  }

  return {
    text: value,
    cursorPosition: clamp(cursorPosition),
    selectionStart: clamp(selectionStart),
    selectionEnd: clamp(selectionEnd)
  }
}

function agentCommand(prompt) {
  var text = String(prompt === undefined || prompt === null ? "" : prompt)
  if (isBlank(text)) return []
  return ["omarchy", "agent", "prompt", text]
}

function launchError(stderrText) {
  var detail = String(stderrText || "").trim()
  if (/Choose default agent/i.test(detail))
    return "No default Agent is configured. Choose one in Omarchy and try again."
  if (/is not installed/i.test(detail)) return detail
  return detail || "Could not launch the Omarchy Agent. Check your default Agent and try again."
}

if (typeof module !== "undefined") {
  module.exports = {
    isBlank: isBlank,
    normalizeMode: normalizeMode,
    moveSelection: moveSelection,
    inputSnapshot: inputSnapshot,
    agentCommand: agentCommand,
    launchError: launchError
  }
}
