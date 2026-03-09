# BridgeMessageReceiverMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/mocks/BridgeMessageReceiverMock.sol)

**Inherits:**
[IBridgeMessageReceiver](/contracts/interfaces/IBridgeMessageReceiver.sol/interface.IBridgeMessageReceiver.md)


## State Variables
### _DEPOSIT_CONTRACT_TREE_DEPTH

```solidity
uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32
```


### bridgeAddress

```solidity
AgglayerBridge public immutable bridgeAddress
```


### smtProofLocalExitRoot

```solidity
bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot
```


### smtProofRollupExitRoot

```solidity
bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot
```


### globalIndex

```solidity
uint256 globalIndex
```


### mainnetExitRoot

```solidity
bytes32 mainnetExitRoot
```


### rollupExitRoot

```solidity
bytes32 rollupExitRoot
```


### originNetwork

```solidity
uint32 originNetwork
```


### originAddress

```solidity
address originAddress
```


### destinationNetwork

```solidity
uint32 destinationNetwork
```


### destinationAddress

```solidity
address destinationAddress
```


### amount

```solidity
uint256 amount
```


### metadata

```solidity
bytes metadata
```


## Functions
### constructor


```solidity
constructor(AgglayerBridge _bridgeAddress) ;
```

### updateParameters


```solidity
function updateParameters(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata msmtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata msmtProofRollupExitRoot,
    uint256 mglobalIndex,
    bytes32 mmainnetExitRoot,
    bytes32 mrollupExitRoot,
    uint32 moriginNetwork,
    address moriginAddress,
    uint32 mdestinationNetwork,
    address mdestinationAddress,
    uint256 mamount,
    bytes calldata mmetadata
) public;
```

### onMessageReceived


```solidity
function onMessageReceived(address originAddress, uint32 originNetwork, bytes memory data) external payable;
```

### testClaim


```solidity
function testClaim(bytes memory claimData1, bytes memory bridgeAsset, bytes memory claimData2) external payable;
```

## Events
### MessageReceived

```solidity
event MessageReceived(address destinationAddress);
```

### UpdateParameters

```solidity
event UpdateParameters();
```

