# Development Workflow

## Git Flow
1. Branch from main
2. Write code
3. Run full coverage (`npm run coverage`)
4. Ensure linting passes (`npm run lint`)
5. PR with descriptive title explaining what it does

## Git Hooks
- Pre-commit hook available in `.githooks/` (activate with `git config --local core.hooksPath .githooks/`)
- Hook runs lint, compiles, copies ABIs, generates docs and storage layouts
- Used sometimes, not on every commit
- Requires Foundry nightly for transient storage support

## Production Rules
- All deployments and upgrades MUST use Hardhat-compiled artifacts
- Foundry bytecodes are NOT valid for production (different from Hardhat)
- Foundry is for testing and development only

## Chain Onboarding
- Use `tools/createNewRollup/` to register new chains
- Current active chain types: AggchainFEP and AggchainECDSA

## Upgrades
- Mainnet timelock: 3 days delay (0 during emergency state)
- Active L2 upgrade scripts: `upgrade/upgradeEtrogSovereign/`, `upgrade/upgradeSovereignBridge/`
- Chain contract upgrades: via `AgglayerManager.updateRollup()`
