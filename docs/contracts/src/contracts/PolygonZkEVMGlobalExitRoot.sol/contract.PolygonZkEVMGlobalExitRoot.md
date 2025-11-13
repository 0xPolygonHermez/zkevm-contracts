# PolygonZkEVMGlobalExitRoot
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/PolygonZkEVMGlobalExitRoot.sol)

**Inherits:**
[IPolygonZkEVMGlobalExitRoot](/contracts/interfaces/IPolygonZkEVMGlobalExitRoot.sol/interface.IPolygonZkEVMGlobalExitRoot.md)

Contract responsible for managing the exit roots across multiple networks


## State Variables
### bridgeAddress

```solidity
address public immutable bridgeAddress;
```


### rollupAddress

```solidity
address public immutable rollupAddress;
```


### lastRollupExitRoot

```solidity
bytes32 public lastRollupExitRoot;
```


### lastMainnetExitRoot

```solidity
bytes32 public lastMainnetExitRoot;
```


### globalExitRootMap

```solidity
mapping(bytes32 => uint256) public globalExitRootMap;
```


## Functions
### constructor


```solidity
constructor(address _rollupAddress, address _bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_rollupAddress`|`address`|Rollup contract address|
|`_bridgeAddress`|`address`|PolygonZkEVMBridge contract address|


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

## Events
### UpdateGlobalExitRoot
*Emitted when the global exit root is updated*


```solidity
event UpdateGlobalExitRoot(bytes32 indexed mainnetExitRoot, bytes32 indexed rollupExitRoot);
```

