# IAggchainSigners
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IAggchainSigners.sol)

**Title:**
IAggchainSigners

Interface for multisig signer management functionality

This interface is implemented by both AggchainBase contracts and AgglayerGateway,
providing a unified way to manage signers for consensus verification.
Implementations may use local storage or delegate to a gateway contract.


## Functions
### isSigner

Check if an address is a signer


```solidity
function isSigner(address _signer) external view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_signer`|`address`|Address to check|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|True if the address is a signer|


### getThreshold

Get the minimum number of signatures required for consensus

Returns the threshold value for multisig validation


```solidity
function getThreshold() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|threshold Minimum number of signatures required|


### getAggchainSignersCount

Get the total number of registered signers

Returns the count of active signers in the multisig


```solidity
function getAggchainSignersCount() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|count Total number of aggchainSigners currently registered|


### getAggchainSigners

Get all registered signer addresses

Returns the complete list of active signers


```solidity
function getAggchainSigners() external view returns (address[] memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address[]`|signers Array containing all signer addresses|


### getAggchainMultisigHash

Returns the hash of current multisig configuration

Computed as keccak256(abi.encodePacked(threshold, aggchainSigners)).
Used by aggchain contracts for efficient consensus verification.


```solidity
function getAggchainMultisigHash() external view returns (bytes32);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|multisigHash The current aggchainMultisigHash for validation|


### getAggchainSignerInfos

Get detailed information for all registered signers

Returns both addresses and associated URLs/endpoints for each signer


```solidity
function getAggchainSignerInfos() external view returns (SignerInfo[] memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`SignerInfo[]`|signerInfos Array of SignerInfo structs containing complete signer details|


## Events
### SignersAndThresholdUpdated
Emitted when signers and threshold are updated in a batch operation.


```solidity
event SignersAndThresholdUpdated(address[] aggchainSigners, uint256 newThreshold, bytes32 newAggchainMultisigHash);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainSigners`|`address[]`|The updated array of signer addresses.|
|`newThreshold`|`uint256`|The new threshold value.|
|`newAggchainMultisigHash`|`bytes32`|The new hash of the aggchainMultisig configuration.|

## Structs
### SignerInfo
Struct to hold signer information


```solidity
struct SignerInfo {
    address addr;
    string url;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`addr`|`address`|The address of the signer|
|`url`|`string`|The URL associated with the signer|

### RemoveSignerInfo
Struct to hold information for removing a signer


```solidity
struct RemoveSignerInfo {
    address addr;
    uint256 index;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`addr`|`address`|The address of the signer to remove|
|`index`|`uint256`|The index of the signer in the aggchainSigners array|

