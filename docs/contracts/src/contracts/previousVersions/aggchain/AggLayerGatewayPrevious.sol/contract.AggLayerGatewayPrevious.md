# AggLayerGatewayPrevious
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/previousVersions/aggchain/AggLayerGatewayPrevious.sol)

**Inherits:**
Initializable, AccessControlUpgradeable, [IAggLayerGatewayPrevious](/contracts/previousVersions/aggchain/IAggLayerGatewayPrevious.sol/interface.IAggLayerGatewayPrevious.md), [IVersion](/contracts/interfaces/IVersion.sol/interface.IVersion.md)

**Title:**
AggLayerGatewayPrevious

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


### AGGLAYER_GATEWAY_VERSION

```solidity
string public constant AGGLAYER_GATEWAY_VERSION = "v1.0.0"
```


### defaultAggchainVKeys

```solidity
mapping(bytes4 defaultAggchainSelector => bytes32 defaultAggchainVKey) public defaultAggchainVKeys
```


### pessimisticVKeyRoutes

```solidity
mapping(bytes4 pessimisticVKeySelector => AggLayerVerifierRoute) public pessimisticVKeyRoutes
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.


```solidity
uint256[50] private __gap
```


## Functions
### constructor

Disable initializers on the implementation following the best practices.


```solidity
constructor() ;
```

### initialize

Initializer function to set new rollup manager version.

This address is the highest privileged address so it's recommended to use a timelock


```solidity
function initialize(
    address defaultAdmin,
    address aggchainDefaultVKeyRole,
    address addRouteRole,
    address freezeRouteRole,
    bytes4 pessimisticVKeySelector,
    address verifier,
    bytes32 pessimisticVKey
) external initializer;
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

First 2 bytes are the aggchain type, the last 2 bytes are the 'verification key identifier'.


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

