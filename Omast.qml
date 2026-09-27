pragma ComponentBehavior: Bound

import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "OmastModel.js" as OmastModel

Item {
  id: root

  // Injected by omarchy-shell for third-party menu plugins. keepLoaded keeps
  // this object resident; the compositor shortcut only toggles this surface.
  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null

  property bool opened: false
  property bool previewActive: false
  property string interactionMode: "launcher"
  property int selectedIndex: -1
  property bool submitting: false
  property string errorText: ""
  property string stderrText: ""
  property int openGeneration: 0
  property int launchGeneration: 0
  property int launchExitCode: -1
  property var preservedInput: ({})
  property var fallbackConfiguredHiddenIds: ({})
  property var fallbackDesktopHiddenIds: ({})
  property bool fallbackConfigLoaded: false
  property bool fallbackScanCompleted: false
  property bool fallbackScanPending: false

  readonly property string pluginId: (root.manifest && root.manifest.id)
    ? String(root.manifest.id) : "io.github.rayzart.omast"
  readonly property var appLibrary: root.shell ? root.shell.appLibrary : null
  readonly property bool fallbackReady: root.fallbackConfigLoaded
    && root.fallbackScanCompleted
  readonly property bool quickAI: root.interactionMode === "quick_ai"
  readonly property bool busy: root.submitting || launchProc.running
  readonly property color background: Color.menu.background
  readonly property color foreground: Color.menu.text
  readonly property color borderColor: Color.menu.border
  readonly property color selectedBackground: Color.menu.selectedBackground
  readonly property color selectedText: Color.menu.selectedText
  readonly property color accent: Color.accent
  readonly property color scrim: Color.menu.scrim
  readonly property var borderSpec: Border.surfaceSpec(
    "menu", "border", root.borderColor, Math.max(1, Style.space(2)))
  readonly property var selectedBorderSpec: Border.surfaceSpec(
    "menu", "selected-border", Color.menu.selectedBorder, 0)
  readonly property int cornerRadius: Style.cornerRadius
  readonly property int contentMargin: Style.spacing.panelPadding
  readonly property int contentSpacing: Style.spacing.md
  readonly property int rowHeight: Math.max(
    Style.space(52), Style.font.body + Style.font.caption + Style.spacing.sm * 2)
  readonly property int cardWidth: Math.min(Style.space(640), panel.width - Style.gapsOut * 2)
  readonly property int cardHeight: Math.min(
    content.implicitHeight + root.contentMargin * 2,
    panel.height - Style.gapsOut * 2)

  ListModel { id: launcherResults }

  function open(payloadJson) {
    var wasOpen = root.opened
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (e) { payload = ({}) }

    root.openGeneration += 1
    if (!wasOpen)
      root.previewActive = OmastModel.previewAllowed(
        Quickshell.env("OMAST_DEV_PREVIEW"), payload)
    root.opened = true
    root.errorText = ""

    if (!wasOpen) {
      root.interactionMode = OmastModel.normalizeMode(payload.mode)
      universalInput.text = typeof payload.prompt === "string" ? payload.prompt : ""
      if (root.appLibrary) root.appLibrary.refreshIcons()
      else root.startFallbackHiddenEntryScan()
      root.refreshLauncherResults()
    }

    Qt.callLater(function() {
      universalInput.forceActiveFocus()
      if (universalInput.text) universalInput.selectAll()
    })
  }

  function close() {
    root.openGeneration += 1
    root.opened = false
    if (previewLoader.item) previewLoader.item.reset()
    root.previewActive = false
    root.interactionMode = "launcher"
    root.selectedIndex = -1
    root.submitting = false
    root.errorText = ""
    universalInput.text = ""
    launcherResults.clear()
  }

  function dismiss() {
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide(root.pluginId)
    else
      root.close()
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  // Non-sensitive IPC diagnostics for integration tests and troubleshooting.
  function status() {
    return JSON.stringify({
      opened: root.opened,
      mode: root.interactionMode,
      inputLength: universalInput.text.length,
      selectedIndex: root.selectedIndex,
      resultCount: launcherResults.count,
      shellAvailable: root.shell !== null,
      appLibraryAvailable: root.appLibrary !== null,
      fallbackReady: root.fallbackReady,
      rawAppCount: root.appLibrary
        ? root.appLibrary.sortedEntries("").length
        : (DesktopEntries.applications.values || []).length,
      busy: root.busy,
      previewActive: root.previewActive,
      previewStatus: root.previewActive && previewLoader.item
        ? previewLoader.item.viewState.status : ""
    })
  }

  function captureInput() {
    return OmastModel.inputSnapshot(
      universalInput.text,
      universalInput.cursorPosition,
      universalInput.selectionStart,
      universalInput.selectionEnd)
  }

  function startFallbackHiddenEntryScan() {
    if (root.appLibrary || !root.omarchyPath) return
    if (fallbackHiddenEntryScan.running) {
      root.fallbackScanPending = true
      return
    }
    var desktops = [
      Quickshell.env("XDG_CURRENT_DESKTOP"),
      Quickshell.env("XDG_SESSION_DESKTOP"),
      Quickshell.env("DESKTOP_SESSION")
    ].filter(function(value) { return String(value || "").length > 0 }).join(":")
    root.fallbackScanPending = false
    root.fallbackScanCompleted = false
    fallbackHiddenEntryScan.command = [
      root.omarchyPath + "/shell/services/hidden-entries.sh", desktops
    ]
    fallbackHiddenEntryScan.running = true
  }

  function restoreInput(snapshot) {
    if (!snapshot || universalInput.text !== snapshot.text) return
    if (snapshot.selectionStart !== snapshot.selectionEnd)
      universalInput.select(snapshot.selectionStart, snapshot.selectionEnd)
    else
      universalInput.cursorPosition = snapshot.cursorPosition
    universalInput.forceActiveFocus()
  }

  function setInteractionMode(mode) {
    var nextMode = OmastModel.normalizeMode(mode)
    if (nextMode === root.interactionMode) return

    var snapshot = root.captureInput()
    root.preservedInput = snapshot
    if (root.previewActive && nextMode !== "quick_ai") {
      if (previewLoader.item) previewLoader.item.reset()
      root.previewActive = false
    }
    root.interactionMode = nextMode
    root.errorText = ""
    if (nextMode === "launcher") root.refreshLauncherResults()
    Qt.callLater(function() { root.restoreInput(snapshot) })
  }

  function refreshLauncherResults() {
    if (root.interactionMode !== "launcher") return

    launcherResults.clear()
    var rows = root.appLibrary
      ? root.appLibrary.sortedEntries(universalInput.text)
      : (root.fallbackReady
        ? OmastModel.fallbackAppEntries(
            DesktopEntries.applications.values || [], universalInput.text, 6,
            root.fallbackConfiguredHiddenIds, root.fallbackDesktopHiddenIds)
        : [])
    if (rows.length > 0) {
      var appCount = Math.min(6, rows.length)
      for (var index = 0; index < appCount; index++) {
        var entry = rows[index].entry
        var desktopId = String((entry && entry.id) || "")
        if (!desktopId) continue
        launcherResults.append({
          kind: "app",
          desktopId: desktopId,
          name: String(root.appLibrary
            ? root.appLibrary.entryName(entry) : (entry.name || desktopId)),
          subtext: String(root.appLibrary
            ? root.appLibrary.entrySubtext(entry)
            : (entry.genericName || "Application")),
          iconName: String(entry.icon || "")
        })
      }
    }

    launcherResults.append({
      kind: "quick_ai",
      desktopId: "",
      name: universalInput.text.trim()
        ? "Ask AI: " + universalInput.text : "Ask AI",
      subtext: "Switch to Quick AI without losing your input",
      iconName: ""
    })
    root.selectedIndex = launcherResults.count > 0 ? 0 : -1
  }

  function moveSelection(delta) {
    root.selectedIndex = OmastModel.moveSelection(
      root.selectedIndex, delta, launcherResults.count)
    if (root.selectedIndex >= 0)
      resultList.positionViewAtIndex(root.selectedIndex, ListView.Contain)
  }

  function activateResult(index) {
    if (index < 0 || index >= launcherResults.count) return
    var result = launcherResults.get(index)
    if (result.kind === "quick_ai") {
      root.setInteractionMode("quick_ai")
      return
    }

    if (root.appLibrary) {
      root.appLibrary.launch(result.desktopId, result.name)
    } else {
      var command = OmastModel.desktopLaunchCommand(result.desktopId)
      if (command.length > 0) Quickshell.execDetached(command)
    }
    root.dismiss()
  }

  function submitQuickAI() {
    if (!root.quickAI || root.busy || OmastModel.isBlank(universalInput.text)) return

    if (root.previewActive) {
      if (previewLoader.item && previewLoader.item.viewState.composerEnabled)
        previewLoader.item.start(universalInput.text)
      return
    }

    root.errorText = ""
    root.stderrText = ""
    root.submitting = true
    root.launchGeneration = root.openGeneration
    root.launchExitCode = -1
    launchProc.command = OmastModel.agentCommand(universalInput.text)
    launchProc.running = true
  }

  function activateCurrent() {
    if (root.quickAI) root.submitQuickAI()
    else root.activateResult(root.selectedIndex)
  }

  function handleEscape() {
    if (root.previewActive && previewLoader.item && previewLoader.item.cancel()) return
    root.dismiss()
  }

  function showLaunchFailure() {
    root.submitting = false
    root.errorText = OmastModel.launchError(root.stderrText)
    Qt.callLater(function() { universalInput.forceActiveFocus() })
  }

  function configureAgent() {
    // Start the settings request while this kept instance is unquestionably
    // alive. There is no deferred callback that can outlive plugin teardown.
    Quickshell.execDetached(["omarchy", "menu", "summon", "setup.default.agent"])
    root.dismiss()
  }

  Connections {
    target: root.appLibrary
    function onAppsChanged() {
      if (root.opened) root.refreshLauncherResults()
    }
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() {
      if (!root.appLibrary) {
        root.fallbackScanPending = true
        fallbackHiddenEntryDebounce.restart()
      }
    }
  }

  onFallbackReadyChanged: if (root.opened && !root.appLibrary)
    root.refreshLauncherResults()

  Component.onCompleted: root.startFallbackHiddenEntryScan()

  FileView {
    path: root.omarchyPath + "/default/omarchy/launcher.hides"
    watchChanges: true
    printErrors: false
    onLoaded: {
      root.fallbackConfiguredHiddenIds = OmastModel.hiddenEntryIds(text())
      root.fallbackConfigLoaded = true
    }
    onFileChanged: {
      root.fallbackConfiguredHiddenIds = OmastModel.hiddenEntryIds(text())
      root.fallbackConfigLoaded = true
      if (root.opened && !root.appLibrary) root.refreshLauncherResults()
    }
    onLoadFailed: {
      root.fallbackConfiguredHiddenIds = ({})
      root.fallbackConfigLoaded = false
    }
  }

  QtObject {
    id: fallbackHiddenEntryOutput
    property string text: ""
  }

  Process {
    id: fallbackHiddenEntryScan
    stdout: SplitParser {
      onRead: function(line) { fallbackHiddenEntryOutput.text += line + "\n" }
    }
    onStarted: fallbackHiddenEntryOutput.text = ""
    onExited: function(exitCode) {
      if (exitCode === 0) {
        root.fallbackDesktopHiddenIds = OmastModel.hiddenEntryIds(
          fallbackHiddenEntryOutput.text)
        root.fallbackScanCompleted = true
      }
      if (root.fallbackScanPending) fallbackHiddenEntryDebounce.restart()
    }
  }

  Timer {
    id: fallbackHiddenEntryDebounce
    interval: 750
    onTriggered: root.startFallbackHiddenEntryScan()
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
      if (root.launchGeneration !== root.openGeneration) {
        root.submitting = false
        return
      }

      if (exitCode === 0) {
        root.submitting = false
        root.dismiss()
      } else {
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

    Shortcut {
      sequence: "Escape"
      context: Qt.WindowShortcut
      autoRepeat: false
      onActivated: root.handleEscape()
    }

    Shortcut {
      sequence: "R"
      context: Qt.WindowShortcut
      autoRepeat: false
      enabled: root.previewActive && previewLoader.item && previewLoader.item.canRetry
      onActivated: previewLoader.item.retry()
    }

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
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
            text: root.quickAI ? "󰚩" : "󰍉"
            color: root.accent
            font.family: Style.font.menuFamily
            font.pixelSize: Style.font.display
            anchors.verticalCenter: parent.verticalCenter
          }

          Column {
            width: parent.width - parent.spacing - Style.font.display
            spacing: Style.spacing.xs

            Text {
              text: root.quickAI ? "Quick AI" : "Omast"
              color: root.foreground
              font.family: Style.font.menuFamily
              font.pixelSize: Style.font.heading
              font.bold: true
            }

            Text {
              width: parent.width
              text: root.quickAI
                ? "Uses your current Omarchy default Agent"
                : "Launch installed apps • Tab for Quick AI"
              color: Qt.darker(root.foreground, 1.45)
              font.family: Style.font.menuFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }
          }
        }

        // This is intentionally the only TextField. Switching modes changes
        // interpretation, not components, preserving cursor, selection and IME.
        TextField {
          id: universalInput
          width: parent.width
          enabled: !root.busy && (!root.previewActive || !previewLoader.item
            || previewLoader.item.viewState.composerEnabled)
          placeholderText: root.quickAI
            ? "Ask AI…" : "Search installed apps…"
          foreground: root.foreground
          accent: root.accent
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.body
          onTextChanged: {
            root.errorText = ""
            if (!root.quickAI) root.refreshLauncherResults()
          }
          onAccepted: root.activateCurrent()

          Keys.onPressed: function(event) {
            if (!root.quickAI && event.key === Qt.Key_Tab
                && !(event.modifiers & Qt.ShiftModifier)) {
              root.setInteractionMode("quick_ai")
              event.accepted = true
            } else if (root.quickAI && (event.key === Qt.Key_Backtab
                       || (event.key === Qt.Key_Tab
                           && (event.modifiers & Qt.ShiftModifier)))) {
              root.setInteractionMode("launcher")
              event.accepted = true
            } else if (!root.quickAI && event.key === Qt.Key_Down) {
              root.moveSelection(1)
              event.accepted = true
            } else if (!root.quickAI && event.key === Qt.Key_Up) {
              root.moveSelection(-1)
              event.accepted = true
            }
          }
        }

        ListView {
          id: resultList
          width: parent.width
          height: visible
            ? Math.min(launcherResults.count * root.rowHeight
                       + Math.max(0, launcherResults.count - 1) * spacing,
                       root.rowHeight * 7 + spacing * 6)
            : 0
          visible: !root.quickAI
          model: launcherResults
          clip: true
          spacing: Style.spacing.xs
          boundsBehavior: Flickable.StopAtBounds

          delegate: BorderSurface {
            id: resultRow
            required property int index
            required property string kind
            required property string desktopId
            required property string name
            required property string subtext
            required property string iconName

            width: ListView.view.width
            height: root.rowHeight
            radius: root.cornerRadius
            color: index === root.selectedIndex
              ? root.selectedBackground : "transparent"
            borderSpec: index === root.selectedIndex
              ? root.selectedBorderSpec : Border.none()

            Image {
              id: appIcon
              visible: resultRow.kind === "app"
              width: Style.font.iconLarge
              height: Style.font.iconLarge
              fillMode: Image.PreserveAspectFit
              sourceSize.width: width * Screen.devicePixelRatio
              sourceSize.height: height * Screen.devicePixelRatio
              source: !visible ? ""
                : (root.appLibrary
                  ? root.appLibrary.iconSource(resultRow.iconName)
                  : Quickshell.iconPath(resultRow.iconName || "application-x-executable", true))
              asynchronous: true
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
            }

            Text {
              id: actionIcon
              visible: resultRow.kind === "quick_ai"
              text: "󰚩"
              color: resultRow.index === root.selectedIndex ? root.selectedText : root.accent
              font.family: Style.font.menuFamily
              font.pixelSize: Style.font.iconLarge
              width: Style.font.iconLarge
              horizontalAlignment: Text.AlignHCenter
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
            }

            Column {
              anchors.left: resultRow.kind === "app" ? appIcon.right : actionIcon.right
              anchors.leftMargin: Style.spacing.md
              anchors.right: keyHint.left
              anchors.rightMargin: Style.spacing.sm
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.spacing.xs

              Text {
                width: parent.width
                text: resultRow.name
                textFormat: Text.PlainText
                color: resultRow.index === root.selectedIndex
                  ? root.selectedText : root.foreground
                font.family: Style.font.menuFamily
                font.pixelSize: Style.font.body
                elide: Text.ElideRight
              }

              Text {
                width: parent.width
                text: resultRow.subtext
                textFormat: Text.PlainText
                color: root.foreground
                opacity: 0.52
                font.family: Style.font.menuFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
            }

            Text {
              id: keyHint
              text: resultRow.kind === "quick_ai" ? "Tab" : "↵"
              color: resultRow.index === root.selectedIndex
                ? root.selectedText : Qt.darker(root.foreground, 1.45)
              font.family: Style.font.menuFamily
              font.pixelSize: Style.font.caption
              anchors.right: parent.right
              anchors.rightMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
            }

            MouseArea {
              anchors.fill: parent
              hoverEnabled: true
              onEntered: root.selectedIndex = resultRow.index
              onClicked: root.activateResult(resultRow.index)
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

        Loader {
          id: previewLoader
          width: parent.width
          active: root.previewActive
          visible: active
          source: "QuickAIPreview.qml"
          height: item ? item.implicitHeight : 0
        }

        Row {
          width: parent.width
          visible: root.quickAI && !root.previewActive
          spacing: Style.spacing.sm

          Text {
            width: parent.width - configureButton.width - parent.spacing
            text: root.busy
              ? "Launching Agent…"
              : "Enter to ask  •  Shift+Tab to Launcher  •  Esc to close"
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
