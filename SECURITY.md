# Security Policy

## Reporting a Vulnerability

The Agglayer contracts secure real value on Ethereum L1 and connected chains. If you discover a
security vulnerability, **please do not open a public issue or PR**.

Instead, report it privately through one of these channels:

- Open a [GitHub private security advisory](https://github.com/agglayer/agglayer-contracts/security/advisories/new).
- Refer to the Polygon / Agglayer bug bounty program for scope and rewards, if one applies to this repository.

Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce (proof-of-concept, affected contract/function, and network if relevant).
- Any suggested mitigation.

We will acknowledge your report, investigate, and coordinate a fix and disclosure timeline with you.

## Scope

- Solidity contracts under `contracts/` (excluding contracts explicitly marked deprecated, e.g.
  `FflonkVerifier*`, `PolygonZkEVMDeployer`, `contracts/previousVersions/`).
- Deployment and upgrade scripts that affect on-chain state.

## Out of Scope

- Issues in third-party dependencies (report upstream).
- Emergency state and incident response, which are handled by the emergency council.
- Test-only code, mocks, and local Docker tooling.
