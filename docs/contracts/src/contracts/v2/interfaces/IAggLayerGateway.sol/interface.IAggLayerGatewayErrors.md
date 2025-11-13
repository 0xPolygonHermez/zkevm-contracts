# IAggLayerGatewayErrors
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IAggLayerGateway.sol)

*Extended error events from https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol*


## Errors
### RouteNotFound
Thrown when the verifier route is not found.


```solidity
error RouteNotFound(bytes4 selector);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The verifier selector that was specified.|

### RouteIsFrozen
Thrown when the verifier route is found, but is frozen.


```solidity
error RouteIsFrozen(bytes4 selector);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The verifier selector that was specified.|

### RouteIsAlreadyFrozen
Thrown when trying to freeze a route that is already frozen.


```solidity
error RouteIsAlreadyFrozen(bytes4 selector);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The pessimistic verification key selector that was specified.|

### RouteAlreadyExists
Thrown when adding a verifier route and the selector already contains a route.


```solidity
error RouteAlreadyExists(bytes4 selector, address verifier);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`selector`|`bytes4`|The pessimistic verification key selector that was specified.|
|`verifier`|`address`|The address of the verifier contract in the existing route.|

### PPSelectorCannotBeZero
Thrown when adding a verifier route and the selector returned by the verifier is
zero.


```solidity
error PPSelectorCannotBeZero();
```

### VKeyCannotBeZero
Thrown when adding a verifier key with value zero


```solidity
error VKeyCannotBeZero();
```

### OnlyAggLayerAdmin
Thrown when the caller is not the AggLayerAdmin


```solidity
error OnlyAggLayerAdmin();
```

### OnlyPendingAggLayerAdmin

```solidity
error OnlyPendingAggLayerAdmin();
```

### AggchainVKeyAlreadyExists
Thrown when trying to add an aggchain verification key that already exists


```solidity
error AggchainVKeyAlreadyExists();
```

### AggchainVKeyNotFound
Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists


```solidity
error AggchainVKeyNotFound();
```

### InvalidZeroAddress
Thrown when trying to call a function with an input zero address


```solidity
error InvalidZeroAddress();
```

### InvalidProofBytesLength
Thrown when the input proof bytes are invalid.


```solidity
error InvalidProofBytesLength();
```

