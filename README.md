# Omast

**Omast — Ask AI with your default Omarchy agent.**

Omast adds a focused, Omarchy-native prompt surface to your desktop. Type a
question, press Enter, and Omast hands the prompt to the Agent already selected
in Omarchy. The answer continues in Omarchy's dedicated Agent terminal.

Omast is an entry point, not another AI provider: it does not call model APIs,
store credentials, or duplicate provider-specific CLI options.

## Requirements

- Omarchy 4 with the Quickshell plugin host
- A default Agent selected through Omarchy
- The selected Agent installed and authenticated

Development currently targets Omarchy `4.0.3-1` and Quickshell `0.3.1`.

## Install

Install and enable the plugin from its public GitHub repository:

```bash
omarchy plugin add https://github.com/rayzart/omast.git --enable
```

The plugin does not edit your Hyprland configuration. Add the shortcut
manually to `~/.config/hypr/bindings.lua` after reviewing the change:

```lua
-- SUPER+SPACE normally opens the stock Omarchy menu.
hl.unbind("SUPER + SPACE")
o.bind(
  "SUPER + SPACE",
  "Omast — Ask AI",
  "omarchy-shell shell toggle io.github.rayzart.omast '{}'"
)
```

Then validate the configuration:

```bash
hyprctl reload
hyprctl configerrors
```

`Super+Shift+Space` is already used to toggle the top bar and should not be
used as a replacement root-menu shortcut. The stock menu remains available
from the bar; choose any additional conflict-free shortcut yourself if you
also want a keyboard shortcut for it.

## Use

1. Press `Super+Space`.
2. Type a prompt.
3. Press Enter to launch the configured Omarchy Agent.

Escape closes the surface. Blank prompts do nothing. While a prompt is being
submitted, duplicate submission is disabled. If launch fails, the prompt stays
in the input and Omast displays the launcher error.

Use **Choose Agent** to open Omarchy's default Agent menu.

## How it works

Omast invokes the equivalent of:

```bash
omarchy agent prompt "<prompt>"
```

The command is executed as an argument array. Prompt content—including spaces,
Unicode, quotes, backticks, semicolons, pipes, and `$()`—is passed as data and
is never evaluated by a shell.

Agent selection, provider flags, terminal launch, and working-directory policy
remain owned by Omarchy. Omast deliberately does not embed streamed answers,
chat history, attachments, screenshots, or project selection in version 0.1.

## Update

```bash
omarchy plugin update io.github.rayzart.omast
```

## Remove

First remove the Omast override from `~/.config/hypr/bindings.lua`—both the
`hl.unbind("SUPER + SPACE")` line and the matching `o.bind(...)` block. The
stock Omarchy `Super+Space` binding will then apply again. Validate the restored
configuration:

```bash
hyprctl reload
hyprctl configerrors
```

Then remove the plugin:

```bash
omarchy plugin remove io.github.rayzart.omast
```

## Troubleshooting

- **Nothing opens:** confirm the plugin is enabled with
  `omarchy plugin list --json`, then run `omarchy-shell shell rescanPlugins`.
- **No default Agent:** click **Choose Agent**, or run
  `omarchy default agent <name>`.
- **Agent is not installed:** choose an installed Agent or install the selected
  Agent through the relevant Omarchy setup flow.
- **QML fails to load:** validate the checkout with
  `omarchy plugin validate <plugin-directory>` and inspect the Omarchy shell
  logs.

## Development

Run all repository checks:

```bash
tests/smoke.sh
```

The script runs model tests, manifest checks, the installed official Omarchy
validator, and QML lint when those local tools are available. On this Omarchy
installation, `qmllint` is located at `/usr/lib/qt6/bin/qmllint`.

See [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) for the implementation and
release plan, and [`SECURITY.md`](SECURITY.md) for the trust boundary.

## License

[MIT](LICENSE)
