function isBlank(value) {
  return /^\s*$/.test(String(value === undefined || value === null ? "" : value))
}

function normalizeMode(value) {
  return value === "quick_ai" ? "quick_ai" : "launcher"
}

function previewAllowed(environmentValue, payload) {
  return environmentValue === "1" && !!payload
    && payload.devPreview === true && payload.mode === "quick_ai"
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

function appSearchText(entry) {
  if (!entry) return ""
  var keywords = ""
  try {
    if (entry.keywords && typeof entry.keywords.join === "function")
      keywords = entry.keywords.join(" ")
  } catch (e) {
  }
  return [entry.name, entry.genericName, entry.comment, keywords, entry.id]
    .join(" ").toLowerCase()
}

function normalizeDesktopId(id) {
  var value = String(id || "").trim()
  return value.slice(-8) === ".desktop" ? value.slice(0, -8) : value
}

function hiddenEntryIds(rawText) {
  var result = {}
  var lines = String(rawText || "").split(/\n/)
  for (var i = 0; i < lines.length; i++) {
    var id = normalizeDesktopId(lines[i])
    if (id) result[id] = true
  }
  return result
}

function fallbackAppEntries(values, query, limit, configuredHiddenIds, desktopHiddenIds) {
  var source = values || []
  var configuredHidden = configuredHiddenIds || {}
  var desktopHidden = desktopHiddenIds || {}
  var terms = String(query || "").trim().toLowerCase().split(/\s+/)
  var maximum = Math.max(0, Number(limit) || 0)
  var rows = []

  for (var i = 0; i < source.length; i++) {
    var entry = source[i]
    if (!entry || entry.noDisplay) continue
    var entryId = String(entry.id || "")
    if (configuredHidden[entryId] === true || desktopHidden[entryId] === true) continue
    var name = String(entry.name || entry.id || "")
    if (!name) continue
    var haystack = appSearchText(entry)
    var matches = true
    for (var j = 0; j < terms.length; j++) {
      if (terms[j] && haystack.indexOf(terms[j]) < 0) {
        matches = false
        break
      }
    }
    if (!matches) continue

    var loweredName = name.toLowerCase()
    var exactQuery = String(query || "").trim().toLowerCase()
    var score = exactQuery && loweredName.indexOf(exactQuery) === 0 ? 1 : 0
    rows.push({ entry: entry, name: loweredName, score: score })
  }

  rows.sort(function(left, right) {
    if (left.score !== right.score) return right.score - left.score
    if (left.name < right.name) return -1
    if (left.name > right.name) return 1
    return 0
  })

  return maximum > 0 ? rows.slice(0, maximum) : []
}

function desktopLaunchCommand(desktopId) {
  var id = String(desktopId === undefined || desktopId === null ? "" : desktopId)
  if (!id) return []
  return ["uwsm-app", "--", "gtk-launch", id + ".desktop"]
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
    previewAllowed: previewAllowed,
    moveSelection: moveSelection,
    inputSnapshot: inputSnapshot,
    appSearchText: appSearchText,
    normalizeDesktopId: normalizeDesktopId,
    hiddenEntryIds: hiddenEntryIds,
    fallbackAppEntries: fallbackAppEntries,
    desktopLaunchCommand: desktopLaunchCommand,
    agentCommand: agentCommand,
    launchError: launchError
  }
}
