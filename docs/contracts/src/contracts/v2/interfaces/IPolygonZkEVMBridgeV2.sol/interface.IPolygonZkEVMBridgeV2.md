# IPolygonZkEVMBridgeV2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IPolygonZkEVMBridgeV2.sol)


## Functions
### wrappedTokenToTokenInfo


```solidity
function wrappedTokenToTokenInfo(address destinationAddress) external view returns (uint32, address);
```

### updateGlobalExitRoot


```solidity
function updateGlobalExitRoot() external;
```

### activateEmergencyState


```solidity
function activateEmergencyState() external;
```

### deactivateEmergencyState


```solidity
function deactivateEmergencyState() external;
```

### bridgeAsset


```solidity
function bridgeAsset(
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    address token,
    bool forceUpdateGlobalExitRoot,
    bytes calldata permitData
) external payable;
```

### bridgeMessage


```solidity
function bridgeMessage(
    uint32 destinationNetwork,
    address destinationAddress,
    bool forceUpdateGlobalExitRoot,
    bytes calldata metadata
) external payable;
```

### bridgeMessageWETH


```solidity
function bridgeMessageWETH(
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amountWETH,
    bool forceUpdateGlobalExitRoot,
    bytes calldata metadata
) external;
```

### claimAsset


```solidity
function claimAsset(
    bytes32[32] calldata smtProofLocalExitRoot,
    bytes32[32] calldata smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes calldata metadata
) external;
```

### claimMessage


```solidity
function claimMessage(
    bytes32[32] calldata smtProofLocalExitRoot,
    bytes32[32] calldata smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes calldata metadata
) external;
```

### initialize


```solidity
function initialize(
    uint32 _networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
    address _polygonRollupManager,
    bytes memory _gasTokenMetadata
) external;
```

### getTokenMetadata


```solidity
function getTokenMetadata(address token) external view returns (bytes memory);
```

### getWrappedTokenBridgeImplementation


```solidity
function getWrappedTokenBridgeImplementation() external view returns (address);
```

### getProxiedTokensManager


```solidity
function getProxiedTokensManager() external view returns (address);
```

## Errors
### DestinationNetworkInvalid
*Thrown when the destination network is invalid*


```solidity
error DestinationNetworkInvalid();
```

### AmountDoesNotMatchMsgValue
*Thrown when the amount does not match msg.value*


```solidity
error AmountDoesNotMatchMsgValue();
```

### MsgValueNotZero
*Thrown when user is bridging tokens and is also sending a value*


```solidity
error MsgValueNotZero();
```

### EtherTransferFailed
*Thrown when the Ether transfer on claimAsset fails*


```solidity
error EtherTransferFailed();
```

### MessageFailed
*Thrown when the message transaction on claimMessage fails*


```solidity
error MessageFailed();
```

### GlobalExitRootInvalid
*Thrown when the global exit root does not exist*


```solidity
error GlobalExitRootInvalid();
```

### InvalidSmtProof
*Thrown when the smt proof does not match*


```solidity
error InvalidSmtProof();
```

### AlreadyClaimed
*Thrown when an index is already claimed*


```solidity
error AlreadyClaimed();
```

### NotValidOwner
*Thrown when the owner of permit does not match the sender*


```solidity
error NotValidOwner();
```

### NotValidSpender
*Thrown when the spender of the permit does not match this contract address*


```solidity
error NotValidSpender();
```

### NotValidAmount
*Thrown when the amount of the permit does not match*


```solidity
error NotValidAmount();
```

### NotValidSignature
*Thrown when the permit data contains an invalid signature*


```solidity
error NotValidSignature();
```

### OnlyRollupManager
*Thrown when sender is not the rollup manager*


```solidity
error OnlyRollupManager();
```

### NativeTokenIsEther
*Thrown when the permit data contains an invalid signature*


```solidity
error NativeTokenIsEther();
```

### NoValueInMessagesOnGasTokenNetworks
*Thrown when the permit data contains an invalid signature*


```solidity
error NoValueInMessagesOnGasTokenNetworks();
```

### GasTokenNetworkMustBeZeroOnEther
*Thrown when the permit data contains an invalid signature*


```solidity
error GasTokenNetworkMustBeZeroOnEther();
```

### FailedProxyDeployment
*Thrown when the wrapped token proxy deployment fails*


```solidity
error FailedProxyDeployment();
```

### InvalidZeroAddress
*Thrown when try to set a zero address to a non valid zero address field*


```solidity
error InvalidZeroAddress();
```

### OnlyProxiedTokensManager
*Thrown when sender is not the proxied tokens manager*


```solidity
error OnlyProxiedTokensManager();
```

### OnlyPendingProxiedTokensManager
*Thrown when trying to call a function that only the pending ProxiedTokensManager can call.*


```solidity
error OnlyPendingProxiedTokensManager();
```

### BridgeAddressNotAllowed
*Thrown when trying to set bridgeAddress to as proxied tokens manager role.*


```solidity
error BridgeAddressNotAllowed();
```

### InvalidInitializeFunction
*Thrown when trying to initialize the incorrect initialize function*


```solidity
error InvalidInitializeFunction();
```

### InvalidProxyAdmin
*Thrown when failing to retrieve the owner from proxyAdmin*


```solidity
error InvalidProxyAdmin(address proxyAdmin);
```

### InvalidZeroProxyAdminOwner
*Thrown when the owner of a proxyAdmin is zero address*


```solidity
error InvalidZeroProxyAdminOwner(address proxyAdmin);
```

