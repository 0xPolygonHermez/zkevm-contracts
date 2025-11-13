# ClaimCompressor
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/periphery/ClaimCompressor.sol)

Contract for compressing and decompressing claim data


## State Variables
### _DEPOSIT_CONTRACT_TREE_DEPTH

```solidity
uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;
```


### _GLOBAL_INDEX_MAINNET_FLAG

```solidity
uint256 private constant _GLOBAL_INDEX_MAINNET_FLAG = 2 ** 64;
```


### _CLAIM_ASSET_SIGNATURE

```solidity
bytes4 private constant _CLAIM_ASSET_SIGNATURE = PolygonZkEVMBridgeV2.claimAsset.selector;
```


### _CLAIM_MESSAGE_SIGNATURE

```solidity
bytes4 private constant _CLAIM_MESSAGE_SIGNATURE = PolygonZkEVMBridgeV2.claimMessage.selector;
```


### _CONSTANT_BYTES_PER_CLAIM

```solidity
uint256 internal constant _CONSTANT_BYTES_PER_CLAIM = 4 + 32 * 32 * 2 + 8 * 32 + 32 * 2;
```


### _BYTE_LEN_CONSTANT_ARRAYS

```solidity
uint256 internal constant _BYTE_LEN_CONSTANT_ARRAYS = 32 * 32;
```


### _CONSTANT_VARIABLES_LENGTH

```solidity
uint256 internal constant _CONSTANT_VARIABLES_LENGTH = 32 * 2;
```


### _METADATA_OFSSET

```solidity
uint256 internal constant _METADATA_OFSSET = 32 * 32 * 2 + 8 * 32 + 32;
```


### _bridgeAddress

```solidity
address private immutable _bridgeAddress;
```


### _networkID

```solidity
uint32 private immutable _networkID;
```


## Functions
### constructor


```solidity
constructor(address __bridgeAddress, uint32 __networkID);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`__bridgeAddress`|`address`|PolygonZkEVMBridge contract address|
|`__networkID`|`uint32`|Network ID|


### compressClaimCall

Foward all the claim parameters to compress them inside the contrat


```solidity
function compressClaimCall(
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    CompressClaimCallData[] calldata compressClaimCalldata
) external pure returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`compressClaimCalldata`|`CompressClaimCallData[]`|compress claim calldata|


### sendCompressedClaims


```solidity
function sendCompressedClaims(bytes calldata compressedClaimCalls) external;
```

## Structs
### CompressClaimCallData

```solidity
struct CompressClaimCallData {
    bytes32[32] smtProofLocalExitRoot;
    bytes32[32] smtProofRollupExitRoot;
    uint256 globalIndex;
    uint32 originNetwork;
    address originAddress;
    address destinationAddress;
    uint256 amount;
    bytes metadata;
    bool isMessage;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[32]`|Smt proof|
|`smtProofRollupExitRoot`|`bytes32[32]`|Smt proof|
|`globalIndex`|`uint256`|Index of the leaf|
|`originNetwork`|`uint32`|Origin network|
|`originAddress`|`address`|Origin address param destinationNetwork Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|message value|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|
|`isMessage`|`bool`|Bool indicating if it's a message|

