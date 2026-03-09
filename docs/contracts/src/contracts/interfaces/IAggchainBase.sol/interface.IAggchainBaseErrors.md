# IAggchainBaseErrors
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IAggchainBase.sol)

**Title:**
IAggchainBaseErrors

Error definitions for AggchainBase implementations


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

### UseDefaultVkeysAlreadyEnabled
Thrown when trying to enable the default vkeys when it is already enabled.


```solidity
error UseDefaultVkeysAlreadyEnabled();
```

### UseDefaultVkeysAlreadyDisabled
Thrown when trying to disable the default vkeys when it is already disabled.


```solidity
error UseDefaultVkeysAlreadyDisabled();
```

### UseDefaultSignersAlreadyEnabled
Thrown when trying to enable the default signers when it is already enabled.


```solidity
error UseDefaultSignersAlreadyEnabled();
```

### UseDefaultSignersAlreadyDisabled
Thrown when trying to disable the default signers when it is already disabled.


```solidity
error UseDefaultSignersAlreadyDisabled();
```

### AggchainVKeyNotFound
Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists.


```solidity
error AggchainVKeyNotFound();
```

### AggchainManagerCannotBeZero
Thrown when trying to set the aggchain manager to zero address.


```solidity
error AggchainManagerCannotBeZero();
```

### AggchainManagerAlreadyInitialized
Thrown when the aggchain manager is already initialized.


```solidity
error AggchainManagerAlreadyInitialized();
```

### InvalidInitAggchainVKey
Thrown when an invalid initial aggchain vkey is provided.


```solidity
error InvalidInitAggchainVKey();
```

### ConflictingDefaultSignersConfiguration
Thrown when trying to use default signers but also providing signers to add


```solidity
error ConflictingDefaultSignersConfiguration();
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

### InvalidThreshold
Thrown when threshold is zero, greater than the number of aggchainSigners.


```solidity
error InvalidThreshold();
```

### SignerAlreadyExists
Thrown when trying to add a signer that already exists.


```solidity
error SignerAlreadyExists();
```

### SignerDoesNotExist
Thrown when trying to remove a signer that doesn't exist.


```solidity
error SignerDoesNotExist();
```

### SignerCannotBeZero
Thrown when trying to add a zero address as a signer.


```solidity
error SignerCannotBeZero();
```

### AggchainSignersTooHigh
Thrown when the aggchainSingers is greater than 255.


```solidity
error AggchainSignersTooHigh();
```

### SignerURLCannotBeEmpty
Thrown when trying to add a signer with an empty URL.


```solidity
error SignerURLCannotBeEmpty();
```

### IndicesNotInDescendingOrder
Thrown when the indices for signer removal are not in descending order.


```solidity
error IndicesNotInDescendingOrder();
```

### AggchainSignersHashNotInitialized
Thrown when trying to compute the aggchain hash without initializing the signers hash.


```solidity
error AggchainSignersHashNotInitialized();
```

### MetadataArrayLengthMismatch
Thrown when the keys and values arrays have different lengths in batch metadata operations.


```solidity
error MetadataArrayLengthMismatch();
```

### OnlyAggchainMetadataManager
Thrown when the caller is not the aggchain metadata manager


```solidity
error OnlyAggchainMetadataManager();
```

