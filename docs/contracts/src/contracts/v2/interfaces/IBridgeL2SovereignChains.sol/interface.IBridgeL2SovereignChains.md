# IBridgeL2SovereignChains
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IBridgeL2SovereignChains.sol)

**Inherits:**
[IPolygonZkEVMBridgeV2](/contracts/v2/interfaces/IPolygonZkEVMBridgeV2.sol/interface.IPolygonZkEVMBridgeV2.md)


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
    bool _sovereignWETHAddressIsNotMintable,
    address _emergencyBridgePauser,
    address _emergencyBridgeUnpauser,
    address _proxiedTokensManager
) external;
```

## Errors
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

### InvalidZeroNetworkID
*Thrown when trying to initialize a sovereign bridge with a zero network ID, reserved for mainnet*


```solidity
error InvalidZeroNetworkID();
```

### LocalBalanceTreeUnderflow
*Thrown when trying to substract more rather than available balance*


```solidity
error LocalBalanceTreeUnderflow(
    uint32 originNetwork, address originTokenAddress, uint256 amount, uint256 localBalanceTreeAmount
);
```

### LocalBalanceTreeOverflow
*Thrown when trying to add an amount over the maximum allowed balance*


```solidity
error LocalBalanceTreeOverflow(
    uint32 originNetwork, address originTokenAddress, uint256 amount, uint256 localBalanceTreeAmount
);
```

### OnlyGlobalExitRootRemover
*Thrown when the caller is not the globalExitRootRemover*


```solidity
error OnlyGlobalExitRootRemover();
```

### OnlyEmergencyBridgePauser
*Thrown when the caller is not the emergencyBridgePauser address*


```solidity
error OnlyEmergencyBridgePauser();
```

### OnlyPendingEmergencyBridgePauser
*Thrown when trying to call a function that only the pending bridge pauser can call.*


```solidity
error OnlyPendingEmergencyBridgePauser();
```

### OnlyEmergencyBridgeUnpauser
*Thrown when the caller is not the emergencyBridgeUnpauser address*


```solidity
error OnlyEmergencyBridgeUnpauser();
```

### OnlyPendingEmergencyBridgeUnpauser
*Thrown when trying to call a function that only pending bridge unpauser can call.*


```solidity
error OnlyPendingEmergencyBridgeUnpauser();
```

