# AggchainBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/lib/AggchainBase.sol)

**Inherits:**
[PolygonConsensusBase](/contracts/v2/lib/PolygonConsensusBase.sol/abstract.PolygonConsensusBase.md), [IAggchainBase](/contracts/v2/interfaces/IAggchainBase.sol/interface.IAggchainBase.md)

Base contract for aggchain implementations. This contract is imported by other aggchain implementations to reuse the common logic.


## State Variables
### CONSENSUS_TYPE

```solidity
uint32 public constant CONSENSUS_TYPE = 1;
```


### aggLayerGateway

```solidity
IAggLayerGateway public immutable aggLayerGateway;
```


### _legacyDataAvailabilityProtocol

```solidity
address private _legacyDataAvailabilityProtocol;
```


### _legacyIsSequenceWithDataAvailabilityAllowed

```solidity
bool private _legacyIsSequenceWithDataAvailabilityAllowed;
```


### vKeyManager

```solidity
address public vKeyManager;
```


### pendingVKeyManager

```solidity
address public pendingVKeyManager;
```


### useDefaultGateway

```solidity
bool public useDefaultGateway;
```


### aggchainManager
Address that manages all the functionalities related to the aggchain


```solidity
address public aggchainManager;
```


### pendingAggchainManager
This account will be able to accept the aggchainManager role


```solidity
address public pendingAggchainManager;
```


### ownedAggchainVKeys

```solidity
mapping(bytes4 aggchainVKeySelector => bytes32 ownedAggchainVKey) public ownedAggchainVKeys;
```


### __gap
*This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.*

**Note:**
oz-renamed-from: _gap


```solidity
uint256[50] private __gap;
```


## Functions
### onlyVKeyManager


```solidity
modifier onlyVKeyManager();
```

### onlyAggchainManager

*Only allows a function to be callable if the message sender is the aggchain manager*


```solidity
modifier onlyAggchainManager();
```

### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridgeV2 _bridgeAddress,
    PolygonRollupManager _rollupManager,
    IAggLayerGateway _aggLayerGateway
) PolygonConsensusBase(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address.|
|`_pol`|`IERC20Upgradeable`|POL token address.|
|`_bridgeAddress`|`IPolygonZkEVMBridgeV2`|Bridge address.|
|`_rollupManager`|`PolygonRollupManager`|Rollup manager address.|
|`_aggLayerGateway`|`IAggLayerGateway`|AggLayerGateway address.|


### initAggchainManager

Sets the aggchain manager.


```solidity
function initAggchainManager(address newAggchainManager) external onlyRollupManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAggchainManager`|`address`|The address of the new aggchain manager.|


### _initializeAggchainBaseAndConsensusBase

Initializer AggchainBase storage


```solidity
function _initializeAggchainBaseAndConsensusBase(
    address _admin,
    address sequencer,
    address _gasTokenAddress,
    string memory sequencerURL,
    string memory _networkName,
    bool _useDefaultGateway,
    bytes32 _initOwnedAggchainVKey,
    bytes4 _initAggchainVKeySelector,
    address _vKeyManager
) internal onlyInitializing;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_admin`|`address`|Admin address|
|`sequencer`|`address`|Trusted sequencer address|
|`_gasTokenAddress`|`address`|Indicates the token address in mainnet that will be used as a gas token Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead|
|`sequencerURL`|`string`|Trusted sequencer URL|
|`_networkName`|`string`|L2 network name|
|`_useDefaultGateway`|`bool`|Flag to setup initial values for the default gateway|
|`_initOwnedAggchainVKey`|`bytes32`|Initial owned aggchain verification key|
|`_initAggchainVKeySelector`|`bytes4`|Initial aggchain selector|
|`_vKeyManager`|`address`|Initial vKeyManager|


### _initializeAggchainBase

Initializer AggchainBase storage


```solidity
function _initializeAggchainBase(
    bool _useDefaultGateway,
    bytes32 _initOwnedAggchainVKey,
    bytes4 _initAggchainVKeySelector,
    address _vKeyManager
) internal onlyInitializing;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_useDefaultGateway`|`bool`|Flag to setup initial values for the default gateway|
|`_initOwnedAggchainVKey`|`bytes32`|Initial owned aggchain verification key|
|`_initAggchainVKeySelector`|`bytes4`|Initial aggchain selector|
|`_vKeyManager`|`address`|Initial vKeyManager|


### initialize

Override the function to prevent the contract from being initialized with the initializer implemented at PolygonConsensusBase.

*removing this function can cause critical security issues.*


```solidity
function initialize(address, address, uint32, address, string memory, string memory)
    external
    pure
    override(PolygonConsensusBase);
```

### transferAggchainManagerRole

Starts the aggchainManager role transfer
This is a two step process, the pending aggchainManager must accept to finalize the process


```solidity
function transferAggchainManagerRole(address newAggchainManager) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAggchainManager`|`address`|Address of the new aggchainManager|


### acceptAggchainManagerRole

Allow the current pending aggchainManager to accept the aggchainManager role


```solidity
function acceptAggchainManagerRole() external;
```

### transferVKeyManagerRole

Starts the vKeyManager role transfer
This is a two step process, the pending vKeyManager must accepted to finalize the process


```solidity
function transferVKeyManagerRole(address newVKeyManager) external onlyVKeyManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newVKeyManager`|`address`|Address of the new pending admin|


### acceptVKeyManagerRole

Allow the current pending vKeyManager to accept the vKeyManager role


```solidity
function acceptVKeyManagerRole() external;
```

### enableUseDefaultGatewayFlag

Enable the use of the default gateway to manage the aggchain keys.


```solidity
function enableUseDefaultGatewayFlag() external onlyVKeyManager;
```

### disableUseDefaultGatewayFlag

Disable the use of the default gateway to manage the aggchain keys. After disable, the keys are handled by the aggchain contract.


```solidity
function disableUseDefaultGatewayFlag() external onlyVKeyManager;
```

### addOwnedAggchainVKey

Add a new aggchain verification key to the aggchain contract.


```solidity
function addOwnedAggchainVKey(bytes4 aggchainVKeySelector, bytes32 newAggchainVKey) external onlyVKeyManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The selector for the verification key query. This selector identifies the aggchain key|
|`newAggchainVKey`|`bytes32`|The new aggchain verification key to be added.|


### updateOwnedAggchainVKey

Update the aggchain verification key in the aggchain contract.


```solidity
function updateOwnedAggchainVKey(bytes4 aggchainVKeySelector, bytes32 updatedAggchainVKey) external onlyVKeyManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The selector for the verification key query. This selector identifies the aggchain key|
|`updatedAggchainVKey`|`bytes32`|The updated aggchain verification key value.|


### getAggchainVKey

returns the current aggchain verification key. If the flag `useDefaultGateway` is set to true, the gateway verification key is returned, else, the custom chain verification key is returned.


```solidity
function getAggchainVKey(bytes4 aggchainVKeySelector) public view returns (bytes32 aggchainVKey);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The selector for the verification key query. This selector identifies the aggchain type + sp1 verifier version|


### getAggchainVKeySelector

Computes the selector for the aggchain verification key from the aggchain type and the aggchainVKeyVersion.

*It joins two bytes2 values into a bytes4 value.*


```solidity
function getAggchainVKeySelector(bytes2 aggchainVKeyVersion, bytes2 aggchainType) public pure returns (bytes4);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeyVersion`|`bytes2`|The aggchain verification key version, used to identify the aggchain verification key.|
|`aggchainType`|`bytes2`|The aggchain type, hardcoded in the aggchain contract. [            aggchainVKeySelector         ] [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ] [        2 bytes         |    2 bytes     ]|


### getAggchainTypeFromSelector

Computes the aggchainType from the aggchainVKeySelector.


```solidity
function getAggchainTypeFromSelector(bytes4 aggchainVKeySelector) public pure returns (bytes2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The aggchain verification key selector. [            aggchainVKeySelector         ] [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ] [        2 bytes         |    2 bytes     ]|


### getAggchainVKeyVersionFromSelector

Computes the aggchainVKeyVersion from the aggchainVKeySelector.


```solidity
function getAggchainVKeyVersionFromSelector(bytes4 aggchainVKeySelector) public pure returns (bytes2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The aggchain verification key selector. [            aggchainVKeySelector         ] [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ] [        2 bytes         |    2 bytes     ]|


