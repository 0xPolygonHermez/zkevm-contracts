This contract is the interface for the SP1 Verifier.


## Functions
### verifyProof
```solidity
  function verifyProof(
    bytes32 programVKey,
    bytes publicValues,
    bytes proofBytes
  ) external
```
Verifies a proof with given public values and vkey.

It is expected that the first 4 bytes of proofBytes must match the first 4 bytes of
target verifier's VERIFIER_HASH.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`programVKey` | bytes32 | The verification key for the RISC-V program.
|`publicValues` | bytes | The public values encoded as bytes.
|`proofBytes` | bytes | The proof of the program execution the SP1 zkVM encoded as bytes.

