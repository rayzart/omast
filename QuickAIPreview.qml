import QtQuick
import qs.Commons
import qs.Ui
import "QuickAIViewModel.js" as QuickAIViewModel

// Loaded only when both the shell environment and an explicit IPC payload opt in.
// This component has no process, network, Agent, or clipboard access.
Item {
  id: preview
  implicitHeight: previewContent.implicitHeight
  property string prompt: ""
  property int step: 0
  property var fakeState: ({ generation: "IDLE", responseText: "", snapshot: null })
  readonly property var viewState: QuickAIViewModel.createViewState(
    fakeState, { cancel: true, followUp: false, handoff: false })
  readonly property bool canRetry: viewState.status === "complete"
    || viewState.status === "error" || viewState.status === "cancelled"

  function start(question) {
    if (!String(question || "").trim()) return
    preview.prompt = String(question)
    preview.step = 0
    preview.fakeState = {
      generation: "STARTING", responseText: "",
      snapshot: { prompt: preview.prompt }, cancelled: false, error: null
    }
    fakeStream.restart()
  }

  function cancel() {
    if (preview.viewState.escapeBehavior !== "cancel") return false
    fakeStream.stop()
    preview.fakeState = {
      generation: "COMPLETE", responseText: preview.fakeState.responseText,
      snapshot: { prompt: preview.prompt }, cancelled: true, error: null
    }
    return true
  }

  function retry() {
    if (preview.canRetry) preview.start(preview.prompt)
  }

  function fail() {
    if (!preview.viewState.busy) return
    fakeStream.stop()
    preview.fakeState = {
      generation: "ERROR", responseText: preview.fakeState.responseText,
      snapshot: { prompt: preview.prompt }, cancelled: false,
      error: { code: "simulated_error", userMessage: "Simulated provider error." }
    }
  }

  function reset() {
    fakeStream.stop()
    preview.prompt = ""
    preview.step = 0
    preview.fakeState = {
      generation: "IDLE", responseText: "", snapshot: null
    }
  }

  Timer {
    id: fakeStream
    interval: 450
    repeat: true
    onTriggered: {
      preview.step += 1
      if (preview.step === 1) {
        preview.fakeState = {
          generation: "STREAMING", responseText: "Simulated answer for: " + preview.prompt,
          snapshot: { prompt: preview.prompt }, cancelled: false, error: null
        }
      } else if (preview.step === 2) {
        preview.fakeState = {
          generation: "STREAMING",
          responseText: "Simulated answer for: " + preview.prompt + "\n你好，Omast 💡",
          snapshot: { prompt: preview.prompt }, cancelled: false, error: null
        }
      } else {
        fakeStream.stop()
        preview.fakeState = {
          generation: "COMPLETE",
          responseText: "Simulated answer for: " + preview.prompt + "\n你好，Omast 💡",
          snapshot: { prompt: preview.prompt }, cancelled: false, error: null
        }
      }
    }
  }

  Column {
    id: previewContent
    width: parent.width
    spacing: Style.spacing.sm

    Text {
      width: parent.width
      text: "SIMULATED DEVELOPMENT PREVIEW — no Agent was called"
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      color: Color.urgent
      font.family: Style.font.menuFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }

    Text {
      width: parent.width
      text: preview.viewState.statusLabel
      textFormat: Text.PlainText
      color: Color.menu.text
      font.family: Style.font.menuFamily
      font.pixelSize: Style.font.caption
      Accessible.role: Accessible.StaticText
      Accessible.name: text
    }

    Flickable {
      width: parent.width
      height: Math.min(Math.max(answer.implicitHeight + Style.spacing.sm, Style.space(72)),
                       Style.space(220))
      contentWidth: width
      contentHeight: answer.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds

      Text {
        id: answer
        width: parent.width
        text: preview.viewState.responseText
        textFormat: Text.PlainText
        wrapMode: Text.Wrap
        color: Color.menu.text
        font.family: Style.font.menuFamily
        font.pixelSize: Style.font.body
        Accessible.role: Accessible.StaticText
        Accessible.name: text
      }
    }

    Text {
      width: parent.width
      visible: preview.viewState.error !== null
      text: preview.viewState.error ? preview.viewState.error.message : ""
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      color: Color.urgent
      font.family: Style.font.menuFamily
      font.pixelSize: Style.font.caption
      Accessible.role: Accessible.StaticText
      Accessible.name: text
    }

    Row {
      spacing: Style.spacing.sm

      Button {
        text: "Stop"
        visible: preview.viewState.escapeBehavior === "cancel"
        enabled: visible
        focusable: true
        onClicked: preview.cancel()
      }

      Button {
        text: "Simulate error"
        visible: preview.viewState.busy
        enabled: visible
        focusable: true
        onClicked: preview.fail()
      }

      Button {
        text: "Retry"
        visible: preview.canRetry
        enabled: visible
        focusable: true
        onClicked: preview.retry()
      }
    }
  }
}
