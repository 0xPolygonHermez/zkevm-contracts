# IAgglayerGatewayErrors
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IAgglayerGateway.sol)

Extended error events from https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol


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

### InvalidInitializer
Thrown when trying to call a function with an invalid initializer version


```solidity
error InvalidInitializer();
```

### InvalidProofBytesLength
Thrown when the input proof bytes are invalid.


```solidity
error InvalidProofBytesLength();
```

### AggchainSignersHashNotInitialized
Thrown when the aggchain signers hash has not been initialized


```solidity
error AggchainSignersHashNotInitialized();
```

### IndicesNotInDescendingOrder
Thrown when indices for signer removal are not in descending order


```solidity
error IndicesNotInDescendingOrder();
```

### AggchainSignersTooHigh
Thrown when trying to set more than 255 signers


```solidity
error AggchainSignersTooHigh();
```

### InvalidThreshold
Thrown when the threshold exceeds the number of signers


```solidity
error InvalidThreshold();
```

### SignerCannotBeZero
Thrown when trying to add a zero address as signer


```solidity
error SignerCannotBeZero();
```

### SignerURLCannotBeEmpty
Thrown when trying to add a signer with empty URL


```solidity
error SignerURLCannotBeEmpty();
```

### SignerAlreadyExists
Thrown when trying to add a signer that already exists


```solidity
error SignerAlreadyExists();
```

### SignerDoesNotExist
Thrown when trying to remove a signer that doesn't exist


```solidity
error SignerDoesNotExist();
```

