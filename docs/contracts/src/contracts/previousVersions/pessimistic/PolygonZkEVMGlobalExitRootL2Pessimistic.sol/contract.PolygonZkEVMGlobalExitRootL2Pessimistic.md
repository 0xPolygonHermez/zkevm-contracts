# PolygonZkEVMGlobalExitRootL2Pessimistic
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/previousVersions/pessimistic/PolygonZkEVMGlobalExitRootL2Pessimistic.sol)

**Inherits:**
[IBasePolygonZkEVMGlobalExitRootPessimistic](/contracts/previousVersions/pessimistic/IBasePolygonZkEVMGlobalExitRootPessimistic.sol/interface.IBasePolygonZkEVMGlobalExitRootPessimistic.md)

Contract responsible for managing the exit roots for the L2 and global exit roots
The special zkRom variables will be accessed and updated directly by the zkRom


## State Variables
### globalExitRootMap

```solidity
mapping(bytes32 => uint256) public globalExitRootMap
```


### lastRollupExitRoot

```solidity
bytes32 public lastRollupExitRoot
```


### bridgeAddress

```solidity
address public immutable bridgeAddress
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.


```solidity
uint256[50] private __gap
```


## Functions
### constructor


```solidity
constructor(address _bridgeAddress) ;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
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


