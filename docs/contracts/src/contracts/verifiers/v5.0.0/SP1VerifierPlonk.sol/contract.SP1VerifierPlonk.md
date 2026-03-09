# SP1VerifierPlonk
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/verifiers/v5.0.0/SP1VerifierPlonk.sol)

**Inherits:**
[PlonkVerifier](/contracts/verifiers/v5.0.0/PlonkVerifier.sol/contract.PlonkVerifier.md), [ISP1VerifierWithHash](/contracts/interfaces/ISP1Verifier.sol/interface.ISP1VerifierWithHash.md)

**Title:**
SP1 Verifier

**Author:**
Succinct Labs

This contracts implements a solidity verifier for SP1.


## Functions
### VERSION


```solidity
function VERSION() external pure returns (string memory);
```

### VERIFIER_HASH

Returns the hash of the verifier.


```solidity
function VERIFIER_HASH() public pure returns (bytes32);
```

### hashPublicValues

Hashes the public values to a field elements inside Bn254.


```solidity
function hashPublicValues(bytes calldata publicValues) public pure returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`publicValues`|`bytes`|The public values.|


### verifyProof

Verifies a proof with given public values and vkey.


```solidity
function verifyProof(bytes32 programVKey, bytes calldata publicValues, bytes calldata proofBytes) external view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`programVKey`|`bytes32`|The verification key for the RISC-V program.|
|`publicValues`|`bytes`|The public values encoded as bytes.|
|`proofBytes`|`bytes`|The proof of the program execution the SP1 zkVM encoded as bytes.|


## Errors
### WrongVerifierSelector
Thrown when the verifier selector from this proof does not match the one in this
verifier. This indicates that this proof was sent to the wrong verifier.


```solidity
error WrongVerifierSelector(bytes4 received, bytes4 expected);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`received`|`bytes4`|The verifier selector from the first 4 bytes of the proof.|
|`expected`|`bytes4`|The verifier selector from the first 4 bytes of the VERIFIER_HASH().|

### InvalidProof
Thrown when the proof is invalid.


```solidity
error InvalidProof();
```

