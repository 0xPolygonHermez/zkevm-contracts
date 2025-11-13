# IBridgeL2SovereignChainsPessimistic
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/previousVersions/pessimistic/IBridgeL2SovereignChainsPessimistic.sol)

**Inherits:**
[IPolygonZkEVMBridgeV2Pessimistic](/contracts/v2/previousVersions/pessimistic/IPolygonZkEVMBridgeV2Pessimistic.sol/interface.IPolygonZkEVMBridgeV2Pessimistic.md)


## Functions
### initialize


```solidity
function initialize(
    uint32 _networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
    address _polygonRollupManager,
    bytes memory _gasTokenMetadata,
    address _bridgeManager,
    address sovereignWETHAddress,
    bool _sovereignWETHAddressIsNotMintable
) external;
```

## Errors
### InvalidZeroAddress
*Thrown when try to set a zero address to a non valid zero address field*


```solidity
error InvalidZeroAddress();
```

### OriginNetworkInvalid
*Thrown when the origin network is invalid*


```solidity
error OriginNetworkInvalid();
```

### OnlyBridgeManager
Bridge manager can set custom mapping for any token

*Thrown when sender is not the bridge manager*


```solidity
error OnlyBridgeManager();
```

### TokenNotMapped
*Thrown when trying to remove a token mapping that has not been updated by a new one*


```solidity
error TokenNotMapped();
```

### TokenAlreadyUpdated
*Thrown when trying to migrate a legacy token that is already the current token*


```solidity
error TokenAlreadyUpdated();
```

### InvalidSovereignWETHAddressParams
*Thrown when initializing sovereign bridge with invalid sovereign WETH token params*


```solidity
error InvalidSovereignWETHAddressParams();
```

### InvalidInitializeFunction
*Thrown when trying to initialize the incorrect initialize function*


```solidity
error InvalidInitializeFunction();
```

### InputArraysLengthMismatch
*Thrown when initializing calling a function with invalid arrays length*


```solidity
error InputArraysLengthMismatch();
```

### TokenAlreadyMapped
*Thrown when trying to map a token that is already mapped*


```solidity
error TokenAlreadyMapped();
```

### TokenNotRemapped
*Thrown when trying to remove a legacy mapped token that has nor previously been remapped*


```solidity
error TokenNotRemapped();
```

### WETHRemappingNotSupportedOnGasTokenNetworks
*Thrown when trying to set a custom wrapper for weth on a gas token network*


```solidity
error WETHRemappingNotSupportedOnGasTokenNetworks();
```

### ClaimNotSet
*Thrown when trying to unset a not setted claim*


```solidity
error ClaimNotSet();
```

### EmergencyStateNotAllowed
*Thrown when trying to activate emergency state in a not allowed bridge context (e.g. sovereign chains)*


```solidity
error EmergencyStateNotAllowed();
```

