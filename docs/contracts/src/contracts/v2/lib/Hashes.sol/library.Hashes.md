# Hashes
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/lib/Hashes.sol)

This code is a copy from OpenZeppelin Contracts v5.1.0 (utils/cryptography/Hashes.sol) with a minor change:
function visibility is modified from 'private' to 'internal' so it can be used in other contracts.

OpenZeppelin already did this change: https://github.com/OpenZeppelin/openzeppelin-contracts/commit/441dc141ac99622de7e535fa75dfc74af939019c
to be included in next version of OpenZeppelin Contracts.
_Available since v5.1._

*Library of standard hash functions.*


## Functions
### efficientKeccak256

*Implementation of keccak256(abi.encode(a, b)) that doesn't allocate or expand memory.*


```solidity
function efficientKeccak256(bytes32 a, bytes32 b) internal pure returns (bytes32 value);
```

