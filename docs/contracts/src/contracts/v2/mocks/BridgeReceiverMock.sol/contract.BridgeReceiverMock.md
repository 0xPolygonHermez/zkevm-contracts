# BridgeReceiverMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/mocks/BridgeReceiverMock.sol)

Contract for compressing and decompressing claim data


## State Variables
### _DEPOSIT_CONTRACT_TREE_DEPTH

```solidity
uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;
```


## Functions
### claimAsset

Verify merkle proof and withdraw tokens/ether


```solidity
function claimAsset(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
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
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the leaf against the network exit root|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the rollupLocalExitRoot against the rollups exit root|
|`globalIndex`|`uint256`|Global index is defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex | note that only the rollup index will be used only in case the mainnet flag is 0 note that global index do not assert the unused bits to 0. This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract to avoid possible synch attacks|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`| Origin token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|Amount of tokens|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|


### claimMessage

Verify merkle proof and execute message
If the receiving address is an EOA, the call will result as a success
Which means that the amount of ether will be transferred correctly, but the message
will not trigger any execution


```solidity
function claimMessage(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
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
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the leaf against the exit root|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the rollupLocalExitRoot against the rollups exit root|
|`globalIndex`|`uint256`|Global index is defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex | note that only the rollup index will be used only in case the mainnet flag is 0 note that global index do not assert the unused bits to 0. This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract to avoid possible synch attacks|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`originNetwork`|`uint32`|Origin network|
|`originAddress`|`address`|Origin address|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|message value|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|


### fallback


```solidity
fallback() external;
```

## Events
### FallbackEvent

```solidity
event FallbackEvent(bytes calldataBytes);
```

### ClaimAsset
*Emitted when bridge assets or messages to another network*


```solidity
event ClaimAsset(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes metadata
);
```

### ClaimMessage
*Emitted when bridge assets or messages to another network*


```solidity
event ClaimMessage(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes metadata
);
```

