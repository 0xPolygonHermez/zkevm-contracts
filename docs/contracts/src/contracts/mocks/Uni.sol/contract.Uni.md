# Uni
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/Uni.sol)


## State Variables
### name
EIP-20 token name for this token


```solidity
string public constant name = "Uniswap";
```


### symbol
EIP-20 token symbol for this token


```solidity
string public constant symbol = "UNI";
```


### decimals
EIP-20 token decimals for this token


```solidity
uint8 public constant decimals = 18;
```


### totalSupply
Total number of tokens in circulation


```solidity
uint256 public totalSupply = 1_000_000_000e18;
```


### minter
Address which may mint new tokens


```solidity
address public minter;
```


### mintingAllowedAfter
The timestamp after which minting may occur


```solidity
uint256 public mintingAllowedAfter;
```


### minimumTimeBetweenMints
Minimum time between mints


```solidity
uint32 public constant minimumTimeBetweenMints = 1 days * 365;
```


### mintCap
Cap on the percentage of totalSupply that can be minted at each mint


```solidity
uint8 public constant mintCap = 2;
```


### allowances
Allowance amounts on behalf of others


```solidity
mapping(address => mapping(address => uint96)) internal allowances;
```


### balances
Official record of token balances for each account


```solidity
mapping(address => uint96) internal balances;
```


### delegates
A record of each accounts delegate


```solidity
mapping(address => address) public delegates;
```


### checkpoints
A record of votes checkpoints for each account, by index


```solidity
mapping(address => mapping(uint32 => Checkpoint)) public checkpoints;
```


### numCheckpoints
The number of checkpoints for each account


```solidity
mapping(address => uint32) public numCheckpoints;
```


### DOMAIN_TYPEHASH
The EIP-712 typehash for the contract's domain


```solidity
bytes32 public constant DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
```


### DELEGATION_TYPEHASH
The EIP-712 typehash for the delegation struct used by the contract


```solidity
bytes32 public constant DELEGATION_TYPEHASH = keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");
```


### PERMIT_TYPEHASH
The EIP-712 typehash for the permit struct used by the contract


```solidity
bytes32 public constant PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
```


### nonces
A record of states for signing / validating signatures


```solidity
mapping(address => uint256) public nonces;
```


## Functions
### constructor

Construct a new Uni token


```solidity
constructor(address account, address minter_, uint256 mintingAllowedAfter_) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|The initial account to grant all the tokens|
|`minter_`|`address`|The account with minting ability|
|`mintingAllowedAfter_`|`uint256`|The timestamp after which minting may occur|


### setMinter

Change the minter address


```solidity
function setMinter(address minter_) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`minter_`|`address`|The address of the new minter|


### mint

Mint new tokens


```solidity
function mint(address dst, uint256 rawAmount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`dst`|`address`|The address of the destination account|
|`rawAmount`|`uint256`|The number of tokens to be minted|


### allowance

Get the number of tokens `spender` is approved to spend on behalf of `account`


```solidity
function allowance(address account, address spender) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|The address of the account holding the funds|
|`spender`|`address`|The address of the account spending the funds|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The number of tokens approved|


### approve

Approve `spender` to transfer up to `amount` from `src`

*This will overwrite the approval amount for `spender`
and is subject to issues noted [here](https://eips.ethereum.org/EIPS/eip-20#approve)*


```solidity
function approve(address spender, uint256 rawAmount) external returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`spender`|`address`|The address of the account which may transfer tokens|
|`rawAmount`|`uint256`|The number of tokens that are approved (2^256-1 means infinite)|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|Whether or not the approval succeeded|


### permit

Triggers an approval from owner to spends


```solidity
function permit(address owner, address spender, uint256 rawAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`owner`|`address`|The address to approve from|
|`spender`|`address`|The address to be approved|
|`rawAmount`|`uint256`|The number of tokens that are approved (2^256-1 means infinite)|
|`deadline`|`uint256`|The time at which to expire the signature|
|`v`|`uint8`|The recovery byte of the signature|
|`r`|`bytes32`|Half of the ECDSA signature pair|
|`s`|`bytes32`|Half of the ECDSA signature pair|


### balanceOf

Get the number of tokens held by the `account`


```solidity
function balanceOf(address account) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|The address of the account to get the balance of|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The number of tokens held|


### transfer

Transfer `amount` tokens from `msg.sender` to `dst`


```solidity
function transfer(address dst, uint256 rawAmount) external returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`dst`|`address`|The address of the destination account|
|`rawAmount`|`uint256`|The number of tokens to transfer|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|Whether or not the transfer succeeded|


### transferFrom

Transfer `amount` tokens from `src` to `dst`


```solidity
function transferFrom(address src, address dst, uint256 rawAmount) external returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`src`|`address`|The address of the source account|
|`dst`|`address`|The address of the destination account|
|`rawAmount`|`uint256`|The number of tokens to transfer|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|Whether or not the transfer succeeded|


### delegate

Delegate votes from `msg.sender` to `delegatee`


```solidity
function delegate(address delegatee) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`delegatee`|`address`|The address to delegate votes to|


### delegateBySig

Delegates votes from signatory to `delegatee`


```solidity
function delegateBySig(address delegatee, uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`delegatee`|`address`|The address to delegate votes to|
|`nonce`|`uint256`|The contract state required to match the signature|
|`expiry`|`uint256`|The time at which to expire the signature|
|`v`|`uint8`|The recovery byte of the signature|
|`r`|`bytes32`|Half of the ECDSA signature pair|
|`s`|`bytes32`|Half of the ECDSA signature pair|


### getCurrentVotes

Gets the current votes balance for `account`


```solidity
function getCurrentVotes(address account) external view returns (uint96);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|The address to get votes balance|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint96`|The number of current votes for `account`|


### getPriorVotes

Determine the prior number of votes for an account as of a block number

*Block number must be a finalized block or else this function will revert to prevent misinformation.*


```solidity
function getPriorVotes(address account, uint256 blockNumber) public view returns (uint96);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|The address of the account to check|
|`blockNumber`|`uint256`|The block number to get the vote balance at|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint96`|The number of votes the account had as of the given block|


### _delegate


```solidity
function _delegate(address delegator, address delegatee) internal;
```

### _transferTokens


```solidity
function _transferTokens(address src, address dst, uint96 amount) internal;
```

### _moveDelegates


```solidity
function _moveDelegates(address srcRep, address dstRep, uint96 amount) internal;
```

### _writeCheckpoint


```solidity
function _writeCheckpoint(address delegatee, uint32 nCheckpoints, uint96 oldVotes, uint96 newVotes) internal;
```

### safe32


```solidity
function safe32(uint256 n, string memory errorMessage) internal pure returns (uint32);
```

### safe96


```solidity
function safe96(uint256 n, string memory errorMessage) internal pure returns (uint96);
```

### add96


```solidity
function add96(uint96 a, uint96 b, string memory errorMessage) internal pure returns (uint96);
```

### sub96


```solidity
function sub96(uint96 a, uint96 b, string memory errorMessage) internal pure returns (uint96);
```

### getChainId


```solidity
function getChainId() internal pure returns (uint256);
```

## Events
### MinterChanged
An event thats emitted when the minter address is changed


```solidity
event MinterChanged(address minter, address newMinter);
```

### DelegateChanged
An event thats emitted when an account changes its delegate


```solidity
event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);
```

### DelegateVotesChanged
An event thats emitted when a delegate account's vote balance changes


```solidity
event DelegateVotesChanged(address indexed delegate, uint256 previousBalance, uint256 newBalance);
```

### Transfer
The standard EIP-20 transfer event


```solidity
event Transfer(address indexed from, address indexed to, uint256 amount);
```

### Approval
The standard EIP-20 approval event


```solidity
event Approval(address indexed owner, address indexed spender, uint256 amount);
```

## Structs
### Checkpoint
A checkpoint for marking number of votes from a given block


```solidity
struct Checkpoint {
    uint32 fromBlock;
    uint96 votes;
}
```

