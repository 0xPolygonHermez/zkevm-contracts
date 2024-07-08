# Requirements

1. Create the account that will be the admin of the system. The admin account wll be responsible for updating the CDK contracts on L2, and deploying all contracts
2. Fund the adm account with ether.
3. Create the kms keys for the multisig owners
4. Deploy the multisig wallet
5. Deploy the ALCB contract
6. Create 6 privatekey and store them as .keystore files protected by a password. Aggregator, sequencer, tx Claimer and 1 for each of the 3 data committee members.
7. Fund the aggregator and sequencer accounts with ether.
8. Fund the sequencer with WETH.
9. Store the .keystore files and passwords in the GCP secrets Manager as backups
10. Fill out the CDK deployment parameters
11. Deploy the CDK smart contracts


## Gas Costs

| Operation                        | Gas Cost    |
| -------------------------------- | ----------- |
| Multisig deployment              | 2,883,878   |
| Multisig setup                   | 189,188     |
| ALCB deployment                  | 2,064,834   |
| Deployer deployment              | 1,000,000 * |
| ProxyAdmin deployment            | 544,624     |
| Bridge impl deployment           | 5,500,000   |
| Timelock deployment              | 2,472,526   |
| Transfer ownership timelock      | 28,883      |
| Bridge proxy deployment          | 802,408     |
| Global exit impl deployment      | 627,301     |
| Global exit proxy deployment     | 615,535     |
| Rollup Manager impl deployment   | 5,014,099   |
| Rollup Manager proxy deployment  | 1,083,899   |
| Verifier deployment              | 5,053,643   |
| PolygonValidium impl deployment  | 4,423,685   |
| PolygonValidium proxy deployment | 861,794     |
| PolygonDataCommittee impl        | 1,291,353   |
| PolygonDataCommittee proxy       | 665,061     |
| Setup validium protocol          | 52,900      |
| Setup data committee             | 247,442     |


* The deployer deployment gas is set to 100 GWEI, so the gas cost will always be fixed at 0.1 ether.

## Deployment Parameters

Polygon CDK deloyment parameters (`deploy_parameters.json`)

```json
{
    "test": true, // this flag is misnamed, it makes the deployer account the default admin of the rollupmanager contract, we need this in order to deploy the rollup contract
    "timelockAdminAddress": "0xAcE47A32942eD15a16AeAF660C4b2C23cAC2c02c", // multisig
    "minDelayTimelock": 3600,
    "salt": "0x416c6963656e6574322e30000000000000000000000000000000000000000000", // bytes32 of 'Alicenet2.0'
    "initialZkEVMDeployerOwner": "0x997FA9a67800Eb4b1e8FE06Bd4A8e4C0a8E823a5", // deployer account
    "admin": "0xAcE47A32942eD15a16AeAF660C4b2C23cAC2c02c", // deployer account
    "trustedAggregator": "0x77a66Bc1e22886FF05d3Cfde018FA1716aED33c1", //aggregator account
    "trustedAggregatorTimeout": 604799,
    "pendingStateTimeout": 604799,
    "emergencyCouncilAddress": "0xAcE47A32942eD15a16AeAF660C4b2C23cAC2c02c", // multisig
    "polTokenAddress": "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // WETH
    "zkEVMDeployerAddress": "0x15E09bA60FA96D1bFDb79C3adD88ad9E57D26bA0", // deterministic deployer, auto generated
    "gasTokenAddress": "0x522F9927DE2A6c707bF441D3cdd07c4442ea4A51", // ALCB
    "gasTokenNetwork": 0,
    "deployerPvtKey": "", // deployer account private key, may be put in the environment variable or hardhat config
    "maxFeePerGas": "30",
    "maxPriorityFeePerGas": "1",
    "multiplierGas": ""
}
```

Roll up deployment parameters (`create_rollup_parameters.json`)

```json
{
    "realVerifier": true,
    "trustedSequencerURL": "http://127.0.0.1:8123", // should be a localhost since we will be using consul service mesh data connect
    "networkName": "alicenetTestnet",
    "description": "0.0.1",
    "trustedSequencer": "0xf6e501cE273b61D73641F19920a304FfF859DE62", // sequencer account
    "chainID": 10042, // have different chain id for each network
    "adminZkEVM": "0x997FA9a67800Eb4b1e8FE06Bd4A8e4C0a8E823a5", // deployer account
    "forkID": 9, // version of the fork (verifier contract)
    "consensusContract": "PolygonValidiumEtrog", // name of the consensus contract
    "gasTokenAddress": "0x522F9927DE2A6c707bF441D3cdd07c4442ea4A51", // ALCB
    "deployerPvtKey": "", // deployer account private key, may be put in the environment variable or hardhat config
    "maxFeePerGas": "30",
    "maxPriorityFeePerGas": "1",
    "multiplierGas": ""
}
```

Post deployment parameters (`post_deployment_parameters.json`)

```json
{
    "committeeMembersAddresses": [
        "0xc5e5dbf664c448cc257b9c9dd4a149abd834bcf9",
        "0xe16509683048485183c7ea9e7feed905d9d51cf9",
        "0xfe95082c21d3fd64941b23cc5a44c52c02a5dbb5"
    ], // make sure that the addresses are placed in lexicographical order
    "committeeMembersURLs": ["http://127.0.0.1:8444", "http://127.0.0.1:8445", "http://127.0.0.1:8446"],
    "committeeMembersThreshold": 2,
    "deployerPvtKey": "",
    "maxFeePerGas": "30",
    "maxPriorityFeePerGas": "1",
    "multiplierGas": ""
}
```

## Deployment Tests

1. Check ownership timelock, should be the multisig wallet
2. The ALCB address is set in the L1 bridge contract


## Roles

### L2 Admin and deployer account

The admin is responsible for deploying the contracts and updating the contracts on L2. The admin is the only account that can deploy the contracts. The admin account is funded with ether to pay for the deployment of the contracts.

The admin account will be the admin of the rollup manager, hence, it will be able to add rollup contracts (consensus contracts), add trusted aggregators and sequencers on L1.

The admin account will be the admin of the data committee, hence, it will be able to add data committee members and remove them.

The admin account will be the admin of the deterministic deployer contract, hence, it will be able to act as admin to contracts deployed by the deterministic deployer contract (bridge only).

Post-deployment, the admin account should be replaced by the multisig wallet both on L1 and L2? (L2 will require the deployment of a multisig wallet).

### Multisig Smart contract

The multisig wallet will be the overall admin of the system. The multisig wallet will be responsible for updating the CDK contracts and its parameters on L1, it will be the owner of the Alicenet factory (legacy system). Once a threshold of owners approve a transaction, the transaction will be executed.

### Timelock Contract

The polygon CDK contracts will be updated via timelock contract. The timelock contract will be actual admin on the implementation level of most of the polygon CDK smart contract proxy. Via the timelock contract we will be able to update the implementation of the proxy contracts and parameters of the contracts, but a certain delay needs to be met. Every transaction of the timelock contract will be executed after a delay. Only the contract admin (multi sig wallet on L1 and admin on L2) will be able to execute and propose transactions via the timelock contract.

### Emergency Consul

The polygon CDK has a set of accounts that can act in case of an emergency on the system, and halt it. On the alicenet case, this will be the Multisig smart contract.

### Deterministic Deployer Contract

The polygon CDK use a smart contract to deploy smart contracts to a certain deterministic address. Only the ProxyAdmin, Timelock, Bridge Proxy and Bridge implementation are deployed using it, the rest are deployed using a normal openzeppelin transparent proxy. Some contracts (bridge), will have the deterministic deployer contract as the implementation admin. However, via the deterministic deployer we can call arbitrary functions on the contracts deployed by it. Only the admin of the contract can call these functions and deploy smart contracts. In this case the admin will be deployer account (same as the l2 admin). Once the deployment is done, the bridge admin will be changed to be the multisig wallet on L1 and the admin account on L2. But in case some contract also remains with the deterministic deployer as admin remember this note.


## To Do
1. Check the amount of ether needed for the admin account
2. Create alerts for when the balance of the aggregator and sequencer accounts is low