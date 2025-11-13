# PolygonZkEVMExistentEtrogPessimistic
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/previousVersions/pessimistic/PolygonZkEVMExistentEtrogPessimistic.sol)

**Inherits:**
[PolygonRollupBaseEtrogPessimistic](/contracts/v2/previousVersions/pessimistic/PolygonRollupBaseEtrogPessimistic.sol/abstract.PolygonRollupBaseEtrogPessimistic.md)

Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.


## State Variables
### SET_UP_ETROG_TX

```solidity
bytes public constant SET_UP_ETROG_TX =
    hex"df2a8080944d5cf5032b2a844602278b01199ed191a86c93ff8080821092808000000000000000000000000000000000000000000000000000000005ca1ab1e000000000000000000000000000000000000000000000000000000005ca1ab1e01bff";
```


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridgeV2 _bridgeAddress,
    PolygonRollupManagerPessimistic _rollupManager
) PolygonRollupBaseEtrogPessimistic(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IPolygonZkEVMBridgeV2`|Bridge address|
|`_rollupManager`|`PolygonRollupManagerPessimistic`|Global exit root manager address|


### initializeUpgrade

note This initializer will be called instead of the PolygonRollupBase
This is a especial initializer since the zkEVM it's an already created network


```solidity
function initializeUpgrade(
    address _admin,
    address _trustedSequencer,
    string memory _trustedSequencerURL,
    string memory _networkName,
    bytes32 _lastAccInputHash
) external onlyRollupManager initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_admin`|`address`|Admin address|
|`_trustedSequencer`|`address`|Trusted sequencer address|
|`_trustedSequencerURL`|`string`|Trusted sequencer URL|
|`_networkName`|`string`|L2 network name|
|`_lastAccInputHash`|`bytes32`|Acc input hash|


## Events
### UpdateEtrogSequence
*Emitted when the system is updated to a etrog using this contract, contain the set up etrog transaction*


```solidity
event UpdateEtrogSequence(uint64 numBatch, bytes transactions, bytes32 lastGlobalExitRoot, address sequencer);
```

