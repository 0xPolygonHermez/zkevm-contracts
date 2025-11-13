# IAggchainBaseEvents
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IAggchainBase.sol)


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

### EnableUseDefaultGatewayFlag
Emitted when the admin set the flag useDefaultGateway to true.


```solidity
event EnableUseDefaultGatewayFlag();
```

### DisableUseDefaultGatewayFlag
Emitted when the admin set the flag useDefaultGateway to false.


```solidity
event DisableUseDefaultGatewayFlag();
```

### TransferVKeyManagerRole
Emitted when the vKeyManager starts the two-step transfer role setting a new pending vKeyManager.


```solidity
event TransferVKeyManagerRole(address currentVKeyManager, address newPendingVKeyManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentVKeyManager`|`address`|The current vKeyManager.|
|`newPendingVKeyManager`|`address`|The new pending vKeyManager.|

### AcceptVKeyManagerRole
Emitted when the pending vKeyManager accepts the vKeyManager role.


```solidity
event AcceptVKeyManagerRole(address oldVKeyManager, address newVKeyManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldVKeyManager`|`address`|The previous vKeyManager.|
|`newVKeyManager`|`address`|The new vKeyManager.|

### TransferAggchainManagerRole
*Emitted when the aggchainManager starts the two-step transfer role setting a new pending newAggchainManager*


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

