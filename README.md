# Omast

**Omast — Ask AI with your default Omarchy agent.**

Omast is planned as an Omarchy-native prompt entry point. It will accept a
question in a centered shell menu and hand it to the Agent currently selected
in Omarchy. Agent selection, terminal startup, and provider-specific command
line options remain owned by Omarchy.

> Development status: M0 bootstrap. The manifest and menu lifecycle probe are
> present, but the prompt interface is not implemented yet.

## Compatibility

The initial target is Omarchy 4 (validated against `4.0.3-1`) with the
Quickshell plugin host. A configured and installed Omarchy Agent is required at
runtime. Omast does not call model APIs directly and does not require API keys
of its own.

The implementation contract is deliberately small:

- plugin kind: `menu`
- shell lifecycle: `open(payloadJson)`, `close()`, and `toggle()`
- Agent handoff: argv array equivalent to
  `omarchy agent prompt "<prompt>"`
- planned shortcut: `Super+Space`, configured manually by the user

## Development checks

Run the installed Omarchy validator and Qt QML linter from the repository root:

```bash
jq empty manifest.json
omarchy plugin validate .
/usr/lib/qt6/bin/qmllint -I "$OMARCHY_PATH/shell" Omast.qml
```

On this Omarchy installation, `qmllint` is supplied by `qt6-declarative` under
`/usr/lib/qt6/bin` and is not on the default `PATH`.

The development and release sequence is maintained in
[`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md).

## Safety boundary

Omarchy plugins execute unsandboxed inside `omarchy-shell` with the current
user's permissions. Omast's MVP will not read credentials, call model APIs,
request elevated privileges, edit system files, or automatically overwrite
Hyprland configuration. Prompt text must be passed as a process argument and
must never be evaluated by a shell.

The Omarchy Agent launcher may start the selected Agent with unattended or
auto-approval options. Use it only from a working directory whose contents the
Agent may safely access and modify.

## License

[MIT](LICENSE)
