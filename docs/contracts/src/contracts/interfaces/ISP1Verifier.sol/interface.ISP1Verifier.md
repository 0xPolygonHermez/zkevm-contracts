# ISP1Verifier
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/ISP1Verifier.sol)

**Title:**
SP1 Verifier Interface

**Author:**
Succinct Labs

This contract is the interface for the SP1 Verifier.


## Functions
### verifyProof

Verifies a proof with given public values and vkey.

It is expected that the first 4 bytes of proofBytes must match the first 4 bytes of
target verifier's VERIFIER_HASH.


```solidity
function verifyProof(bytes32 programVKey, bytes calldata publicValues, bytes calldata proofBytes) external view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`programVKey`|`bytes32`|The verification key for the RISC-V program.|
|`publicValues`|`bytes`|The public values encoded as bytes.|
|`proofBytes`|`bytes`|The proof of the program execution the SP1 zkVM encoded as bytes.|


