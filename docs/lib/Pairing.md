


## Functions
### P1
```solidity
  function P1(
  ) internal returns (struct Pairing.G1Point)
```



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`the`|  | generator of G1
### P2
```solidity
  function P2(
  ) internal returns (struct Pairing.G2Point)
```



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`the`|  | generator of G2
### negate
```solidity
  function negate(
  ) internal returns (struct Pairing.G1Point r)
```



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`r`| struct Pairing.G1Point | the negation of p, i.e. p.addition(p.negate()) should be zero.
### addition
```solidity
  function addition(
  ) internal returns (struct Pairing.G1Point r)
```



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`r`| struct Pairing.G1Point | the sum of two points of G1
### scalar_mul
```solidity
  function scalar_mul(
  ) internal returns (struct Pairing.G1Point r)
```



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`r`| struct Pairing.G1Point | the product of a point on G1 and a scalar, i.e.
p == p.scalar_mul(1) and p.addition(p) == p.scalar_mul(2) for all points p.
### pairing
```solidity
  function pairing(
  ) internal returns (bool)
```



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`the`| struct Pairing.G1Point[] | result of computing the pairing check
e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
For example pairing([P1(), P1().negate()], [P2(), P2()]) should
return true.
### pairingProd2
```solidity
  function pairingProd2(
  ) internal returns (bool)
```
Convenience method for a pairing check for two pairs.



### pairingProd3
```solidity
  function pairingProd3(
  ) internal returns (bool)
```
Convenience method for a pairing check for three pairs.



### pairingProd4
```solidity
  function pairingProd4(
  ) internal returns (bool)
```
Convenience method for a pairing check for four pairs.



