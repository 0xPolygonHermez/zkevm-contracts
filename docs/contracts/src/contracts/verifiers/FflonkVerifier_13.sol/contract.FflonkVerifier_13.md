# FflonkVerifier_13
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/verifiers/FflonkVerifier_13.sol)


## State Variables
### n

```solidity
uint32 constant n = 16777216;
```


### k1

```solidity
uint256 constant k1 = 2;
```


### k2

```solidity
uint256 constant k2 = 3;
```


### w1

```solidity
uint256 constant w1 = 5709868443893258075976348696661355716898495876243883251619397131511003808859;
```


### wr

```solidity
uint256 constant wr = 18200100796661656210024324131237448517259556535315737226009542456080026430510;
```


### w3

```solidity
uint256 constant w3 = 21888242871839275217838484774961031246154997185409878258781734729429964517155;
```


### w3_2

```solidity
uint256 constant w3_2 = 4407920970296243842393367215006156084916469457145843978461;
```


### w4

```solidity
uint256 constant w4 = 21888242871839275217838484774961031246007050428528088939761107053157389710902;
```


### w4_2

```solidity
uint256 constant w4_2 = 21888242871839275222246405745257275088548364400416034343698204186575808495616;
```


### w4_3

```solidity
uint256 constant w4_3 = 4407920970296243842541313971887945403937097133418418784715;
```


### w8_1

```solidity
uint256 constant w8_1 = 19540430494807482326159819597004422086093766032135589407132600596362845576832;
```


### w8_2

```solidity
uint256 constant w8_2 = 21888242871839275217838484774961031246007050428528088939761107053157389710902;
```


### w8_3

```solidity
uint256 constant w8_3 = 13274704216607947843011480449124596415239537050559949017414504948711435969894;
```


### w8_4

```solidity
uint256 constant w8_4 = 21888242871839275222246405745257275088548364400416034343698204186575808495616;
```


### w8_5

```solidity
uint256 constant w8_5 = 2347812377031792896086586148252853002454598368280444936565603590212962918785;
```


### w8_6

```solidity
uint256 constant w8_6 = 4407920970296243842541313971887945403937097133418418784715;
```


### w8_7

```solidity
uint256 constant w8_7 = 8613538655231327379234925296132678673308827349856085326283699237864372525723;
```


### C0x

```solidity
uint256 constant C0x = 13979175079588675506680419163737534969820328203352260322294459421414714595611;
```


### C0y

```solidity
uint256 constant C0y = 18009742543832671334106659031569207850149449016303412599494859844148229216194;
```


### X2x1

```solidity
uint256 constant X2x1 = 21831381940315734285607113342023901060522397560371972897001948545212302161822;
```


### X2x2

```solidity
uint256 constant X2x2 = 17231025384763736816414546592865244497437017442647097510447326538965263639101;
```


### X2y1

```solidity
uint256 constant X2y1 = 2388026358213174446665280700919698872609886601280537296205114254867301080648;
```


### X2y2

```solidity
uint256 constant X2y2 = 11507326595632554467052522095592665270651932854513688777769618397986436103170;
```


### q

```solidity
uint256 constant q = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
```


### qf

```solidity
uint256 constant qf = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
```


### G1x

```solidity
uint256 constant G1x = 1;
```


### G1y

```solidity
uint256 constant G1y = 2;
```


### G2x1

```solidity
uint256 constant G2x1 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
```


### G2x2

```solidity
uint256 constant G2x2 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
```


### G2y1

```solidity
uint256 constant G2y1 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
```


### G2y2

```solidity
uint256 constant G2y2 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
```


### pC1

```solidity
uint16 constant pC1 = 4 + 0;
```


### pC2

```solidity
uint16 constant pC2 = 4 + 32 * 2;
```


### pW1

```solidity
uint16 constant pW1 = 4 + 32 * 4;
```


### pW2

```solidity
uint16 constant pW2 = 4 + 32 * 6;
```


### pEval_ql

```solidity
uint16 constant pEval_ql = 4 + 32 * 8;
```


### pEval_qr

```solidity
uint16 constant pEval_qr = 4 + 32 * 9;
```


### pEval_qm

```solidity
uint16 constant pEval_qm = 4 + 32 * 10;
```


### pEval_qo

```solidity
uint16 constant pEval_qo = 4 + 32 * 11;
```


### pEval_qc

```solidity
uint16 constant pEval_qc = 4 + 32 * 12;
```


### pEval_s1

```solidity
uint16 constant pEval_s1 = 4 + 32 * 13;
```


### pEval_s2

```solidity
uint16 constant pEval_s2 = 4 + 32 * 14;
```


### pEval_s3

```solidity
uint16 constant pEval_s3 = 4 + 32 * 15;
```


### pEval_a

```solidity
uint16 constant pEval_a = 4 + 32 * 16;
```


### pEval_b

```solidity
uint16 constant pEval_b = 4 + 32 * 17;
```


### pEval_c

```solidity
uint16 constant pEval_c = 4 + 32 * 18;
```


### pEval_z

```solidity
uint16 constant pEval_z = 4 + 32 * 19;
```


### pEval_zw

```solidity
uint16 constant pEval_zw = 4 + 32 * 20;
```


### pEval_t1w

```solidity
uint16 constant pEval_t1w = 4 + 32 * 21;
```


### pEval_t2w

```solidity
uint16 constant pEval_t2w = 4 + 32 * 22;
```


### pEval_inv

```solidity
uint16 constant pEval_inv = 4 + 32 * 23;
```


### pAlpha

```solidity
uint16 constant pAlpha = 0;
```


### pBeta

```solidity
uint16 constant pBeta = 32;
```


### pGamma

```solidity
uint16 constant pGamma = 64;
```


### pY

```solidity
uint16 constant pY = 96;
```


### pXiSeed

```solidity
uint16 constant pXiSeed = 128;
```


### pXiSeed2

```solidity
uint16 constant pXiSeed2 = 160;
```


### pXi

```solidity
uint16 constant pXi = 192;
```


### pH0w8_0

```solidity
uint16 constant pH0w8_0 = 224;
```


### pH0w8_1

```solidity
uint16 constant pH0w8_1 = 256;
```


### pH0w8_2

```solidity
uint16 constant pH0w8_2 = 288;
```


### pH0w8_3

```solidity
uint16 constant pH0w8_3 = 320;
```


### pH0w8_4

```solidity
uint16 constant pH0w8_4 = 352;
```


### pH0w8_5

```solidity
uint16 constant pH0w8_5 = 384;
```


### pH0w8_6

```solidity
uint16 constant pH0w8_6 = 416;
```


### pH0w8_7

```solidity
uint16 constant pH0w8_7 = 448;
```


### pH1w4_0

```solidity
uint16 constant pH1w4_0 = 480;
```


### pH1w4_1

```solidity
uint16 constant pH1w4_1 = 512;
```


### pH1w4_2

```solidity
uint16 constant pH1w4_2 = 544;
```


### pH1w4_3

```solidity
uint16 constant pH1w4_3 = 576;
```


### pH2w3_0

```solidity
uint16 constant pH2w3_0 = 608;
```


### pH2w3_1

```solidity
uint16 constant pH2w3_1 = 640;
```


### pH2w3_2

```solidity
uint16 constant pH2w3_2 = 672;
```


### pH3w3_0

```solidity
uint16 constant pH3w3_0 = 704;
```


### pH3w3_1

```solidity
uint16 constant pH3w3_1 = 736;
```


### pH3w3_2

```solidity
uint16 constant pH3w3_2 = 768;
```


### pPi

```solidity
uint16 constant pPi = 800;
```


### pR0

```solidity
uint16 constant pR0 = 832;
```


### pR1

```solidity
uint16 constant pR1 = 864;
```


### pR2

```solidity
uint16 constant pR2 = 896;
```


### pF

```solidity
uint16 constant pF = 928;
```


### pE

```solidity
uint16 constant pE = 992;
```


### pJ

```solidity
uint16 constant pJ = 1056;
```


### pZh

```solidity
uint16 constant pZh = 1184;
```


### pZhInv

```solidity
uint16 constant pZhInv = 1216;
```


### pDenH1

```solidity
uint16 constant pDenH1 = 1248;
```


### pDenH2

```solidity
uint16 constant pDenH2 = 1280;
```


### pLiS0Inv

```solidity
uint16 constant pLiS0Inv = 1312;
```


### pLiS1Inv

```solidity
uint16 constant pLiS1Inv = 1568;
```


### pLiS2Inv

```solidity
uint16 constant pLiS2Inv = 1696;
```


### pEval_l1

```solidity
uint16 constant pEval_l1 = 1888;
```


### lastMem

```solidity
uint16 constant lastMem = 1920;
```


## Functions
### verifyProof


```solidity
function verifyProof(bytes32[24] calldata proof, uint256[1] calldata pubSignals) public view returns (bool);
```

