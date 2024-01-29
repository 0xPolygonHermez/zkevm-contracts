


## Functions
### initialize
```solidity
  function initialize(
  ) external
```




### setupCommittee
```solidity
  function setupCommittee(
    uint256 _requiredAmountOfSignatures,
    string[] urls,
    bytes addrsBytes
  ) external
```
Allows the admin to setup the members of the committee. Note that:
The system will require N / M signatures where N => _requiredAmountOfSignatures and M => urls.length
There must be the same amount of urls than addressess encoded in the addrsBytes
A member is represented by the url and the address contained in urls[i] and addrsBytes[i*_ADDR_SIZE : i*_ADDR_SIZE + _ADDR_SIZE]


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_requiredAmountOfSignatures` | uint256 | Required amount of signatures
|`urls` | string[] | List of urls of the members of the committee
|`addrsBytes` | bytes | Byte array that contains the addressess of the members of the committee

### getAmountOfMembers
```solidity
  function getAmountOfMembers(
  ) public returns (uint256)
```




### verifySignatures
```solidity
  function verifySignatures(
    bytes32 signedHash,
    bytes signaturesAndAddrs
  ) external
```
Verifies that the given signedHash has been signed by requiredAmountOfSignatures committee members


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`signedHash` | bytes32 | Hash that must have been signed by requiredAmountOfSignatures of committee members
|`signaturesAndAddrs` | bytes | Byte array containing the signatures and all the addresses of the committee in ascending order
[signature 0, ..., signature requiredAmountOfSignatures -1, address 0, ... address N]
note that each ECDSA signatures are used, therefore each one must be 65 bytes

## Events
### CommitteeUpdated
```solidity
  event CommitteeUpdated(
    bytes32 committeeHash
  )
```

Emitted when the committee is updated

#### Parameters:
| Name                           | Type          | Description                                    |
| :----------------------------- | :------------ | :--------------------------------------------- |
|`committeeHash`| bytes32 | hash of the addresses of the committee members
