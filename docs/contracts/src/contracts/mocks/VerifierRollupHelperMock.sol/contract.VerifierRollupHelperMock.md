# VerifierRollupHelperMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/VerifierRollupHelperMock.sol)

**Inherits:**
[IVerifierRollup](/contracts/interfaces/IVerifierRollup.sol/interface.IVerifierRollup.md), [ISP1Verifier](/contracts/v2/interfaces/ISP1Verifier.sol/interface.ISP1Verifier.md)


## Functions
### verifyProof


```solidity
function verifyProof(bytes32[24] calldata proof, uint256[1] memory pubSignals) public pure override returns (bool);
```

### verifyProof


```solidity
function verifyProof(bytes32 programVKey, bytes calldata publicValues, bytes calldata proofBytes) public pure;
```

