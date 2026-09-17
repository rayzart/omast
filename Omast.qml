import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "OmastModel.js" as OmastModel

Item {
  id: root

  // Injected by omarchy-shell for third-party menu plugins.
  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null

  property bool opened: false
  property bool submitting: false
  property string errorText: ""
  property string stderrText: ""
  property int openGeneration: 0
  property int launchGeneration: 0
  property int launchExitCode: -1

  readonly property string pluginId: (root.manifest && root.manifest.id)
    ? String(root.manifest.id) : "io.github.rayzart.omast"
  readonly property bool busy: root.submitting || launchProc.running
  readonly property color background: Color.menu.background
  readonly property color foreground: Color.menu.text
  readonly property color borderColor: Color.menu.border
  readonly property color accent: Color.accent
  readonly property color scrim: Color.menu.scrim
  readonly property var borderSpec: Border.surfaceSpec(
    "menu", "border", root.borderColor, Math.max(1, Style.space(2)))
  readonly property int cornerRadius: Style.cornerRadius
  readonly property int contentMargin: Style.spacing.panelPadding
  readonly property int contentSpacing: Style.spacing.md
  readonly property int cardWidth: Math.min(Style.space(640), panel.width - Style.gapsOut * 2)
  readonly property int cardHeight: Math.min(
    content.implicitHeight + root.contentMargin * 2,
    panel.height - Style.gapsOut * 2)

  function open(payloadJson) {
    var wasOpen = root.opened
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (e) { payload = ({}) }

    root.openGeneration += 1
    root.opened = true
    root.errorText = ""

    if (!wasOpen) {
      promptField.text = typeof payload.prompt === "string" ? payload.prompt : ""
    }

    Qt.callLater(function() {
      promptField.forceActiveFocus()
      if (promptField.text) promptField.selectAll()
    })
  }

  function close() {
    root.openGeneration += 1
    root.opened = false
    root.submitting = false
    root.errorText = ""
    promptField.text = ""
  }

  function dismiss() {
    if (root.shell && typeof root.shell.hide === "function") {
      root.shell.hide(root.pluginId)
    } else {
      root.close()
    }
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  function submit() {
    if (root.busy || OmastModel.isBlank(promptField.text)) return

    root.errorText = ""
    root.stderrText = ""
    root.submitting = true
    root.launchGeneration = root.openGeneration
    root.launchExitCode = -1
    launchProc.command = OmastModel.agentCommand(promptField.text)
    launchProc.running = true
  }

  function showLaunchFailure() {
    root.submitting = false
    root.errorText = OmastModel.launchError(root.stderrText)
    Qt.callLater(function() { promptField.forceActiveFocus() })
  }

  function configureAgent() {
    root.dismiss()
    Qt.callLater(function() {
      Quickshell.execDetached(["omarchy", "menu", "summon", "setup.default.agent"])
    })
  }

  Process {
    id: launchProc

    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.stderrText = String(text || "").trim()
        if (root.launchExitCode > 0 && root.launchGeneration === root.openGeneration)
          root.errorText = OmastModel.launchError(root.stderrText)
      }
    }

    onExited: function(exitCode) {
      root.launchExitCode = exitCode
      // If the user closed and reopened while the launcher was running, the
      // old completion must not close or overwrite the new surface.
      if (root.launchGeneration !== root.openGeneration) {
        root.submitting = false
        return
      }

      if (exitCode === 0) {
        root.submitting = false
        root.dismiss()
      } else {
        root.errorText = OmastModel.launchError(root.stderrText)
        root.showLaunchFailure()
      }
    }
  }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "omast"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: if (!root.busy) root.dismiss()
    }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: root.cardHeight
      radius: root.cornerRadius
      anchors.centerIn: parent
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin

      MouseArea { anchors.fill: parent; onClicked: {} }

      Column {
        id: content
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: card.contentLeftInset
        anchors.rightMargin: card.contentRightInset
        spacing: root.contentSpacing

        Row {
          width: parent.width
          spacing: Style.spacing.md

          Text {
            text: "󰚩"
            color: root.accent
            font.family: Style.font.menuFamily
            font.pixelSize: Style.font.display
            anchors.verticalCenter: parent.verticalCenter
          }

          Column {
            width: parent.width - parent.spacing - Style.font.display
            spacing: Style.spacing.xs

            Text {
              text: "Ask AI"
              color: root.foreground
              font.family: Style.font.menuFamily
              font.pixelSize: Style.font.heading
              font.bold: true
            }

            Text {
              width: parent.width
              text: "Uses your current Omarchy default Agent"
              color: Qt.darker(root.foreground, 1.45)
              font.family: Style.font.menuFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }
          }
        }

        TextField {
          id: promptField
          width: parent.width
          enabled: !root.busy
          placeholderText: "What would you like to ask?"
          foreground: root.foreground
          accent: root.accent
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.body
          onAccepted: root.submit()

          Keys.onPressed: function(event) {
            if (event.key === Qt.Key_Escape && !root.busy) {
              root.dismiss()
              event.accepted = true
            }
          }
        }

        Text {
          width: parent.width
          visible: root.errorText !== ""
          text: root.errorText
          textFormat: Text.PlainText
          wrapMode: Text.WordWrap
          color: Color.urgent
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.caption
        }

        Row {
          width: parent.width
          spacing: Style.spacing.sm

          Text {
            width: parent.width - configureButton.width - parent.spacing
            text: root.busy ? "Launching Agent…" : "Enter to ask  •  Esc to close"
            color: Qt.darker(root.foreground, 1.45)
            font.family: Style.font.menuFamily
            font.pixelSize: Style.font.caption
            anchors.verticalCenter: parent.verticalCenter
            elide: Text.ElideRight
          }

          Button {
            id: configureButton
            text: "Choose Agent"
            iconText: root.busy ? "󰦖" : "󰒓"
            iconSpinning: root.busy
            focusable: true
            bordered: true
            enabled: !root.busy
            foreground: root.foreground
            accent: root.accent
            fontFamily: Style.font.menuFamily
            onClicked: root.configureAgent()
          }
        }
      }
    }
  }
}
