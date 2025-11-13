# BatchL2DataCreatedRollup
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/periphery/BatchL2DataCreatedRollup.sol)


## State Variables
### INITIALIZE_TX_BRIDGE_LIST_LEN_LEN

```solidity
uint8 public constant INITIALIZE_TX_BRIDGE_LIST_LEN_LEN = 0xf9;
```


### INITIALIZE_TX_BRIDGE_PARAMS

```solidity
bytes public constant INITIALIZE_TX_BRIDGE_PARAMS = hex"80808401c9c38094";
```


### INITIALIZE_TX_CONSTANT_BYTES

```solidity
uint16 public constant INITIALIZE_TX_CONSTANT_BYTES = 32;
```


### INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS

```solidity
bytes public constant INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS = hex"80b9";
```


### INITIALIZE_TX_CONSTANT_BYTES_EMPTY_METADATA

```solidity
uint16 public constant INITIALIZE_TX_CONSTANT_BYTES_EMPTY_METADATA = 31;
```


### INITIALIZE_TX_DATA_LEN_EMPTY_METADATA

```solidity
uint8 public constant INITIALIZE_TX_DATA_LEN_EMPTY_METADATA = 228;
```


### INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS_EMPTY_METADATA

```solidity
bytes public constant INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS_EMPTY_METADATA = hex"80b8";
```


### SIGNATURE_INITIALIZE_TX_V

```solidity
uint8 public constant SIGNATURE_INITIALIZE_TX_V = 27;
```


### SIGNATURE_INITIALIZE_TX_R

```solidity
bytes32 public constant SIGNATURE_INITIALIZE_TX_R = 0x00000000000000000000000000000000000000000000000000000005ca1ab1e0;
```


### SIGNATURE_INITIALIZE_TX_S

```solidity
bytes32 public constant SIGNATURE_INITIALIZE_TX_S = 0x000000000000000000000000000000000000000000000000000000005ca1ab1e;
```


### INITIALIZE_TX_EFFECTIVE_PERCENTAGE

```solidity
bytes1 public constant INITIALIZE_TX_EFFECTIVE_PERCENTAGE = 0xFF;
```


### GLOBAL_EXIT_ROOT_MANAGER_L2

```solidity
IBasePolygonZkEVMGlobalExitRoot public constant GLOBAL_EXIT_ROOT_MANAGER_L2 =
    IBasePolygonZkEVMGlobalExitRoot(0xa40D5f56745a118D0906a34E69aeC8C0Db1cB8fA);
```


## Functions
### generateInitializeTransaction

Generate Initialize transaction for hte bridge on L2


```solidity
function generateInitializeTransaction(
    uint32 networkID,
    address bridgeAddress,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    bytes memory _gasTokenMetadata
) public view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`networkID`|`uint32`|Indicates the network identifier that will be used in the bridge|
|`bridgeAddress`|`address`|Indicates the bridge address|
|`_gasTokenAddress`|`address`|Indicates the token address that will be used to pay gas fees in the new rollup|
|`_gasTokenNetwork`|`uint32`|Indicates the native network of the token address|
|`_gasTokenMetadata`|`bytes`|Abi encoded gas token metadata|


