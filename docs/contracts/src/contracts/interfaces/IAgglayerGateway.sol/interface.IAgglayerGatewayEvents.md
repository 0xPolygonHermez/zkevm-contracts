# IAgglayerGatewayEvents
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IAgglayerGateway.sol)


## Events
### RouteAdded
Emitted when a verifier route is added.


```solidity
event RouteAdded(bytes4 selector, address verifier, bytes32 pessimisticVKey);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The verifier selector that was added.|
|`verifier`|`address`|The address of the verifier contract.|
|`pessimisticVKey`|`bytes32`|The verification key|

### RouteFrozen
Emitted when a verifier route is frozen.


```solidity
event RouteFrozen(bytes4 selector, address verifier, bytes32 pessimisticVKey);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The verifier selector that was frozen.|
|`verifier`|`address`|The address of the verifier contract.|
|`pessimisticVKey`|`bytes32`||

### AddDefaultAggchainVKey
Emitted when a new default aggchain verification key is added


```solidity
event AddDefaultAggchainVKey(bytes4 selector, bytes32 newVKey);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The 4 bytes selector of the added default aggchain verification key.|
|`newVKey`|`bytes32`|New aggchain verification key to be added|

### UpdateDefaultAggchainVKey
Emitted when a default aggchain verification key is update


```solidity
event UpdateDefaultAggchainVKey(bytes4 selector, bytes32 previousVKey, bytes32 newVKey);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The 4 bytes selector of the updated default aggchain verification key.|
|`previousVKey`|`bytes32`|Aggchain verification key previous value|
|`newVKey`|`bytes32`|Aggchain verification key updated value|

### UnsetDefaultAggchainVKey
Emitted when a default aggchain verification key is set to zero


```solidity
event UnsetDefaultAggchainVKey(bytes4 selector);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The 4 bytes selector of the updated default aggchain verification key.|

