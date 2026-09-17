# Security

## Trust boundary

Omarchy plugins run unsandboxed inside the long-lived `omarchy-shell` process
with the current user's permissions. Review plugin source before installing or
updating it.

Omast itself:

- does not read, store, or proxy Agent or API credentials;
- does not directly access the network;
- does not request `sudo` or `pkexec`;
- does not write system directories or user configuration;
- does not run installation hooks or background services;
- passes prompts as a process argument array, without `eval`, `sh -c`, or
  command-string interpolation.

Omast delegates to `omarchy agent prompt`. Omarchy may launch the selected
Agent with auto-approval, yolo, allow-all, or similar unattended options. The
Agent may therefore run commands, use tools, and modify files according to its
own capabilities and configuration. Invoke Omast only from a working directory
whose contents the Agent may safely access.

## Reporting a vulnerability

Do not include credentials, private prompts, or other sensitive data in a
public report. Open a GitHub security advisory for `rayzart/omast` when private
reporting is available; otherwise contact the maintainer before publishing
details.
