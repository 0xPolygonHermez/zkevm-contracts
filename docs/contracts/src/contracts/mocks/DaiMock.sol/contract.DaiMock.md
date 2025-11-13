# DaiMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/DaiMock.sol)

Submitted for verification at Etherscan.io on 2019-11-14


## State Variables
### wards

```solidity
mapping(address => uint256) public wards;
```


### name

```solidity
string public constant name = "Dai Stablecoin";
```


### symbol

```solidity
string public constant symbol = "DAI";
```


### version

```solidity
string public constant version = "1";
```


### decimals

```solidity
uint8 public constant decimals = 18;
```


### totalSupply

```solidity
uint256 public totalSupply;
```


### balanceOf

```solidity
mapping(address => uint256) public balanceOf;
```


### allowance

```solidity
mapping(address => mapping(address => uint256)) public allowance;
```


### nonces

```solidity
mapping(address => uint256) public nonces;
```


### DOMAIN_SEPARATOR

```solidity
bytes32 public DOMAIN_SEPARATOR;
```


### PERMIT_TYPEHASH

```solidity
bytes32 public constant PERMIT_TYPEHASH = 0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb;
```


## Functions
### rely


```solidity
function rely(address guy) external auth;
```

### deny


```solidity
function deny(address guy) external auth;
```

### auth


```solidity
modifier auth();
```

### add


```solidity
function add(uint256 x, uint256 y) internal pure returns (uint256 z);
```

### sub


```solidity
function sub(uint256 x, uint256 y) internal pure returns (uint256 z);
```

### constructor


```solidity
constructor(uint256 chainId_) public;
```

### transfer


```solidity
function transfer(address dst, uint256 wad) external returns (bool);
```

### transferFrom


```solidity
function transferFrom(address src, address dst, uint256 wad) public returns (bool);
```

### mint


```solidity
function mint(address usr, uint256 wad) external auth;
```

### burn


```solidity
function burn(address usr, uint256 wad) external;
```

### approve


```solidity
function approve(address usr, uint256 wad) external returns (bool);
```

### push


```solidity
function push(address usr, uint256 wad) external;
```

### pull


```solidity
function pull(address usr, uint256 wad) external;
```

### move


```solidity
function move(address src, address dst, uint256 wad) external;
```

### permit


```solidity
function permit(
    address holder,
    address spender,
    uint256 nonce,
    uint256 expiry,
    bool allowed,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;
```

## Events
### Approval

```solidity
event Approval(address indexed src, address indexed guy, uint256 wad);
```

### Transfer

```solidity
event Transfer(address indexed src, address indexed dst, uint256 wad);
```

