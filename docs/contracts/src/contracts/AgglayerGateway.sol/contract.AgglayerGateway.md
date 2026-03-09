# AgglayerGateway
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/AgglayerGateway.sol)

**Inherits:**
Initializable, AccessControlUpgradeable, [IAgglayerGateway](/contracts/interfaces/IAgglayerGateway.sol/interface.IAgglayerGateway.md), [IVersion](/contracts/interfaces/IVersion.sol/interface.IVersion.md)

**Title:**
AgglayerGateway

Contract to handle the verification keys for the pessimistic proof.
It supports adding and freezing PP verification keys and verifying the PP.
Also maintains the default verification keys of aggchains


## State Variables
### AGGCHAIN_DEFAULT_VKEY_ROLE

```solidity
bytes32 internal constant AGGCHAIN_DEFAULT_VKEY_ROLE = keccak256("AGGCHAIN_DEFAULT_VKEY_ROLE")
```


### AL_ADD_PP_ROUTE_ROLE

```solidity
bytes32 internal constant AL_ADD_PP_ROUTE_ROLE = keccak256("AL_ADD_PP_ROUTE_ROLE")
```


### AL_FREEZE_PP_ROUTE_ROLE

```solidity
bytes32 internal constant AL_FREEZE_PP_ROUTE_ROLE = keccak256("AL_FREEZE_PP_ROUTE_ROLE")
```


### AL_MULTISIG_ROLE

```solidity
bytes32 internal constant AL_MULTISIG_ROLE = keccak256("AL_MULTISIG_ROLE")
```


### AGGLAYER_GATEWAY_VERSION

```solidity
string public constant AGGLAYER_GATEWAY_VERSION = "v1.1.0"
```


### MAX_AGGCHAIN_SIGNERS

```solidity
uint256 public constant MAX_AGGCHAIN_SIGNERS = 255
```


### _initializerVersion
Value to detect if the contract has been initialized previously.


```solidity
uint64 private transient _initializerVersion
```


### defaultAggchainVKeys

```solidity
mapping(bytes4 defaultAggchainSelector => bytes32 defaultAggchainVKey) public defaultAggchainVKeys
```


### pessimisticVKeyRoutes

```solidity
mapping(bytes4 pessimisticVKeySelector => AggLayerVerifierRoute) public pessimisticVKeyRoutes
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
uint256 internal threshold
```


### aggchainMultisigHash
Hash of the current aggchainSigners array


```solidity
bytes32 public aggchainMultisigHash
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.
Updated to account for new multisig storage variables (4 slots used)


```solidity
uint256[46] private __gap
```


## Functions
### constructor

Disable initializers on the implementation following the best practices.


```solidity
constructor() ;
```

### getInitializedVersion

Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.


```solidity
modifier getInitializedVersion() ;
```

### initialize

Initializer function to set up the AgglayerGateway contract.

This address is the highest privileged address so it's recommended to use a timelock


```solidity
function initialize(
    address defaultAdmin,
    address aggchainDefaultVKeyRole,
    address addRouteRole,
    address freezeRouteRole,
    bytes4 pessimisticVKeySelector,
    address verifier,
    bytes32 pessimisticVKey,
    address multisigRole,
    SignerInfo[] memory signersToAdd,
    uint256 newThreshold
) external getInitializedVersion reinitializer(2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`defaultAdmin`|`address`|The address of the default admin. Can grant role to addresses.|
|`aggchainDefaultVKeyRole`|`address`|The address that can manage the aggchain verification keys.|
|`addRouteRole`|`address`|The address that can add a route to a pessimistic verification key.|
|`freezeRouteRole`|`address`|The address that can freeze a route to a pessimistic verification key.|
|`pessimisticVKeySelector`|`bytes4`|The 4 bytes selector to add to the pessimistic verification keys.|
|`verifier`|`address`|The address of the verifier contract.|
|`pessimisticVKey`|`bytes32`|New pessimistic program verification key.|
|`multisigRole`|`address`|The address that can manage multisig signers and threshold.|
|`signersToAdd`|`SignerInfo[]`|Array of signers to add with their URLs|
|`newThreshold`|`uint256`|New threshold value|


### initialize

Upgrade initializer to add multisig functionality to existing deployment.


```solidity
function initialize(address multisigRole, SignerInfo[] memory signersToAdd, uint256 newThreshold)
    external
    getInitializedVersion
    reinitializer(2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`multisigRole`|`address`|The address of the multisig role. Can manage multisig signers and threshold.|
|`signersToAdd`|`SignerInfo[]`|Array of signers to add with their URLs|
|`newThreshold`|`uint256`|New threshold value|


### verifyPessimisticProof

Function to verify the pessimistic proof.

First 4 bytes of the pessimistic proof are the pp selector.
proof[0:4]: 4 bytes selector pp
proof[4:8]: 4 bytes selector SP1 verifier
proof[8:]: proof


```solidity
function verifyPessimisticProof(bytes calldata publicValues, bytes calldata proofBytes) external view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`publicValues`|`bytes`|Public values of the proof.|
|`proofBytes`|`bytes`|Proof for the pessimistic verification.|


### _addPessimisticVKeyRoute

Internal function to add a pessimistic verification key route


```solidity
function _addPessimisticVKeyRoute(bytes4 pessimisticVKeySelector, address verifier, bytes32 pessimisticVKey)
    internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pessimisticVKeySelector`|`bytes4`|The 4 bytes selector to add to the pessimistic verification keys.|
|`verifier`|`address`|The address of the verifier contract.|
|`pessimisticVKey`|`bytes32`|New pessimistic program verification key|


### addPessimisticVKeyRoute

Function to add a pessimistic verification key route


```solidity
function addPessimisticVKeyRoute(bytes4 pessimisticVKeySelector, address verifier, bytes32 pessimisticVKey)
    external
    onlyRole(AL_ADD_PP_ROUTE_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pessimisticVKeySelector`|`bytes4`|The 4 bytes selector to add to the pessimistic verification keys.|
|`verifier`|`address`|The address of the verifier contract.|
|`pessimisticVKey`|`bytes32`|New pessimistic program verification key|


### freezePessimisticVKeyRoute

Function to freeze a pessimistic verification key route


```solidity
function freezePessimisticVKeyRoute(bytes4 pessimisticVKeySelector) external onlyRole(AL_FREEZE_PP_ROUTE_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pessimisticVKeySelector`|`bytes4`|The 4 bytes selector to freeze the pessimistic verification key route.|


### addDefaultAggchainVKey

Function to add an aggchain verification key

First 2 bytes of the selector  are the 'verification key identifier', the last 2 bytes are the aggchain type (ex: FEP, ECDSA)


```solidity
function addDefaultAggchainVKey(bytes4 defaultAggchainSelector, bytes32 newAggchainVKey)
    external
    onlyRole(AGGCHAIN_DEFAULT_VKEY_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`defaultAggchainSelector`|`bytes4`|The 4 bytes selector to add to the default aggchain verification keys.|
|`newAggchainVKey`|`bytes32`|New default aggchain verification key to be added|


### updateDefaultAggchainVKey

Function to update a default aggchain verification key from the mapping


```solidity
function updateDefaultAggchainVKey(bytes4 defaultAggchainSelector, bytes32 newDefaultAggchainVKey)
    external
    onlyRole(AGGCHAIN_DEFAULT_VKEY_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`defaultAggchainSelector`|`bytes4`|The 4 bytes selector to update the default aggchain verification keys.|
|`newDefaultAggchainVKey`|`bytes32`|Updated default aggchain verification key value|


### unsetDefaultAggchainVKey

Function to unset a default aggchain verification key from the mapping


```solidity
function unsetDefaultAggchainVKey(bytes4 defaultAggchainSelector) external onlyRole(AGGCHAIN_DEFAULT_VKEY_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`defaultAggchainSelector`|`bytes4`|The 4 bytes selector to update the default aggchain verification keys.|


### getDefaultAggchainVKey

function to retrieve the default aggchain verification key.

First 2 bytes of the selector  are the 'verification key identifier', the last 2 bytes are the aggchain type (ex: FEP, ECDSA)


```solidity
function getDefaultAggchainVKey(bytes4 defaultAggchainSelector) external view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`defaultAggchainSelector`|`bytes4`|The default aggchain selector for the verification key.|


### version

Function to retrieve the current version of the contract.


```solidity
function version() external pure returns (string memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|version of the contract.|


### updateSignersAndThreshold

Updates signers and threshold for multisig operations

Removes signers first (in descending index order), then adds new signers, then updates threshold


```solidity
function updateSignersAndThreshold(
    RemoveSignerInfo[] memory _signersToRemove,
    SignerInfo[] memory _signersToAdd,
    uint256 _newThreshold
) external onlyRole(AL_MULTISIG_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_signersToRemove`|`RemoveSignerInfo[]`|Array of signers to remove with their indices (MUST be in descending index order)|
|`_signersToAdd`|`SignerInfo[]`|Array of new signers to add with their URLs|
|`_newThreshold`|`uint256`|New threshold value|


### _updateSignersAndThreshold

Batch update signers and threshold in a single transaction

Internal function that handles the actual logic


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


### _addSignerInternal

Internal function to add a signer with validation


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

Returns the aggchain signers hash for verification

Used by aggchain contracts to include in their hash computation


```solidity
function getAggchainMultisigHash() external view returns (bytes32);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The current aggchainMultisigHash|


### getAggchainSignerInfos

Get all aggchainSigners with their URLs


```solidity
function getAggchainSignerInfos() external view returns (SignerInfo[] memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`SignerInfo[]`|Array of SignerInfo structs containing signer addresses and URLs|


