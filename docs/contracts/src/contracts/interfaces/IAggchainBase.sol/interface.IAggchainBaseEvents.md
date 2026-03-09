# IAggchainBaseEvents
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IAggchainBase.sol)

**Title:**
IAggchainBaseEvents

Events emitted by AggchainBase implementations


## Events
### AddAggchainVKey
Emitted when the admin adds an aggchain verification key.


```solidity
event AddAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The selector of the verification key to add.|
|`newAggchainVKey`|`bytes32`|The new aggchain verification key.|

### UpdateAggchainVKey
Emitted when the admin updates the aggchain verification key.


```solidity
event UpdateAggchainVKey(bytes4 selector, bytes32 previousAggchainVKey, bytes32 newAggchainVKey);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The selector of the verification key to update.|
|`previousAggchainVKey`|`bytes32`|The previous aggchain verification key.|
|`newAggchainVKey`|`bytes32`|The new new aggchain verification key.|

### EnableUseDefaultVkeysFlag
Emitted when the admin set the flag useDefaultVkeys to true.


```solidity
event EnableUseDefaultVkeysFlag();
```

### DisableUseDefaultVkeysFlag
Emitted when the admin set the flag useDefaultVkeys to false.


```solidity
event DisableUseDefaultVkeysFlag();
```

### EnableUseDefaultSignersFlag
Emitted when the admin set the flag useDefaultSigners to true.


```solidity
event EnableUseDefaultSignersFlag();
```

### DisableUseDefaultSignersFlag
Emitted when the admin set the flag useDefaultSigners to false.


```solidity
event DisableUseDefaultSignersFlag();
```

### TransferAggchainManagerRole
Emitted when the aggchainManager starts the two-step transfer role setting a new pending newAggchainManager


```solidity
event TransferAggchainManagerRole(address currentAggchainManager, address newPendingAggchainManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentAggchainManager`|`address`|The current pending aggchainManager|
|`newPendingAggchainManager`|`address`|The new pending aggchainManager|

### AcceptAggchainManagerRole
Emitted when the pending aggchainManager accepts the aggchainManager role


```solidity
event AcceptAggchainManagerRole(address oldAggchainManager, address newAggchainManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldAggchainManager`|`address`|The old aggchainManager|
|`newAggchainManager`|`address`|The new aggchainManager|

### AggchainMetadataSet
Emitted when metadata is set or updated.


```solidity
event AggchainMetadataSet(string indexed key, string value);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`key`|`string`|The metadata key.|
|`value`|`string`|The metadata value.|

### SetAggchainMetadataManager
Emitted when the aggchain metadata manager is set.


```solidity
event SetAggchainMetadataManager(address oldAggchainMetadataManager, address newAggchainMetadataManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldAggchainMetadataManager`|`address`|The old aggchain metadata manager.|
|`newAggchainMetadataManager`|`address`|The new aggchain metadata manager.|

