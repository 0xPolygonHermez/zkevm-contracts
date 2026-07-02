# TESTING.md

How testing works in this repo. AGENTS.md points here so agents know how to verify changes.

## Frameworks & tools

- **Hardhat + Mocha + Chai** (`@nomicfoundation/hardhat-chai-matchers`) — the **primary** test
  suite. TypeChain (`ethers-v6`) provides typed contract bindings.
- **Foundry (forge)** — **supplementary** tests (fuzz, base, utils). Requires Hardhat artifacts to
  compile (run `npx hardhat compile` first).
- **solidity-coverage** — Hardhat coverage. **`forge coverage`** — Foundry coverage.

> Production builds and deployments MUST use Hardhat-compiled artifacts. Foundry produces different
> bytecode and is for testing/development only.

## Unit tests

- **Scope:** primary contract behavior tests using Hardhat/Mocha with typed bindings and mocks from
  `contracts/mocks/`.
- **Location:** `test/contractsv2/**/*.ts` (plus `test/index.test.js`, `test/src/*.ts`, and
  real-prover tests under `test/contractsv2/real-prover-sp1/`).
- **Run:** `npm run test`

## Integration / Foundry tests

- **Scope:** Solidity-level tests including fuzz tests, run directly against compiled contracts.
- **Location:** `test/forge/` (`base/`, `fuzz/`, `utils/`, `script/`).
- **Run:** `just test` (or `forge test`)
- **Prerequisites:** `npx hardhat compile` first (Foundry needs Hardhat artifacts to resolve
  cross-contract compiler-version mismatches); `just install` to fetch Soldeer deps; Foundry
  nightly for transient-storage support.

## Conventions

- Hardhat tests are `*.ts` under `test/contractsv2/`; Foundry tests are `*.sol` under `test/forge/`.
- No exclusive tests: `.only` is banned (`no-exclusive-tests: error` in ESLint).
- Every bugfix should add a regression test; new contract behavior should add coverage.
- Coverage target: 100% ideally.
- Lint and Solidity formatting must pass (`npm run lint`, `npm run prettier:contracts`) — these are
  enforced in CI (`compile.yml`).

## Execution summary

| Goal | Command |
| :-----------------------------: | :--------------------------------------: |
| Compile (required first) | `npx hardhat compile` |
| Run unit tests (Hardhat) | `npm run test` |
| Run Foundry tests | `just test` |
| Hardhat coverage | `npm run coverage` |
| Foundry coverage | `just coverage` |
| Lint (TS) | `npm run lint` |
| Solidity format check | `npm run prettier:contracts` |
