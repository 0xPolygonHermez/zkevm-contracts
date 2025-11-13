# ERC20WeirdMetadata
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/ERC20WeirdMetadata.sol)

*Implementation of the ERC20 with weird metadata.*


## State Variables
### _balances

```solidity
mapping(address => uint256) private _balances;
```


### _allowances

```solidity
mapping(address => mapping(address => uint256)) private _allowances;
```


### _totalSupply

```solidity
uint256 private _totalSupply;
```


### _name

```solidity
bytes32 internal _name;
```


### _symbol

```solidity
bytes internal _symbol;
```


### _decimals

```solidity
uint256 internal _decimals;
```


### isRevert

```solidity
bool public isRevert;
```


## Functions
### constructor


```solidity
constructor(bytes32 name_, bytes memory symbol_, uint256 decimals_);
```

### setDecimals


```solidity
function setDecimals(uint256 newDecimals) public;
```

### toggleIsRevert


```solidity
function toggleIsRevert() public;
```

### name


```solidity
function name() public view virtual returns (bytes32);
```

### symbol


```solidity
function symbol() public view virtual returns (bytes memory);
```

### decimals


```solidity
function decimals() public view virtual returns (uint256);
```

### mint


```solidity
function mint(address account, uint256 amount) public;
```

### totalSupply

*See [IERC20-totalSupply](/node_modules/@openzeppelin/contracts-upgradeable5/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol/abstract.ERC721EnumerableUpgradeable.md#totalsupply).*


```solidity
function totalSupply() public view virtual returns (uint256);
```

### balanceOf

*See [IERC20-balanceOf](/contracts/mocks/Uni.sol/contract.Uni.md#balanceof).*


```solidity
function balanceOf(address account) public view virtual returns (uint256);
```

### transfer

*See [IERC20-transfer](/contracts/mocks/Uni.sol/contract.Uni.md#transfer).
Requirements:
- `to` cannot be the zero address.
- the caller must have a balance of at least `amount`.*


```solidity
function transfer(address to, uint256 amount) public virtual returns (bool);
```

### allowance

*See [IERC20-allowance](/contracts/mocks/Uni.sol/contract.Uni.md#allowance).*


```solidity
function allowance(address owner, address spender) public view virtual returns (uint256);
```

### approve

*See [IERC20-approve](/contracts/mocks/Uni.sol/contract.Uni.md#approve).
NOTE: If `amount` is the maximum `uint256`, the allowance is not updated on
`transferFrom`. This is semantically equivalent to an infinite approval.
Requirements:
- `spender` cannot be the zero address.*


```solidity
function approve(address spender, uint256 amount) public virtual returns (bool);
```

### transferFrom

*See [IERC20-transferFrom](/contracts/mocks/Uni.sol/contract.Uni.md#transferfrom).
Emits an {Approval} event indicating the updated allowance. This is not
required by the EIP. See the note at the beginning of {ERC20}.
NOTE: Does not update the allowance if the current allowance
is the maximum `uint256`.
Requirements:
- `from` and `to` cannot be the zero address.
- `from` must have a balance of at least `amount`.
- the caller must have allowance for ``from``'s tokens of at least
`amount`.*


```solidity
function transferFrom(address from, address to, uint256 amount) public virtual returns (bool);
```

### increaseAllowance

*Atomically increases the allowance granted to `spender` by the caller.
This is an alternative to [approve](/contracts/mocks/ERC20WeirdMetadata.sol/contract.ERC20WeirdMetadata.md#approve) that can be used as a mitigation for
problems described in {IERC20-approve}.
Emits an {Approval} event indicating the updated allowance.
Requirements:
- `spender` cannot be the zero address.*


```solidity
function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool);
```

### decreaseAllowance

*Atomically decreases the allowance granted to `spender` by the caller.
This is an alternative to [approve](/contracts/mocks/ERC20WeirdMetadata.sol/contract.ERC20WeirdMetadata.md#approve) that can be used as a mitigation for
problems described in {IERC20-approve}.
Emits an {Approval} event indicating the updated allowance.
Requirements:
- `spender` cannot be the zero address.
- `spender` must have allowance for the caller of at least
`subtractedValue`.*


```solidity
function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool);
```

### _transfer

*Moves `amount` of tokens from `from` to `to`.
This internal function is equivalent to [transfer](/contracts/mocks/ERC20WeirdMetadata.sol/contract.ERC20WeirdMetadata.md#transfer), and can be used to
e.g. implement automatic token fees, slashing mechanisms, etc.
Emits a {Transfer} event.
Requirements:
- `from` cannot be the zero address.
- `to` cannot be the zero address.
- `from` must have a balance of at least `amount`.*


```solidity
function _transfer(address from, address to, uint256 amount) internal virtual;
```

### _mint

*Creates `amount` tokens and assigns them to `account`, increasing
the total supply.
Emits a [Transfer](/contracts/mocks/ERC20WeirdMetadata.sol/contract.ERC20WeirdMetadata.md#transfer) event with `from` set to the zero address.
Requirements:
- `account` cannot be the zero address.*


```solidity
function _mint(address account, uint256 amount) internal virtual;
```

### _burn

*Destroys `amount` tokens from `account`, reducing the
total supply.
Emits a [Transfer](/contracts/mocks/ERC20WeirdMetadata.sol/contract.ERC20WeirdMetadata.md#transfer) event with `to` set to the zero address.
Requirements:
- `account` cannot be the zero address.
- `account` must have at least `amount` tokens.*


```solidity
function _burn(address account, uint256 amount) internal virtual;
```

### _approve

*Sets `amount` as the allowance of `spender` over the `owner` s tokens.
This internal function is equivalent to `approve`, and can be used to
e.g. set automatic allowances for certain subsystems, etc.
Emits an [Approval](/contracts/mocks/ERC20WeirdMetadata.sol/contract.ERC20WeirdMetadata.md#approval) event.
Requirements:
- `owner` cannot be the zero address.
- `spender` cannot be the zero address.*


```solidity
function _approve(address owner, address spender, uint256 amount) internal virtual;
```

### _spendAllowance

*Updates `owner` s allowance for `spender` based on spent `amount`.
Does not update the allowance amount in case of infinite allowance.
Revert if not enough allowance is available.
Might emit an [Approval](/contracts/mocks/ERC20WeirdMetadata.sol/contract.ERC20WeirdMetadata.md#approval) event.*


```solidity
function _spendAllowance(address owner, address spender, uint256 amount) internal virtual;
```

### _beforeTokenTransfer

*Hook that is called before any transfer of tokens. This includes
minting and burning.
Calling conditions:
- when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
will be transferred to `to`.
- when `from` is zero, `amount` tokens will be minted for `to`.
- when `to` is zero, `amount` of ``from``'s tokens will be burned.
- `from` and `to` are never both zero.
To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].*


```solidity
function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual;
```

### _afterTokenTransfer

*Hook that is called after any transfer of tokens. This includes
minting and burning.
Calling conditions:
- when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
has been transferred to `to`.
- when `from` is zero, `amount` tokens have been minted for `to`.
- when `to` is zero, `amount` of ``from``'s tokens have been burned.
- `from` and `to` are never both zero.
To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].*


```solidity
function _afterTokenTransfer(address from, address to, uint256 amount) internal virtual;
```

## Events
### Transfer

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
```

### Approval

```solidity
event Approval(address indexed owner, address indexed spender, uint256 value);
```

