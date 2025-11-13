# PolygonZkEVMBridgeMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/PolygonZkEVMBridgeMock.sol)

**Inherits:**
[PolygonZkEVMBridge](/contracts/PolygonZkEVMBridge.sol/contract.PolygonZkEVMBridge.md), OwnableUpgradeable

PolygonZkEVMBridge that will be deployed on both networks Ethereum and Polygon zkEVM
Contract responsible to manage the token interactions with other networks


## State Variables
### maxEtherBridge

```solidity
uint256 public maxEtherBridge;
```


## Functions
### initialize


```solidity
function initialize(
    uint32 _networkID,
    IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
    address _polygonZkEVMaddress
) public override initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_networkID`|`uint32`|networkID|
|`_globalExitRootManager`|`IBasePolygonZkEVMGlobalExitRoot`|global exit root manager address|
|`_polygonZkEVMaddress`|`address`||


### setNetworkID


```solidity
function setNetworkID(uint32 _networkID) public onlyOwner;
```

### setMaxEtherBridge


```solidity
function setMaxEtherBridge(uint256 _maxEtherBridge) public onlyOwner;
```

### bridgeAsset

Deposit add a new leaf to the merkle tree


```solidity
function bridgeAsset(
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    address token,
    bool forceUpdateGlobalExitRoot,
    bytes calldata permitData
) public payable override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|Amount of tokens|
|`token`|`address`|Token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token|
|`forceUpdateGlobalExitRoot`|`bool`||
|`permitData`|`bytes`|Raw data of the call `permit` of the token|


