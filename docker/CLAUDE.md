# docker/

Docker setup that creates a geth node with all Agglayer contracts pre-deployed.

## What It Does

Builds a `geth-zkevm-contracts:latest` Docker image containing a geth node with all contracts deployed. Used for local testing and integration testing.

## Commands

```bash
npm run docker:contracts          # Build docker with basic deployment
npm run dockerv2:contracts        # Build docker with v2 deployment
npm run dockerv2:contracts:all    # Build docker with v2 + AggchainECDSA + PessimisticConsensus
npm run docker:tests              # Run docker-based tests
```

Run the container: `docker run -p 8545:8545 geth-zkevm-contracts:latest`

## Output Files

After building, deployment output is in:
- `docker/deploymentOutput/deploy_output.json`
- `docker/deploymentOutput/create_rollup_output.json`
- `docker/deploymentOutput/genesis.json`
- `docker/deploymentOutput/genesis_sovereign.json`

## Config

- `docker/scripts/v2/create_rollup_parameters_docker.json` -- rollup config for docker deployment
- Multiple `create_rollup_parameters_docker-xxxx.json` templates for different chain types

## Creating Additional Rollups in Docker

1. Copy template from `./docker/scripts/v2/create_rollup_parameters_docker-xxxx.json` to `deployment/v2/create_rollup_parameters.json`
2. Copy `genesis.json`, `genesis_sovereign.json` and `deploy_output.json` from `docker/deploymentOutput/` to `deployment/v2/`
3. Run `npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost`

## Default Mnemonic

Uses `test test test test test test test test test test test junk`. First 20 accounts are funded with ether. First account is the deployer and holds all test POL tokens.

## Files

- `Dockerfile` -- Multi-stage build
- `docker-compose.yml` -- Compose config
- `entrypoint.sh` -- Container entrypoint
- `nginx.conf` -- Nginx config (for serving artifacts)
- `docker-tests.test.ts` / `docker-verify.test.ts` / `tools-docker-tests.test.ts` -- Docker integration tests
