# Changelog

## 0.2.3 - 2026-11-02

- The README gives step-by-step market setup, including the hidden Discover tab, and the uninstall-and-install update flow.

## 0.2.2 - 2026-11-02

- The sign-in now survives restarts: after DeepSeek Harness starts on a new port, the plugin refreshes with its original OAuth client instead of failing with HTTP 400 and signing you out.
- Once connected, the panel hides the sign-in help and, after your next sign-in, shows the signed-in account.
- The panel shows when a newer version is available in the plugin market and links to the Plugins page.
- Sign-in and refresh errors include the error code and description bisibility returned.
- Update notices say to quit and reopen DeepSeek Harness, and the panel links to the plugin guide and troubleshooting.

## 0.2.1 - 2026-11-02

- After a restart the panel reconnects from the stored sign-in instead of showing Not connected, and Refresh retries a sign-in refresh that failed while offline.

## 0.2.0 - 2026-11-02

- The MCP connection now tells bisibility which plugin version is calling, so the service can ask for an update before a breaking change. After updating, quit and reopen DeepSeek Harness.
- The panel shows an Update required card with a button to the Plugins page when bisibility no longer accepts the installed version.
- When an MCP request fails on the network, the panel names the request and the network error instead of a bare `fetch failed`.

## 0.1.0 - 2026-11-02

- Initial release.
