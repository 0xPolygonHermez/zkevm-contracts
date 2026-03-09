# IAggchainBaseErrorsPrevious
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/previousVersions/aggchain/IAggchainBasePrevious.sol)


## Errors
### ZeroValueAggchainVKey
Thrown when trying to add zero value verification key.


```solidity
error ZeroValueAggchainVKey();
```

### OwnedAggchainVKeyAlreadyAdded
Thrown when trying to add an aggchain verification key that already exists.


```solidity
error OwnedAggchainVKeyAlreadyAdded();
```

### OwnedAggchainVKeyNotFound
Thrown when trying to retrieve an aggchain verification key that does not exist.


```solidity
error OwnedAggchainVKeyNotFound();
```

### InvalidInitializeFunction
Thrown when trying to initialize the incorrect initialize function.


```solidity
error InvalidInitializeFunction();
```

### UseDefaultGatewayAlreadyEnabled
Thrown when trying to enable the default gateway when it is already enabled.


```solidity
error UseDefaultGatewayAlreadyEnabled();
```

### UseDefaultGatewayAlreadyDisabled
Thrown when trying to disable the default gateway when it is already disabled.


```solidity
error UseDefaultGatewayAlreadyDisabled();
```

### OnlyVKeyManager
Thrown when trying to call a function that only the VKeyManager can call.


```solidity
error OnlyVKeyManager();
```

### OnlyPendingVKeyManager
Thrown when trying to call a function that only the pending VKeyManager can call.


```solidity
error OnlyPendingVKeyManager();
```

### AggchainVKeyNotFound
Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists.


```solidity
error AggchainVKeyNotFound();
```

### InvalidAgglayerGatewayAddress
Thrown when trying to deploy the aggchain with a zero address as the AgglayerGateway


```solidity
error InvalidAgglayerGatewayAddress();
```

### AggchainManagerCannotBeZero
Thrown when trying to set the aggchain manager to zero address.


```solidity
error AggchainManagerCannotBeZero();
```

### OnlyAggchainManager
Thrown when the caller is not the aggchain manager


```solidity
error OnlyAggchainManager();
```

### OnlyPendingAggchainManager
Thrown when the caller is not the pending aggchain manager


```solidity
error OnlyPendingAggchainManager();
```

### InvalidZeroAddress
Thrown when trying to call a function with an input zero address


```solidity
error InvalidZeroAddress();
```

### InvalidAggchainDataLength
Thrown when the aggchainData has an invalid format


```solidity
error InvalidAggchainDataLength();
```

### InvalidAggchainType
Thrown when the aggchainvKeySelector contains an invalid aggchain type.


```solidity
error InvalidAggchainType();
```

