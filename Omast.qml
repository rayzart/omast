import QtQuick

// M0 contract probe. The visible input surface and agent launch flow are
// implemented in M2; keeping this entry point minimal lets the manifest and
// host lifecycle be validated before application behavior is added.
Item {
  id: root

  // Injected by omarchy-shell for third-party menu plugins.
  property string omarchyPath: ""
  property var shell: null
  property var manifest: null

  property bool opened: false

  function open(payloadJson) {
    root.opened = true
  }

  function close() {
    root.opened = false
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open("{}")
  }
}
