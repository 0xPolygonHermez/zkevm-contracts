# AggchainECDSA
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/aggchains/AggchainECDSA.sol)

**Inherits:**
[AggchainBase](/contracts/v2/lib/AggchainBase.sol/abstract.AggchainBase.md)

Generic aggchain based on ECDSA signature.
An address signs the new_ler and the commit_imported_bridge_exits in order to do state
transitions on the pessimistic trees (local_exit_tree, local_balance_tree, nullifier_tree & height).
That address is the trustedSequencer and is set during the chain initialization.


## State Variables
### _initializerVersion

```solidity
uint8 private transient _initializerVersion;
```


### AGGCHAIN_TYPE

```solidity
bytes2 public constant AGGCHAIN_TYPE = 0;
```


## Functions
### getInitializedVersion


```solidity
modifier getInitializedVersion();
```

### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridgeV2 _bridgeAddress,
    PolygonRollupManager _rollupManager,
    IAggLayerGateway _aggLayerGateway
) AggchainBase(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager, _aggLayerGateway);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address.|
|`_pol`|`IERC20Upgradeable`|POL token contract address.|
|`_bridgeAddress`|`IPolygonZkEVMBridgeV2`|Bridge contract address.|
|`_rollupManager`|`PolygonRollupManager`|Rollup manager contract address.|
|`_aggLayerGateway`|`IAggLayerGateway`|AggLayerGateway contract address.|


### initialize

*The reinitializer(2) is set to support the upgrade from PolygonPessimisticConsensus to AggchainECDSA, where PolygonPessimisticConsensus is already initialized*

**Note:**
security: First initialization takes into account this contracts and all the inheritance contracts
Second initialization does not initialize PolygonConsensusBase parameters
Second initialization can happen if a chain is upgraded from a PolygonPessimisticConsensus


```solidity
function initialize(bytes memory initializeBytesAggchain)
    external
    onlyAggchainManager
    getInitializedVersion
    reinitializer(2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`initializeBytesAggchain`|`bytes`|Encoded bytes to initialize the chain. Each aggchain has its decoded params.|


### getAggchainHash

Callback while pessimistic proof is being verified from the rollup manager

*Return the necessary aggchain information for the proof hashed
AggchainHash:
Field:           | AGGCHAIN_TYPE | aggchainVKey   | aggchainParams |
length (bits):   | 32            | 256            | 256            |
aggchainParams = keccak256(abi.encodePacked(trusted_sequencer))*


```solidity
function getAggchainHash(bytes memory aggchainData) external view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|custom bytes provided by the chain|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|aggchainHash resulting aggchain hash|


### onVerifyPessimistic

Callback from the PolygonRollupManager to update the chain's state.

*Each chain should properly manage its own state.*


```solidity
function onVerifyPessimistic(bytes calldata aggchainData) external onlyRollupManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom chain data to update chain's state|


## Events
### OnVerifyPessimisticECDSA
Emitted when Pessimistic proof is verified.


```solidity
event OnVerifyPessimisticECDSA(bytes32 newStateRoot);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newStateRoot`|`bytes32`|New state root after processing state transition.|

## Errors
### InvalidInitializer
Thrown when trying to initialize the wrong initialize function.


```solidity
error InvalidInitializer();
```

