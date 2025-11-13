# TokenWrapped
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/lib/TokenWrapped.sol)

**Inherits:**
ERC20


## State Variables
### DOMAIN_TYPEHASH

```solidity
bytes32 public constant DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
```


### PERMIT_TYPEHASH

```solidity
bytes32 public constant PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
```


### VERSION

```solidity
string public constant VERSION = "1";
```


### deploymentChainId

```solidity
uint256 public immutable deploymentChainId;
```


### _DEPLOYMENT_DOMAIN_SEPARATOR

```solidity
bytes32 private immutable _DEPLOYMENT_DOMAIN_SEPARATOR;
```


### bridgeAddress

```solidity
address public immutable bridgeAddress;
```


### _decimals

```solidity
uint8 private immutable _decimals;
```


### nonces

```solidity
mapping(address => uint256) public nonces;
```


## Functions
### onlyBridge


```solidity
modifier onlyBridge();
```

### constructor


```solidity
constructor(string memory name, string memory symbol, uint8 __decimals) ERC20(name, symbol);
```

### mint


```solidity
function mint(address to, uint256 value) external onlyBridge;
```

### burn


```solidity
function burn(address account, uint256 value) external onlyBridge;
```

### decimals


```solidity
function decimals() public view virtual override returns (uint8);
```

### permit


```solidity
function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    external;
```

### _calculateDomainSeparator

Calculate domain separator, given a chainID.


```solidity
function _calculateDomainSeparator(uint256 chainId) private view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`chainId`|`uint256`|Current chainID|


### DOMAIN_SEPARATOR

*Return the DOMAIN_SEPARATOR.*


```solidity
function DOMAIN_SEPARATOR() public view returns (bytes32);
```

