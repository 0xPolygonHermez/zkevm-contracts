# AggchainBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/lib/AggchainBase.sol)

**Inherits:**
[PolygonConsensusBase](/contracts/lib/PolygonConsensusBase.sol/abstract.PolygonConsensusBase.md), [IAggchainBase](/contracts/interfaces/IAggchainBase.sol/interface.IAggchainBase.md), [IVersion](/contracts/interfaces/IVersion.sol/interface.IVersion.md)

**Title:**
AggchainBase

Base contract for aggchain implementations. This contract is imported by other aggchain implementations to reuse the common logic.


## State Variables
### CONSENSUS_TYPE

```solidity
uint32 public constant CONSENSUS_TYPE = 1
```


### MAX_AGGCHAIN_SIGNERS

```solidity
uint256 public constant MAX_AGGCHAIN_SIGNERS = 255
```


### aggLayerGateway

```solidity
IAgglayerGateway public immutable aggLayerGateway
```


### _legacyDataAvailabilityProtocol

```solidity
address private _legacyDataAvailabilityProtocol
```


### _legacyIsSequenceWithDataAvailabilityAllowed

```solidity
bool private _legacyIsSequenceWithDataAvailabilityAllowed
```


### _legacyvKeyManager
**Note:**
oz-renamed-from: vKeyManager


```solidity
address public _legacyvKeyManager
```


### _legacypendingVKeyManager
**Note:**
oz-renamed-from: pendingVKeyManager


```solidity
address public _legacypendingVKeyManager
```


### useDefaultVkeys
**Note:**
oz-renamed-from: useDefaultGateway


```solidity
bool public useDefaultVkeys
```


### useDefaultSigners

```solidity
bool public useDefaultSigners
```


### aggchainManager
Address that manages all the functionalities related to the aggchain


```solidity
address public aggchainManager
```


### pendingAggchainManager
This account will be able to accept the aggchainManager role


```solidity
address public pendingAggchainManager
```


### ownedAggchainVKeys

```solidity
mapping(bytes4 aggchainVKeySelector => bytes32 ownedAggchainVKey) public ownedAggchainVKeys
```


### aggchainSigners
Array of multisig aggchainSigners


```solidity
address[] public aggchainSigners
```


### signerToURLs
Mapping that stores the URL of each signer
It's used as well to check if an address is a signer


```solidity
mapping(address => string) public signerToURLs
```


### threshold
Threshold required for multisig operations


```solidity
uint256 public threshold
```


### aggchainMultisigHash
Hash of the current multisig configuration.

Computed as keccak256(abi.encodePacked(threshold, aggchainSigners))


```solidity
bytes32 public aggchainMultisigHash
```


### aggchainMetadataManager
Address that manages the metadata functionality


```solidity
address public aggchainMetadataManager
```


### aggchainMetadata
Optional mapping to store metadata for the aggchain


```solidity
mapping(string => string) public aggchainMetadata
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.

**Note:**
oz-renamed-from: _gap


```solidity
uint256[44] private __gap
```


## Functions
### onlyAggchainManager

Only allows a function to be callable if the message sender is the aggchain manager


```solidity
modifier onlyAggchainManager() ;
```

### onlyAggchainMetadataManager

Only allows a function to be callable if the message sender is the aggchain metadata manager


```solidity
modifier onlyAggchainMetadataManager() ;
```

### constructor


```solidity
constructor(
    IAgglayerGER _globalExitRootManager,
    IERC20Upgradeable _pol,
    IAgglayerBridge _bridgeAddress,
    AgglayerManager _rollupManager,
    IAgglayerGateway _aggLayerGateway
) PolygonConsensusBase(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IAgglayerGER`|Global exit root manager address.|
|`_pol`|`IERC20Upgradeable`|POL token address.|
|`_bridgeAddress`|`IAgglayerBridge`|Bridge address.|
|`_rollupManager`|`AgglayerManager`|Rollup manager address.|
|`_aggLayerGateway`|`IAgglayerGateway`|AgglayerGateway address.|


### initAggchainManager

Sets the aggchain manager

Can only be called by the rollup manager during initialization


```solidity
function initAggchainManager(address newAggchainManager) external onlyRollupManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAggchainManager`|`address`|The address of the new aggchain manager|


### _initializeAggchainBaseAndConsensusBase

Initializer AggchainBase storage

If a wrapped token of the bridge is used, the original network and address of this wrapped are used instead


```solidity
function _initializeAggchainBaseAndConsensusBase(
    address _admin,
    address sequencer,
    address _gasTokenAddress,
    string memory sequencerURL,
    string memory _networkName,
    bool _useDefaultVkeys,
    bool _useDefaultSigners,
    bytes32 _initOwnedAggchainVKey,
    bytes4 _initAggchainVKeySelector
) internal onlyInitializing;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_admin`|`address`|Admin address|
|`sequencer`|`address`|Trusted sequencer address|
|`_gasTokenAddress`|`address`|Indicates the token address in mainnet that will be used as a gas token|
|`sequencerURL`|`string`|Trusted sequencer URL|
|`_networkName`|`string`|L2 network name|
|`_useDefaultVkeys`|`bool`|Flag to use default verification keys from gateway|
|`_useDefaultSigners`|`bool`|Flag to use default signers from gateway|
|`_initOwnedAggchainVKey`|`bytes32`|Initial owned aggchain verification key|
|`_initAggchainVKeySelector`|`bytes4`|Initial aggchain selector|


### _initializeAggchainBase

Initializer AggchainBase storage


```solidity
function _initializeAggchainBase(
    bool _useDefaultVkeys,
    bool _useDefaultSigners,
    bytes32 _initOwnedAggchainVKey,
    bytes4 _initAggchainVKeySelector
) internal onlyInitializing;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_useDefaultVkeys`|`bool`|Flag to use default verification keys from gateway|
|`_useDefaultSigners`|`bool`|Flag to use default signers from gateway|
|`_initOwnedAggchainVKey`|`bytes32`|Initial owned aggchain verification key|
|`_initAggchainVKeySelector`|`bytes4`|Initial aggchain selector|


### initialize

Override the function to prevent the contract from being initialized with the initializer implemented at PolygonConsensusBase.

removing this function can cause critical security issues.


```solidity
function initialize(
    address, // _admin
    address, // sequencer
    uint32, //networkID,
    address, // _gasTokenAddress,
    string memory, // sequencerURL,
    string memory // _networkName
)
    external
    pure
    override(PolygonConsensusBase);
```

### getVKeyAndAggchainParams

Abstract function to extract aggchain parameters and verification key from aggchain data

This function must be implemented by the inheriting contract


```solidity
function getVKeyAndAggchainParams(bytes memory aggchainData) public view virtual returns (bytes32, bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom bytes provided by the chain containing the aggchain data|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|aggchainVKey The extracted aggchain verification key|
|`<none>`|`bytes32`|aggchainParams The extracted aggchain parameters|


### getAggchainHash

Callback while pessimistic proof is being verified from the rollup manager
aggchain_hash:
Field:           | CONSENSUS_TYPE | aggchain_vkey  | aggchain_params  | multisig_hash |
length (bits):   | 32             | 256            | 256              | 256           |

Returns the aggchain hash for a given aggchain data


```solidity
function getAggchainHash(bytes memory aggchainData) external view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom bytes provided by the chain containing the aggchain data|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|aggchainHash resulting aggchain hash|


### updateSignersAndThreshold

Updates signers and threshold for multisig operations

External wrapper for _updateSignersAndThreshold, restricted to aggchainManager


```solidity
function updateSignersAndThreshold(
    RemoveSignerInfo[] memory _signersToRemove,
    SignerInfo[] memory _signersToAdd,
    uint256 _newThreshold
) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_signersToRemove`|`RemoveSignerInfo[]`|Array of signers to remove with their indices|
|`_signersToAdd`|`SignerInfo[]`|Array of new signers to add with their URLs|
|`_newThreshold`|`uint256`|New threshold value for multisig operations|


### _updateSignersAndThreshold

Batch update signers and threshold in a single transaction

Removes signers first (in descending index order), then adds new signers, then updates threshold


```solidity
function _updateSignersAndThreshold(
    RemoveSignerInfo[] memory _signersToRemove,
    SignerInfo[] memory _signersToAdd,
    uint256 _newThreshold
) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_signersToRemove`|`RemoveSignerInfo[]`|Array of signers to remove with their indices (MUST be in descending index order)|
|`_signersToAdd`|`SignerInfo[]`|Array of new signers to add with their URLs|
|`_newThreshold`|`uint256`|New threshold value|


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

Can only be called by the pending aggchainManager


```solidity
function acceptAggchainManagerRole() external;
```

### setAggchainMetadataManager

Sets the aggchain metadata manager

Can only be called by the aggchain manager


```solidity
function setAggchainMetadataManager(address newAggchainMetadataManager) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAggchainMetadataManager`|`address`|Address of the new aggchain metadata manager|


### enableUseDefaultVkeysFlag

Enable the use of default verification keys from gateway


```solidity
function enableUseDefaultVkeysFlag() external virtual onlyAggchainManager;
```

### disableUseDefaultVkeysFlag

Disable the use of default verification keys from gateway


```solidity
function disableUseDefaultVkeysFlag() external virtual onlyAggchainManager;
```

### enableUseDefaultSignersFlag

Enable the use of default signers from gateway


```solidity
function enableUseDefaultSignersFlag() external onlyAggchainManager;
```

### disableUseDefaultSignersFlag

Disable the use of default signers from gateway


```solidity
function disableUseDefaultSignersFlag() external onlyAggchainManager;
```

### addOwnedAggchainVKey

Add a new aggchain verification key to the aggchain contract.


```solidity
function addOwnedAggchainVKey(bytes4 aggchainVKeySelector, bytes32 newAggchainVKey)
    external
    virtual
    onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The selector for the verification key query. This selector identifies the aggchain key|
|`newAggchainVKey`|`bytes32`|The new aggchain verification key to be added.|


### updateOwnedAggchainVKey

Update the aggchain verification key in the aggchain contract.


```solidity
function updateOwnedAggchainVKey(bytes4 aggchainVKeySelector, bytes32 updatedAggchainVKey)
    external
    virtual
    onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The selector for the verification key query. This selector identifies the aggchain key|
|`updatedAggchainVKey`|`bytes32`|The updated aggchain verification key value.|


### setAggchainMetadata

Sets or updates metadata for the aggchain.

Can only be called by the aggchain metadata manager. Empty values are allowed to clear metadata.


```solidity
function setAggchainMetadata(string calldata key, string calldata value) external onlyAggchainMetadataManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`key`|`string`|The metadata key to set.|
|`value`|`string`|The metadata value to set.|


### batchSetAggchainMetadata

Sets or updates multiple metadata entries in a single transaction.

Can only be called by the aggchain metadata manager.


```solidity
function batchSetAggchainMetadata(string[] calldata keys, string[] calldata values)
    external
    onlyAggchainMetadataManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`keys`|`string[]`|Array of metadata keys to set.|
|`values`|`string[]`|Array of metadata values to set (must be same length as keys).|


### getAggchainVKey

returns the current aggchain verification key. If the flag `useDefaultVkeys` is set to true, the gateway verification key is returned, else, the custom chain verification key is returned.


```solidity
function getAggchainVKey(bytes4 aggchainVKeySelector) public view virtual returns (bytes32 aggchainVKey);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The selector for the verification key query. This selector identifies the aggchain type + sp1 verifier version|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKey`|`bytes32`|The verification key for the specified selector|


### getAggchainVKeySelector

Computes the selector for the aggchain verification key from the aggchain type and the aggchainVKeyVersion.

It joins two bytes2 values into a bytes4 value.


```solidity
function getAggchainVKeySelector(bytes2 aggchainVKeyVersion, bytes2 aggchainType) public pure returns (bytes4);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeyVersion`|`bytes2`|The aggchain verification key version, used to identify the aggchain verification key.|
|`aggchainType`|`bytes2`|The aggchain type, hardcoded in the aggchain contract.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes4`|getAggchainVKeySelector computed bytes4 selector combining version and type [            aggchainVKeySelector         ] [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ] [        2 bytes         |    2 bytes     ]|


### getAggchainTypeFromSelector

Computes the aggchainType from the aggchainVKeySelector.


```solidity
function getAggchainTypeFromSelector(bytes4 aggchainVKeySelector) public pure returns (bytes2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The aggchain verification key selector.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes2`|AGGCHAIN_TYPE extracted aggchain type (last 2 bytes) [            aggchainVKeySelector         ] [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ] [        2 bytes         |    2 bytes     ]|


### getAggchainVKeyVersionFromSelector

Computes the aggchainVKeyVersion from the aggchainVKeySelector.


```solidity
function getAggchainVKeyVersionFromSelector(bytes4 aggchainVKeySelector) public pure returns (bytes2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKeySelector`|`bytes4`|The aggchain verification key selector.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes2`|aggchainVKeyVersion extracted aggchain verification key version (first 2 bytes) [            aggchainVKeySelector         ] [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ] [        2 bytes         |    2 bytes     ]|


### getThreshold

Get the threshold for the multisig


```solidity
function getThreshold() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|threshold for the multisig|


### isSigner

Check if an address is a signer


```solidity
function isSigner(address _signer) public view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_signer`|`address`|Address to check|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|True if the address is a signer|


### getAggchainSignersCount

Get the number of aggchainSigners


```solidity
function getAggchainSignersCount() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Number of aggchainSigners in the multisig|


### getAggchainSigners

Get all aggchainSigners


```solidity
function getAggchainSigners() external view returns (address[] memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address[]`|Array of signer addresses|


### getAggchainMultisigHash

Get the aggchain signers hash


```solidity
function getAggchainMultisigHash() public view returns (bytes32);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The aggchain signers hash|


### getAggchainSignerInfos

Get all aggchainSigners with their URLs


```solidity
function getAggchainSignerInfos() external view returns (SignerInfo[] memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`SignerInfo[]`|Array of SignerInfo structs containing signer addresses and URLs|


### _addSignerInternal

Internal function to add a signer with validation

Validates that signer is not zero address, URL is not empty, and signer doesn't already exist


```solidity
function _addSignerInternal(address _signer, string memory url) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_signer`|`address`|Address of the signer to add|
|`url`|`string`|URL associated with the signer|


### _removeSignerInternal

Internal function to remove a signer with validation

Validates index bounds and that the signer at the index matches the provided address


```solidity
function _removeSignerInternal(address _signer, uint256 _signerIndex) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_signer`|`address`|Address of the signer to remove|
|`_signerIndex`|`uint256`|Index of the signer in the aggchainSigners array|


### _updateAggchainMultisigHash

Update the hash of the aggchainSigners array

Combines threshold and signers array into a single hash for efficient verification


```solidity
function _updateAggchainMultisigHash() internal;
```

### _setAggchainMetadataInternal

Internal function to set or update metadata for the aggchain

Empty values are allowed to clear metadata


```solidity
function _setAggchainMetadataInternal(string memory key, string memory value) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`key`|`string`|The metadata key to set|
|`value`|`string`|The metadata value to set|


### _validateVKeysConsistency

Internal function to validate VKeys consistency


```solidity
function _validateVKeysConsistency(
    bool _useDefaultVkeys,
    bytes4 _initAggchainVKeySelector,
    bytes32 _initOwnedAggchainVKey,
    bytes2 aggchainType
) internal pure;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_useDefaultVkeys`|`bool`|Whether to use default verification keys|
|`_initAggchainVKeySelector`|`bytes4`|The aggchain verification key selector|
|`_initOwnedAggchainVKey`|`bytes32`|The owned aggchain verification key|
|`aggchainType`|`bytes2`|The expected aggchain type|


