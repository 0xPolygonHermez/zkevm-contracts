# IBridgeL2SovereignChainsV1010
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/previousVersions/10.1.0/IBridgeL2SovereignChainsV1010.sol)

**Inherits:**
[IPolygonZkEVMBridgeV2V1010](/contracts/previousVersions/10.1.0/IPolygonZkEVMBridgeV2V1010.sol/interface.IPolygonZkEVMBridgeV2V1010.md)


## Functions
### initialize


```solidity
function initialize(
    uint32 _networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    IBaseLegacyAgglayerGER _globalExitRootManager,
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
Thrown when the origin network is invalid


```solidity
error OriginNetworkInvalid();
```

### OnlyBridgeManager
Bridge manager can set custom mapping for any token

Thrown when sender is not the bridge manager


```solidity
error OnlyBridgeManager();
```

### TokenNotMapped
Thrown when trying to remove a token mapping that has not been updated by a new one


```solidity
error TokenNotMapped();
```

### TokenAlreadyUpdated
Thrown when trying to migrate a legacy token that is already the current token


```solidity
error TokenAlreadyUpdated();
```

### InvalidSovereignWETHAddressParams
Thrown when initializing sovereign bridge with invalid sovereign WETH token params


```solidity
error InvalidSovereignWETHAddressParams();
```

### InputArraysLengthMismatch
Thrown when initializing calling a function with invalid arrays length


```solidity
error InputArraysLengthMismatch();
```

### TokenAlreadyMapped
Thrown when trying to map a token that is already mapped


```solidity
error TokenAlreadyMapped();
```

### TokenNotRemapped
Thrown when trying to remove a legacy mapped token that has nor previously been remapped


```solidity
error TokenNotRemapped();
```

### WETHRemappingNotSupportedOnGasTokenNetworks
Thrown when trying to set a custom wrapper for weth on a gas token network


```solidity
error WETHRemappingNotSupportedOnGasTokenNetworks();
```

### ClaimNotSet
Thrown when trying to unset a not setted claim


```solidity
error ClaimNotSet();
```

### EmergencyStateNotAllowed
Thrown when trying to activate emergency state in a not allowed bridge context (e.g. sovereign chains)


```solidity
error EmergencyStateNotAllowed();
```

### InvalidZeroNetworkID
Thrown when trying to initialize a sovereign bridge with a zero network ID, reserved for mainnet


```solidity
error InvalidZeroNetworkID();
```

### InvalidDepositCount
Thrown when an invalid deposit count is provided for LET operations


```solidity
error InvalidDepositCount();
```

### InvalidLeavesLength
Thrown when the leaves array length doesn't match the expected deposit count


```solidity
error InvalidLeavesLength();
```

### InvalidExpectedRoot
Thrown when the expected root doesn't match the computed root


```solidity
error InvalidExpectedRoot();
```

### InvalidSubtreeFrontier
Thrown when the subtree frontier doesn't match the parent tree structure


```solidity
error InvalidSubtreeFrontier();
```

### InvalidLBTLeaf
Thrown when trying set a LFT leaf with same origin network thank chain network ID


```solidity
error InvalidLBTLeaf();
```

### LocalBalanceTreeUnderflow
Thrown when trying to substract more rather than available balance


```solidity
error LocalBalanceTreeUnderflow(
    uint32 originNetwork, address originTokenAddress, uint256 amount, uint256 localBalanceTreeAmount
);
```

### LocalBalanceTreeOverflow
Thrown when trying to add an amount over the maximum allowed balance


```solidity
error LocalBalanceTreeOverflow(
    uint32 originNetwork, address originTokenAddress, uint256 amount, uint256 localBalanceTreeAmount
);
```

### OnlyGlobalExitRootRemover
Thrown when the caller is not the globalExitRootRemover


```solidity
error OnlyGlobalExitRootRemover();
```

### OnlyEmergencyBridgePauser
Thrown when the caller is not the emergencyBridgePauser address


```solidity
error OnlyEmergencyBridgePauser();
```

### OnlyPendingEmergencyBridgePauser
Thrown when trying to call a function that only the pending bridge pauser can call.


```solidity
error OnlyPendingEmergencyBridgePauser();
```

### OnlyEmergencyBridgeUnpauser
Thrown when the caller is not the emergencyBridgeUnpauser address


```solidity
error OnlyEmergencyBridgeUnpauser();
```

### OnlyPendingEmergencyBridgeUnpauser
Thrown when trying to call a function that only pending bridge unpauser can call.


```solidity
error OnlyPendingEmergencyBridgeUnpauser();
```

