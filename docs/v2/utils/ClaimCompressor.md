Contract for compressing and decompressing claim data


## Functions
### constructor
```solidity
  function constructor(
    address __bridgeAddress,
    uint32 __networkID
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`__bridgeAddress` | address | PolygonZkEVMBridge contract address
|`__networkID` | uint32 | Network ID

### compressClaimCall
```solidity
  function compressClaimCall(
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    struct ClaimCompressor.CompressClaimCallData[] compressClaimCalldata
  ) external returns (bytes)
```
Foward all the claim parameters to compress them inside the contrat


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`mainnetExitRoot` | bytes32 | Mainnet exit root
|`rollupExitRoot` | bytes32 | Rollup exit root
|`compressClaimCalldata` | struct ClaimCompressor.CompressClaimCallData[] | compress claim calldata


### sendCompressedClaims
```solidity
  function sendCompressedClaims(
  ) external
```




