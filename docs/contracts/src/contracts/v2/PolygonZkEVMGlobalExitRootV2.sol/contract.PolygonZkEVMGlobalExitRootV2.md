# PolygonZkEVMGlobalExitRootV2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/PolygonZkEVMGlobalExitRootV2.sol)

**Inherits:**
[PolygonZkEVMGlobalExitRootBaseStorage](/contracts/v2/lib/PolygonZkEVMGlobalExitRootBaseStorage.sol/abstract.PolygonZkEVMGlobalExitRootBaseStorage.md), [DepositContractBase](/contracts/v2/lib/DepositContractBase.sol/contract.DepositContractBase.md), Initializable

Contract responsible for managing the exit roots across multiple networks


## State Variables
### bridgeAddress
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
address public immutable bridgeAddress;
```


### rollupManager
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
address public immutable rollupManager;
```


### GER_VERSION

```solidity
string public constant GER_VERSION = "al-v0.3.0";
```


### l1InfoRootMap

```solidity
mapping(uint32 leafCount => bytes32 l1InfoRoot) public l1InfoRootMap;
```


## Functions
### constructor


```solidity
constructor(address _rollupManager, address _bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_rollupManager`|`address`|Rollup manager contract address|
|`_bridgeAddress`|`address`|PolygonZkEVMBridge contract address|


### initialize

Reset the deposit tree since will be replace by a recursive one


```solidity
function initialize() external virtual initializer;
```

### updateExitRoot

Update the exit root of one of the networks and the global exit root


```solidity
function updateExitRoot(bytes32 newRoot) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRoot`|`bytes32`|new exit tree root|


### getLastGlobalExitRoot

Return last global exit root


```solidity
function getLastGlobalExitRoot() public view returns (bytes32);
```

### getRoot

Computes and returns the merkle root of the L1InfoTree


```solidity
function getRoot() public view override(DepositContractBase, IPolygonZkEVMGlobalExitRootV2) returns (bytes32);
```

### getLeafValue

Given the leaf data returns the leaf hash


```solidity
function getLeafValue(bytes32 newGlobalExitRoot, uint256 lastBlockHash, uint64 timestamp)
    public
    pure
    returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newGlobalExitRoot`|`bytes32`|Last global exit root|
|`lastBlockHash`|`uint256`|Last accessible block hash|
|`timestamp`|`uint64`|Ethereum timestamp in seconds|


## Events
### UpdateL1InfoTree
*Emitted when the global exit root is updated*


```solidity
event UpdateL1InfoTree(bytes32 indexed mainnetExitRoot, bytes32 indexed rollupExitRoot);
```

### UpdateL1InfoTreeV2
*Emitted when the global exit root is updated with the L1InfoTree leaf information*


```solidity
event UpdateL1InfoTreeV2(bytes32 currentL1InfoRoot, uint32 indexed leafCount, uint256 blockhash, uint64 minTimestamp);
```

### InitL1InfoRootMap
*Emitted when the global exit root manager starts adding leafs to the L1InfoRootMap*


```solidity
event InitL1InfoRootMap(uint32 leafCount, bytes32 currentL1InfoRoot);
```

