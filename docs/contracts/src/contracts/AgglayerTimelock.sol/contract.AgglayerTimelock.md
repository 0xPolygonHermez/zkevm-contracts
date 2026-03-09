# AgglayerTimelock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/AgglayerTimelock.sol)

**Inherits:**
TimelockController

Contract module which acts as a timelocked controller.
This gives time for users of the controlled contract to exit before a potentially dangerous maintenance operation is applied.
If emergency mode of the Agglayer system is active, this timelock has no delay.


## State Variables
### agglayerManager

```solidity
IEmergencyManager public immutable agglayerManager
```


## Functions
### constructor

Constructor of the timelock


```solidity
constructor(
    uint256 minDelay,
    address[] memory proposers,
    address[] memory executors,
    address admin,
    IEmergencyManager _agglayerManager
) TimelockController(minDelay, proposers, executors, admin);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`minDelay`|`uint256`|initial minimum delay for operations|
|`proposers`|`address[]`|accounts to be granted proposer and canceller roles|
|`executors`|`address[]`|accounts to be granted executor role|
|`admin`|`address`|optional account to be granted admin role; disable with zero address|
|`_agglayerManager`|`IEmergencyManager`|AgglayerManager address|


### getMinDelay

Returns the minimum delay for an operation to become valid.
This value can be changed by executing an operation that calls `updateDelay`.
If the Agglayer system is in emergency state, the minDelay will be 0 instead.


```solidity
function getMinDelay() public view override returns (uint256 duration);
```

