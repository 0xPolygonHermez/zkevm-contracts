# PolygonDataCommittee
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/consensus/validium/PolygonDataCommittee.sol)

**Inherits:**
[IDataAvailabilityProtocol](/contracts/v2/interfaces/IDataAvailabilityProtocol.sol/interface.IDataAvailabilityProtocol.md), [IPolygonDataCommitteeErrors](/contracts/v2/interfaces/IPolygonDataCommitteeErrors.sol/interface.IPolygonDataCommitteeErrors.md), OwnableUpgradeable


## State Variables
### _PROTOCOL_NAME

```solidity
string internal constant _PROTOCOL_NAME = "DataAvailabilityCommittee";
```


### _SIGNATURE_SIZE

```solidity
uint256 internal constant _SIGNATURE_SIZE = 65;
```


### _ADDR_SIZE

```solidity
uint256 internal constant _ADDR_SIZE = 20;
```


### requiredAmountOfSignatures

```solidity
uint256 public requiredAmountOfSignatures;
```


### committeeHash

```solidity
bytes32 public committeeHash;
```


### members

```solidity
Member[] public members;
```


## Functions
### constructor

Disable initalizers on the implementation following the best practices


```solidity
constructor();
```

### initialize


```solidity
function initialize() external initializer;
```

### setupCommittee

Allows the admin to setup the members of the committee. Note that:
The system will require N / M signatures where N => _requiredAmountOfSignatures and M => urls.length
There must be the same amount of urls than addressess encoded in the addrsBytes
A member is represented by the url and the address contained in urls[i] and addrsBytes[i*_ADDR_SIZE : i*_ADDR_SIZE + _ADDR_SIZE]


```solidity
function setupCommittee(uint256 _requiredAmountOfSignatures, string[] calldata urls, bytes calldata addrsBytes)
    external
    onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_requiredAmountOfSignatures`|`uint256`|Required amount of signatures|
|`urls`|`string[]`|List of urls of the members of the committee|
|`addrsBytes`|`bytes`|Byte array that contains the addressess of the members of the committee|


### verifyMessage

Verifies that the given signedHash has been signed by requiredAmountOfSignatures committee members


```solidity
function verifyMessage(bytes32 signedHash, bytes calldata signaturesAndAddrs) external view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`signedHash`|`bytes32`|Hash that must have been signed by requiredAmountOfSignatures of committee members|
|`signaturesAndAddrs`|`bytes`|Byte array containing the signatures and all the addresses of the committee in ascending order [signature 0, ..., signature requiredAmountOfSignatures -1, address 0, ... address N] note that each ECDSA signatures are used, therefore each one must be 65 bytes|


### getAmountOfMembers

Return the amount of committee members


```solidity
function getAmountOfMembers() public view returns (uint256);
```

### getProcotolName

Return the protocol name


```solidity
function getProcotolName() external pure override returns (string memory);
```

## Events
### CommitteeUpdated
*Emitted when the committee is updated*


```solidity
event CommitteeUpdated(bytes32 committeeHash);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`committeeHash`|`bytes32`|hash of the addresses of the committee members|

## Structs
### Member
Struct which will store all the data of the committee members


```solidity
struct Member {
    string url;
    address addr;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`url`|`string`|string that represents the URL of the member to be used to access the data|
|`addr`|`address`|address of the member that will be used to sign|

