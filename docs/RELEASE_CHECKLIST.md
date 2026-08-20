# Release checklist

- [ ] Working tree intentionally reviewed and release commit created
- [ ] Version updated consistently in `package.json`, `Cargo.toml`, and `tauri.conf.json`
- [ ] `npm run test:all` passes
- [ ] `npm audit --audit-level=high` reviewed
- [ ] `cargo audit` reviewed
- [ ] Secret scan passes
- [ ] Manual QA matrix completed
- [ ] README screenshots and changelog updated
- [ ] Trademark/logo review completed
- [ ] Installer built on a clean runner
- [ ] Installer signed when a certificate is available
- [ ] SHA-256 checksums generated and published
- [ ] Release notes explain experimental features and known limitations
- [ ] Update notification tested against the final public release
