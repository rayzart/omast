function isBlank(value) {
  return /^\s*$/.test(String(value === undefined || value === null ? "" : value))
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
    agentCommand: agentCommand,
    launchError: launchError
  }
}
