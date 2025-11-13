# ERC20Decimals
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/ERC20Decimals.sol)

**Inherits:**
ERC20


## State Variables
### _decimals

```solidity
uint8 private _decimals;
```


### nonces

```solidity
mapping(address => uint256) public nonces;
```


### PERMIT_TYPEHASH

```solidity
bytes32 public constant PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
```


### NAME_HASH

```solidity
bytes32 public NAME_HASH;
```


### VERSION_HASH

```solidity
bytes32 public constant VERSION_HASH = 0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;
```


### EIP712DOMAIN_HASH

```solidity
bytes32 public constant EIP712DOMAIN_HASH = 0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;
```


## Functions
### constructor


```solidity
constructor(string memory name, string memory symbol, address initialAccount, uint256 initialBalance, uint8 decimals_)
    payable
    ERC20(name, symbol);
```

### decimals


```solidity
function decimals() public view virtual override returns (uint8);
```

### mint


```solidity
function mint(address account, uint256 amount) public;
```

### burn


```solidity
function burn(uint256 amount) public;
```

### transferInternal


```solidity
function transferInternal(address from, address to, uint256 value) public;
```

### approveInternal


```solidity
function approveInternal(address owner, address spender, uint256 value) public;
```

### _validateSignedData


```solidity
function _validateSignedData(address signer, bytes32 encodeData, uint8 v, bytes32 r, bytes32 s) internal view;
```

### getChainId


```solidity
function getChainId() public view returns (uint256 chainId);
```

### permit


```solidity
function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    external;
```

### DOMAIN_SEPARATOR


```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32);
```

