# Changelog

## 0.2.0 - 2026-11-02

- The MCP connection now tells bisibility which plugin version is calling, so the service can ask for an update before a breaking change. After updating, quit and reopen DeepSeek Harness.
- The panel shows an Update required card with a button to the Plugins page when bisibility no longer accepts the installed version.
- When an MCP request fails on the network, the panel names the request and the network error instead of a bare `fetch failed`.

## 0.1.0 - 2026-11-02

- Initial release.
