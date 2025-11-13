# Deploy AggLayerGateway

Script to deploy aggLayerGateway contract

## Setup

- install packages

```
npm i
```

- Set env variables

```
cp .env.example .env
```

Fill `.env` with your `ETHERSCAN_API_KEY` and `DEPLOYER_PRIVATE_KEY`

- Copy configuration files:

```
cp ./tools/deployAggLayerGateway/deploy_parameters.json.example ./tools/deployAggLayerGateway/deploy_parameters.json
```

- Fill configuration file

    - "defaultAdminAddress": "0x.." -> The address of the default admin role for the aggregation layer contract roles managing
    - "aggchainDefaultVKeyRoleAddress": "0x.." -> The address of the AGGCHAIN_DEFAULT_VKEY_ROLE role
    - "addRouteRoleAddress": "0x.." -> The address of the AGGLAYER_ADD_ROUTE_ROLE role
    - "freezeRouteRoleAddress": "0x..." -> The address of the AGGLAYER_FREEZE_ROUTE_ROLE role
    - "verifierAddress": "0x...", -> The address of the verifier

- Set correct openzeppelin manifest  

**Ensure `.openzeppelin` network file is properly set** with the correct admin data for the deployment environment:  
    - [Devnet](https://github.com/agglayer/networks/blob/feature/ALV3/networks/ethereum/devnet/openzeppelin-manifest/sepolia.json)  
    - [Testnet](https://github.com/agglayer/networks/blob/feature/ALV3/networks/ethereum/testnet/openzeppelin-manifest/sepolia.json)  
    - [Mainnet](https://github.com/agglayer/networks/blob/feature/ALV3/networks/ethereum/mainnet/openzeppelin-manifest/mainnet.json)

- Run tool:

```
npx hardhat run ./tools/deployAggLayerGateway/deployAggLayerGateway.ts --network sepolia
```

- OutputFile: `deploy_output.json`

```
{
 "aggLayerGatewayAddress": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
 "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
 "proxyAdminAddress": "0xCafac3dD18aC6c6e92c921884f9E4176737C052c",
 "proxyOwnerAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
 "defaultAdminRoleAddress": "0x229A5bDBb09d8555f9214F7a6784804999BA4E0D",
 "aggchainDefaultVKeyRoleAddress": "0x229A5bDBb09d8555f9214F7a6784804999BA4E0D",
 "addRouteRoleAddress": "0x229A5bDBb09d8555f9214F7a6784804999BA4E0D",
 "freezeRouteRoleAddress": "0x229A5bDBb09d8555f9214F7a6784804999BA4E0D"
 "verifierAddress:": "0x..."
}
```

- aggLayerGatewayAddress
The address of the AggLayer Gateway contract.

- deployer
The Ethereum address used to deploy the contracts. This account typically pays gas fees for deployment and may hold initial privileges before roles are assigned.

- proxyAdminAddress
The address of the ProxyAdmin contract. This contract manages upgrades for your upgradeable proxies, meaning it holds the authority to change the implementation of the proxies.

- proxyOwnerAddress
The owner of the ProxyAdmin contract. This account (often a multisig or timelock) controls the ProxyAdmin and, by extension, the upgrade process for all proxies managed by it.

- defaultAdminRoleAddress
The address assigned the DEFAULT_ADMIN_ROLE in your access control system. This role is the highest-level permission and can grant or revoke other roles, making it critical for overall contract governance.

- aggchainDefaultVKeyRoleAddress
The address designated to manage the default aggregator chain verification key (vKey). This role is responsible for adding or updating the verification key used to validate proofs, ensuring the system can verify state transitions securely.

- addRouteRoleAddress
The address granted permission to add new routes.

- freezeRouteRoleAddress
The address authorized to freeze existing routes. In case of detected anomalies or security concerns, this role can halt further modifications by freezing routes, thus preserving system integrity.

- verifierAddress
Verifier Address
