# SafeMath
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/Uni.sol)

Submitted for verification at Etherscan.io on 2020-09-16
Submitted for verification at Etherscan.io on 2020-09-15

*Wrappers over Solidity's arithmetic operations with added overflow
checks.
Arithmetic operations in Solidity wrap on overflow. This can easily result
in bugs, because programmers usually assume that an overflow raises an
error, which is the standard behavior in high level programming languages.
`SafeMath` restores this intuition by reverting the transaction when an
operation overflows.
Using this library instead of the unchecked operations eliminates an entire
class of bugs, so it's recommended to use it always.*


## Functions
### add

*Returns the addition of two unsigned integers, reverting on overflow.
Counterpart to Solidity's `+` operator.
Requirements:
- Addition cannot overflow.*


```solidity
function add(uint256 a, uint256 b) internal pure returns (uint256);
```

### add

*Returns the addition of two unsigned integers, reverting with custom message on overflow.
Counterpart to Solidity's `+` operator.
Requirements:
- Addition cannot overflow.*


```solidity
function add(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256);
```

### sub

*Returns the subtraction of two unsigned integers, reverting on underflow (when the result is negative).
Counterpart to Solidity's `-` operator.
Requirements:
- Subtraction cannot underflow.*


```solidity
function sub(uint256 a, uint256 b) internal pure returns (uint256);
```

### sub

*Returns the subtraction of two unsigned integers, reverting with custom message on underflow (when the result is negative).
Counterpart to Solidity's `-` operator.
Requirements:
- Subtraction cannot underflow.*


```solidity
function sub(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256);
```

### mul

*Returns the multiplication of two unsigned integers, reverting on overflow.
Counterpart to Solidity's `*` operator.
Requirements:
- Multiplication cannot overflow.*


```solidity
function mul(uint256 a, uint256 b) internal pure returns (uint256);
```

### mul

*Returns the multiplication of two unsigned integers, reverting on overflow.
Counterpart to Solidity's `*` operator.
Requirements:
- Multiplication cannot overflow.*


```solidity
function mul(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256);
```

### div

*Returns the integer division of two unsigned integers.
Reverts on division by zero. The result is rounded towards zero.
Counterpart to Solidity's `/` operator. Note: this function uses a
`revert` opcode (which leaves remaining gas untouched) while Solidity
uses an invalid opcode to revert (consuming all remaining gas).
Requirements:
- The divisor cannot be zero.*


```solidity
function div(uint256 a, uint256 b) internal pure returns (uint256);
```

### div

*Returns the integer division of two unsigned integers.
Reverts with custom message on division by zero. The result is rounded towards zero.
Counterpart to Solidity's `/` operator. Note: this function uses a
`revert` opcode (which leaves remaining gas untouched) while Solidity
uses an invalid opcode to revert (consuming all remaining gas).
Requirements:
- The divisor cannot be zero.*


```solidity
function div(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256);
```

### mod

*Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
Reverts when dividing by zero.
Counterpart to Solidity's `%` operator. This function uses a `revert`
opcode (which leaves remaining gas untouched) while Solidity uses an
invalid opcode to revert (consuming all remaining gas).
Requirements:
- The divisor cannot be zero.*


```solidity
function mod(uint256 a, uint256 b) internal pure returns (uint256);
```

### mod

*Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
Reverts with custom message when dividing by zero.
Counterpart to Solidity's `%` operator. This function uses a `revert`
opcode (which leaves remaining gas untouched) while Solidity uses an
invalid opcode to revert (consuming all remaining gas).
Requirements:
- The divisor cannot be zero.*


```solidity
function mod(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256);
```

