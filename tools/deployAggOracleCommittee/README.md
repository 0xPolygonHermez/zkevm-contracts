# Deploy AggOracleCommittee

This tool allows deploying an AggOracleCommittee contract, which is responsible for managing the insertion of Global Exit Roots (GERs) into the AgglayerGERL2 through a decentralized oracle committee mechanism.

## Overview

The AggOracleCommittee contract implements a multi-signature approach where multiple oracle members must propose the same Global Exit Root to reach consensus before it can be consolidated.

Key features:

- Requires a quorum of oracle members to agree on a GER before consolidation
- Oracle members can update their votes
- Owner can add/remove oracle members and update the quorum
- Automatic consolidation when quorum is reached

## Requirements

- Node.js >= 14
- Hardhat
- An RPC endpoint
- A deployer account with sufficient balance

## Configuration

1. Copy the example parameters file:

```bash
cp tools/deployAggOracleCommittee/deploy_parameters.json.example tools/deployAggOracleCommittee/deploy_parameters.json
```

2. Edit `deploy_parameters.json` with your specific configuration:

### Required Parameters:

- `globalExitRootManagerL2SovereignAddress`: Address of the AgglayerGERL2 contract that will receive the consolidated GERs
- `ownerAddress`: Address that will own the AggOracleCommittee contract (typically a timelock contract)
- `aggOracleMembers`: Array of addresses that will act as initial oracle members
- `quorum`: Number of oracle members that must agree on a GER for it to be consolidated (must be <= aggOracleMembers.length and > 0)

### Optional Parameters:

- `deployerAddress`: Address of the deployer (if using a specific address)
- `deployerPvtKey`: Private key of the deployer (if not using hardware wallet)
- `maxFeePerGas`: Maximum fee per gas for deployment transaction
- `maxPriorityFeePerGas`: Maximum priority fee per gas
- `multiplierGas`: Gas multiplier for the transaction

## Deployment

### Using Hardhat:

```bash
npx hardhat run tools/deployAggOracleCommittee/deployAggOracleCommittee.ts --network <YOUR_NETWORK>
```

## Output

After successful deployment, the tool will generate a `deploy_output.json` file containing:

- `gitInfo`: Git information of the deployment
- `aggOracleCommitteeAddress`: Deployed contract address
- `deployer`: Address that deployed the contract
- `proxyAdminAddress`: ProxyAdmin contract address
- `proxyOwnerAddress`: Owner of the ProxyAdmin
- `ownerAddress`: Owner of the AggOracleCommittee
- `globalExitRootManagerL2SovereignAddress`: Address of the GlobalExitRootManagerL2Sovereign
- `aggOracleMembers`: List of initial oracle members
- `quorum`: Configured quorum value

## Post-Deployment

After deployment, the owner can:

1. **Add oracle members**: Call `addOracleMember(address)`
2. **Remove oracle members**: Call `removeOracleMember(address, index)`
3. **Update quorum**: Call `updateQuorum(uint64)`
4. **Transfer globalExitRootUpdater role**: Call `transferGlobalExitRootUpdater(address)`
5. **Accept globalExitRootUpdater role**: Call `acceptGlobalExitRootUpdater()`

Oracle members can:

1. **Propose GERs**: Call `proposeGlobalExitRoot(bytes32)`

## Important Notes

- The quorum must always be greater than 0 and less than or equal to the number of oracle members
- Oracle members cannot vote for the same GER twice without changing their vote first
- When an oracle member is removed, their vote is automatically subtracted from any pending GER
- GERs are automatically consolidated when they reach the quorum threshold
- The contract uses OpenZeppelin's upgradeable pattern for future improvements
