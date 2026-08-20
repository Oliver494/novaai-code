# Local security audit

Last local review: 2026-08-13.

## Results

- Frontend secret scan: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- RustSec `cargo audit`: no vulnerability failure; 17 dependency warnings.
- Agent path traversal, symlink, ignored-folder, command allowlist, cancellation, rollback, and credential-redaction tests: passed.

## RustSec warnings

The lockfile contains GTK3 crates marked unmaintained and a historical `glib` unsoundness warning. These are Linux-target dependencies and are not selected by `cargo tree --target x86_64-pc-windows-msvc` for the current Windows product.

Several `unic-*` crates and `proc-macro-error` are marked unmaintained. They are transitive dependencies under Tauri's dependency graph; Nova does not call them directly. They must be reviewed when upgrading Tauri and should not be silently ignored for future cross-platform builds.

This report is not a professional penetration test. A public release still needs a clean-machine installer test, code signing, and periodic dependency review.
