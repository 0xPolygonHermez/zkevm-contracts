# IPolygonDataCommitteeErrors
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IPolygonDataCommitteeErrors.sol)


## Errors
### UnexpectedAddrsBytesLength
*Thrown when the addres bytes doesn't have the expected length*


```solidity
error UnexpectedAddrsBytesLength();
```

### EmptyURLNotAllowed
*Thrown when the setup attempts to register a member with empty URL*


```solidity
error EmptyURLNotAllowed();
```

### WrongAddrOrder
*Thrown when the setup register doesn't order the members correctly*


```solidity
error WrongAddrOrder();
```

### TooManyRequiredSignatures
*Thrown when the required amount of signatures is greater than the amount of members*


```solidity
error TooManyRequiredSignatures();
```

### UnexpectedCommitteeHash
*Thrown when the hash of the committee doesn't match with the provided addresses*


```solidity
error UnexpectedCommitteeHash();
```

### CommitteeAddressDoesNotExist
*Thrown when the signature of a DA hash doesn't belong to any member of the committee*


```solidity
error CommitteeAddressDoesNotExist();
```

### UnexpectedAddrsAndSignaturesSize
*Thrown when the addresses and signatures byte array length has an unexpected size*


```solidity
error UnexpectedAddrsAndSignaturesSize();
```

