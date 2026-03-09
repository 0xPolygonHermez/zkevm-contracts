# AgglayerBridgeL2FromEtrog
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/sovereignChains/AgglayerBridgeL2FromEtrog.sol)

**Inherits:**
[AgglayerBridgeL2](/contracts/sovereignChains/AgglayerBridgeL2.sol/contract.AgglayerBridgeL2.md)

**Title:**
AgglayerBridgeL2FromEtrog

Upgrade contract for migrating from the Etrog bridge implementation to AgglayerBridgeL2.
This contract provides a specialized initialization function (`initializeFromEtrog`) that
preserves existing bridge state while setting up new parameters required by AgglayerBridgeL2,
including bridge manager, emergency roles, proxied tokens manager, and Local Balance Tree (LBT) initialization.
The standard `initialize` function is disabled to prevent accidental re-initialization.


## Functions
### initialize

Override the function to prevent the contract from being initialized with this initializer


```solidity
function initialize(
    uint32, // _networkID
    address, // _gasTokenAddress
    uint32, // _gasTokenNetwork
    IBaseLegacyAgglayerGER, // _globalExitRootManager
    address, // _polygonRollupManager
    bytes memory, // _gasTokenMetadata
    address, // _bridgeManager
    address, // _sovereignWETHAddress
    bool, // _sovereignWETHAddressIsNotMintable
    address, // _emergencyBridgePauser
    address, // _emergencyBridgeUnpauser
    address // _proxiedTokensManager
) public virtual override(AgglayerBridgeL2) initializer;
```

### initializeFromEtrog

initializer function to set the initial values when the contract is upgraded from the Etrog version


```solidity
function initializeFromEtrog(
    address _bridgeManager,
    address _emergencyBridgePauser,
    address _emergencyBridgeUnpauser,
    address _proxiedTokensManager,
    address[] memory wrappedTokensAddresses,
    uint128 initNativeSupply
) public virtual getInitializedVersion reinitializer(3);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_bridgeManager`|`address`|bridge manager address|
|`_emergencyBridgePauser`|`address`|emergency bridge pauser address, allowed to be zero if the chain wants to disable the feature to stop the bridge|
|`_emergencyBridgeUnpauser`|`address`|emergency bridge unpauser address, allowed to be zero if the chain wants to disable the feature to unpause the bridge|
|`_proxiedTokensManager`|`address`|address of the proxied tokens manager|
|`wrappedTokensAddresses`|`address[]`|array of wrapped tokens addresses to be included in the LBT|
|`initNativeSupply`|`uint128`|initial native supply used to compute the native token amount when WETHToken is set|


### _initializeLBT

If some tokens are not included (e.g are deployed just before the upgrade of this contract), they will be added later using the `setLocalBalanceTree` function.
This is treated as an edge case and in any case, the bridge will be functional but too much restrictive until correctly initialized.

Initializes the Local Balance Tree (LBT) providing the wrapped tokens amounts


```solidity
function _initializeLBT(address[] memory wrappedTokensAddresses, uint256 initNativeSupply) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`wrappedTokensAddresses`|`address[]`|array of wrapped tokens addresses|
|`initNativeSupply`|`uint256`|initial native supply used to compute the native token amount when WETHToken is set|


## Errors
### ParameterAlreadyInitialized
Thrown when one of the initialization parameters that must be 0 has already been initialized


```solidity
error ParameterAlreadyInitialized();
```

