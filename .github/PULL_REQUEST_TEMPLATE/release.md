## Release Description
## Checklist
- [ ] The CHANGELOG file has been updated (`./generate_changelog.ts <old-tag> <new-tag>`).
- [ ] Add new contracts in `githooks/pre-commit` file.
- [ ] Run `./.githooks/pre-commit` to regenerate docs, `compiled-contracts`, `selectors.txt`, `storage-layout.txt`.
- [ ] The release change information has been added in more detail to the documentation [repository](https://github.com/agglayer/protocol-team-docs).