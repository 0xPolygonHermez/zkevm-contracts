# ExtensionAgglayerBridgeL2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/lib/ExtensionAgglayerBridgeL2.sol)

**Inherits:**
[AgglayerBridgeL2](/contracts/sovereignChains/AgglayerBridgeL2.sol/contract.AgglayerBridgeL2.md), [IInitializerAgglayerBridgeL2](/contracts/interfaces/IInitializerAgglayerBridgeL2.sol/interface.IInitializerAgglayerBridgeL2.md)

**Title:**
ExtensionAgglayerBridgeL2

This contract is used as an extension of AgglayerBridgeL2 via delegatecall to extend bytecode
currently NOT used

This contract inherits from AgglayerBridge to maintain storage layout compatibility

All functions except initialize() are overridden to revert to minimize bytecode size

Storage variables are duplicated from AgglayerBridgeL2 to ensure proper delegatecall behavior

This contract is deployed separately and called via fallback in AgglayerBridgeL2


## State Variables
### deployer
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
address private immutable deployer
```


## Functions
### constructor

Disable initializers on the implementation following the best practices

the deployer is set to the contract creator and will be the only allowed to initialize the contract in a 2 steps process


```solidity
constructor() AgglayerBridgeL2();
```

### initialize

The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
emergency state is not possible for the L2 deployment of the bridge in StateTransition chains, intentionally

initializer function to set the initial values of the contract when the contract is deployed for the first time


```solidity
function initialize(
    uint32 _networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    IBaseLegacyAgglayerGER _globalExitRootManager,
    address _polygonRollupManager,
    bytes memory _gasTokenMetadata,
    address _bridgeManager,
    address _sovereignWETHAddress,
    bool _sovereignWETHAddressIsNotMintable,
    address _emergencyBridgePauser,
    address _emergencyBridgeUnpauser,
    address _proxiedTokensManager
) public override(AgglayerBridgeL2) reinitializer(3);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_networkID`|`uint32`|networkID|
|`_gasTokenAddress`|`address`|gas token address|
|`_gasTokenNetwork`|`uint32`|gas token network|
|`_globalExitRootManager`|`IBaseLegacyAgglayerGER`|global exit root manager address|
|`_polygonRollupManager`|`address`|Rollup manager address|
|`_gasTokenMetadata`|`bytes`|Abi encoded gas token metadata|
|`_bridgeManager`|`address`|bridge manager address|
|`_sovereignWETHAddress`|`address`|sovereign WETH address|
|`_sovereignWETHAddressIsNotMintable`|`bool`|Flag to indicate if the wrapped ETH is not mintable|
|`_emergencyBridgePauser`|`address`|emergency bridge pauser address, allowed to be zero if the chain wants to disable the feature to stop the bridge|
|`_emergencyBridgeUnpauser`|`address`|emergency bridge unpauser address, allowed to be zero if the chain wants to disable the feature to unpause the bridge|
|`_proxiedTokensManager`|`address`|address of the proxied tokens manager|


### bridgeAsset

Override bridgeAsset to revert - not supported in initializer


```solidity
function bridgeAsset(uint32, address, uint256, address, bool, bytes calldata)
    public
    payable
    override(AgglayerBridge, IAgglayerBridge);
```

### bridgeMessage

Override bridgeMessage to revert - not supported in initializer


```solidity
function bridgeMessage(uint32, address, bool, bytes calldata)
    external
    payable
    override(AgglayerBridge, IAgglayerBridge);
```

### bridgeMessageWETH

Override bridgeMessageWETH to revert - not supported in initializer


```solidity
function bridgeMessageWETH(uint32, address, uint256, bool, bytes calldata)
    external
    pure
    override(AgglayerBridge, IAgglayerBridge);
```

### claimAsset

Override claimAsset to revert - not supported in initializer


```solidity
function claimAsset(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
    uint256,
    bytes32,
    bytes32,
    uint32,
    address,
    uint32,
    address,
    uint256,
    bytes calldata
) public pure override(AgglayerBridge, IAgglayerBridge);
```

### claimMessage

Override claimMessage to revert - not supported in initializer


```solidity
function claimMessage(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
    uint256,
    bytes32,
    bytes32,
    uint32,
    address,
    uint32,
    address,
    uint256,
    bytes calldata
) external pure override(AgglayerBridge, IAgglayerBridge);
```

### getTokenWrappedAddress

Override getTokenWrappedAddress to revert - not supported in initializer


```solidity
function getTokenWrappedAddress(uint32, address) external pure override(AgglayerBridge) returns (address);
```

### activateEmergencyState

Override activateEmergencyState to revert - not supported in initializer


```solidity
function activateEmergencyState() external pure override(AgglayerBridgeL2);
```

### deactivateEmergencyState

Override deactivateEmergencyState to revert - not supported in initializer


```solidity
function deactivateEmergencyState() external pure override(AgglayerBridgeL2);
```

### transferProxiedTokensManagerRole

Override transferProxiedTokensManagerRole to revert - not supported in initializer


```solidity
function transferProxiedTokensManagerRole(address) external pure override(AgglayerBridge);
```

### acceptProxiedTokensManagerRole

Override acceptProxiedTokensManagerRole to revert - not supported in initializer


```solidity
function acceptProxiedTokensManagerRole() external pure override(AgglayerBridge);
```

### updateGlobalExitRoot

Override updateGlobalExitRoot to revert - not supported in initializer


```solidity
function updateGlobalExitRoot() external pure override(AgglayerBridge, IAgglayerBridge);
```

### isClaimed

Override isClaimed to revert - not supported in initializer


```solidity
function isClaimed(uint32, uint32) public pure override(AgglayerBridgeL2) returns (bool);
```

### getProxiedTokensManager

Override getProxiedTokensManager to revert - not supported in initializer


```solidity
function getProxiedTokensManager() external pure override(AgglayerBridge, IAgglayerBridge) returns (address);
```

### getWrappedTokenBridgeImplementation

Override getWrappedTokenBridgeImplementation to revert - not supported in initializer


```solidity
function getWrappedTokenBridgeImplementation()
    external
    pure
    override(AgglayerBridge, IAgglayerBridge)
    returns (address);
```

### getTokenMetadata

Override getTokenMetadata to revert - not supported in initializer


```solidity
function getTokenMetadata(address) external pure override(AgglayerBridge, IAgglayerBridge) returns (bytes memory);
```

### INIT_BYTECODE_TRANSPARENT_PROXY

Override INIT_BYTECODE_TRANSPARENT_PROXY to revert - not supported in initializer


```solidity
function INIT_BYTECODE_TRANSPARENT_PROXY() public pure override(AgglayerBridge) returns (bytes memory);
```

### computeTokenProxyAddress

Override computeTokenProxyAddress to revert - not supported in initializer


```solidity
function computeTokenProxyAddress(uint32, address) public pure override(AgglayerBridge) returns (address);
```

### version

Override version to revert - not supported in initializer


```solidity
function version() external pure virtual override(AgglayerBridgeL2) returns (string memory);
```

### getLeafValue

Override getLeafValue to revert - not supported in initializer


```solidity
function getLeafValue(uint8, uint32, address, uint32, address, uint256, bytes32)
    internal
    pure
    override(DepositContractV2)
    returns (bytes32);
```

### getRoot

Override getRoot to revert - not supported in initializer


```solidity
function getRoot() public pure override(DepositContractBase) returns (bytes32);
```

### verifyMerkleProof

Override verifyMerkleProof to revert - not supported in initializer


```solidity
function verifyMerkleProof(bytes32, bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata, uint32, bytes32)
    internal
    pure
    override(DepositContractBase)
    returns (bool);
```

### calculateRoot

Override calculateRoot to revert - not supported in initializer


```solidity
function calculateRoot(bytes32, bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata, uint32)
    internal
    pure
    override(DepositContractBase)
    returns (bytes32);
```

### setMultipleSovereignTokenAddress

Override setMultipleSovereignTokenAddress to revert - not supported in initializer


```solidity
function setMultipleSovereignTokenAddress(uint32[] memory, address[] memory, address[] memory, bool[] memory)
    external
    pure
    override(AgglayerBridgeL2);
```

### removeLegacySovereignTokenAddress

Override removeLegacySovereignTokenAddress to revert - not supported in initializer


```solidity
function removeLegacySovereignTokenAddress(address) external pure override(AgglayerBridgeL2);
```

### setSovereignWETHAddress

Override setSovereignWETHAddress to revert - not supported in initializer


```solidity
function setSovereignWETHAddress(address, bool) external pure override(AgglayerBridgeL2);
```

### migrateLegacyToken

Override migrateLegacyToken to revert - not supported in initializer


```solidity
function migrateLegacyToken(address, uint256, bytes calldata) external pure override(AgglayerBridgeL2);
```

### unsetMultipleClaims

Override unsetMultipleClaims to revert - not supported in initializer


```solidity
function unsetMultipleClaims(uint256[] memory) external pure override(AgglayerBridgeL2);
```

### setMultipleClaims

Override setMultipleClaims to revert - not supported in initializer


```solidity
function setMultipleClaims(uint256[] memory) external pure override(AgglayerBridgeL2);
```

### backwardLET

Override backwardLET to revert - not supported in initializer


```solidity
function backwardLET(
    uint256,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
    bytes32,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata
) external pure override(AgglayerBridgeL2);
```

### forwardLET

Override forwardLET to revert - not supported in initializer


```solidity
function forwardLET(AgglayerBridgeL2.LeafData[] calldata, bytes32) external pure override(AgglayerBridgeL2);
```

### forceEmitDetailedClaimEvent

Override forceEmitDetailedClaimEvent to revert - not supported in initializer


```solidity
function forceEmitDetailedClaimEvent(AgglayerBridgeL2.ClaimData[] calldata)
    external
    pure
    override(AgglayerBridgeL2);
```

### setLocalBalanceTree

Override setLocalBalanceTree to revert - not supported in initializer


```solidity
function setLocalBalanceTree(uint32[] memory, address[] memory, uint256[] memory)
    external
    pure
    override(AgglayerBridgeL2);
```

### deployWrappedTokenAndRemap

Override deployWrappedTokenAndRemap to revert - not supported in initializer


```solidity
function deployWrappedTokenAndRemap(uint32, address, bool) external pure override(AgglayerBridgeL2);
```

### setBridgeManager

Override setBridgeManager to revert - not supported in initializer


```solidity
function setBridgeManager(address) external pure override(AgglayerBridgeL2);
```

### transferEmergencyBridgePauserRole

Override transferEmergencyBridgePauserRole to revert - not supported in initializer


```solidity
function transferEmergencyBridgePauserRole(address) external pure override(AgglayerBridgeL2);
```

### acceptEmergencyBridgePauserRole

Override acceptEmergencyBridgePauserRole to revert - not supported in initializer


```solidity
function acceptEmergencyBridgePauserRole() external pure override(AgglayerBridgeL2);
```

### transferEmergencyBridgeUnpauserRole

Override transferEmergencyBridgeUnpauserRole to revert - not supported in initializer


```solidity
function transferEmergencyBridgeUnpauserRole(address) external pure override(AgglayerBridgeL2);
```

### acceptEmergencyBridgeUnpauserRole

Override acceptEmergencyBridgeUnpauserRole to revert - not supported in initializer


```solidity
function acceptEmergencyBridgeUnpauserRole() external pure override(AgglayerBridgeL2);
```

