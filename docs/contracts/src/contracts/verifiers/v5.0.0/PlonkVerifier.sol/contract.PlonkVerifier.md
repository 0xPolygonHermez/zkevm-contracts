# PlonkVerifier
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/verifiers/v5.0.0/PlonkVerifier.sol)


## State Variables
### R_MOD

```solidity
uint256 private constant R_MOD = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```


### R_MOD_MINUS_ONE

```solidity
uint256 private constant R_MOD_MINUS_ONE =
    21888242871839275222246405745257275088548364400416034343698204186575808495616
```


### P_MOD

```solidity
uint256 private constant P_MOD = 21888242871839275222246405745257275088696311157297823662689037894645226208583
```


### G2_SRS_0_X_0

```solidity
uint256 private constant G2_SRS_0_X_0 =
    11559732032986387107991004021392285783925812861821192530917403151452391805634
```


### G2_SRS_0_X_1

```solidity
uint256 private constant G2_SRS_0_X_1 =
    10857046999023057135944570762232829481370756359578518086990519993285655852781
```


### G2_SRS_0_Y_0

```solidity
uint256 private constant G2_SRS_0_Y_0 =
    4082367875863433681332203403145435568316851327593401208105741076214120093531
```


### G2_SRS_0_Y_1

```solidity
uint256 private constant G2_SRS_0_Y_1 =
    8495653923123431417604973247489272438418190587263600148770280649306958101930
```


### G2_SRS_1_X_0

```solidity
uint256 private constant G2_SRS_1_X_0 =
    15805639136721018565402881920352193254830339253282065586954346329754995870280
```


### G2_SRS_1_X_1

```solidity
uint256 private constant G2_SRS_1_X_1 =
    19089565590083334368588890253123139704298730990782503769911324779715431555531
```


### G2_SRS_1_Y_0

```solidity
uint256 private constant G2_SRS_1_Y_0 =
    9779648407879205346559610309258181044130619080926897934572699915909528404984
```


### G2_SRS_1_Y_1

```solidity
uint256 private constant G2_SRS_1_Y_1 =
    6779728121489434657638426458390319301070371227460768374343986326751507916979
```


### G1_SRS_X

```solidity
uint256 private constant G1_SRS_X = 14312776538779914388377568895031746459131577658076416373430523308756343304251
```


### G1_SRS_Y

```solidity
uint256 private constant G1_SRS_Y = 11763105256161367503191792604679297387056316997144156930871823008787082098465
```


### VK_NB_PUBLIC_INPUTS

```solidity
uint256 private constant VK_NB_PUBLIC_INPUTS = 2
```


### VK_DOMAIN_SIZE

```solidity
uint256 private constant VK_DOMAIN_SIZE = 16777216
```


### VK_INV_DOMAIN_SIZE

```solidity
uint256 private constant VK_INV_DOMAIN_SIZE =
    21888241567198334088790460357988866238279339518792980768180410072331574733841
```


### VK_OMEGA

```solidity
uint256 private constant VK_OMEGA = 5709868443893258075976348696661355716898495876243883251619397131511003808859
```


### VK_QL_COM_X

```solidity
uint256 private constant VK_QL_COM_X = 2714773032566361735398260413518107570706289019141573602093747023461681138141
```


### VK_QL_COM_Y

```solidity
uint256 private constant VK_QL_COM_Y =
    10207220609888567477852282724812707756861966294950666667119692155077205992894
```


### VK_QR_COM_X

```solidity
uint256 private constant VK_QR_COM_X =
    17919274808167168584263187859012763816365260341587621260815379357637476029962
```


### VK_QR_COM_Y

```solidity
uint256 private constant VK_QR_COM_Y =
    14558165337321799812085033100515533981610351056305142204990949940017867076397
```


### VK_QM_COM_X

```solidity
uint256 private constant VK_QM_COM_X = 1814703450159964740292891910795980721108620081843240976053374083376051887455
```


### VK_QM_COM_Y

```solidity
uint256 private constant VK_QM_COM_Y =
    11252528960397523304289223453506717847025678682133692300385063157160041127070
```


### VK_QO_COM_X

```solidity
uint256 private constant VK_QO_COM_X =
    20843277058771674275997213106654908867381045039357421108797602213552545033079
```


### VK_QO_COM_Y

```solidity
uint256 private constant VK_QO_COM_Y = 9646775541123942436366130063934415659078920798926708026864638413383214238671
```


### VK_QK_COM_X

```solidity
uint256 private constant VK_QK_COM_X = 5484717465597821820411103650564499774744032473047103693751158150047197753654
```


### VK_QK_COM_Y

```solidity
uint256 private constant VK_QK_COM_Y = 5561799343038529497262757012400750786503050088440144551259537360162821571059
```


### VK_S1_COM_X

```solidity
uint256 private constant VK_S1_COM_X =
    16111562061301112215931665617877464360548491176332584512747295033804502769274
```


### VK_S1_COM_Y

```solidity
uint256 private constant VK_S1_COM_Y =
    15035232142063390140879951391784254536324051421746307325879221184372296043705
```


### VK_S2_COM_X

```solidity
uint256 private constant VK_S2_COM_X = 899944321381010541211546037826620464002745326050515852312919625047231523882
```


### VK_S2_COM_Y

```solidity
uint256 private constant VK_S2_COM_Y = 61717668739330555376092528203839789132705738484346798874082062974863965392
```


### VK_S3_COM_X

```solidity
uint256 private constant VK_S3_COM_X = 9316901462569250008665217603385561854185385862824092362271612343176126127375
```


### VK_S3_COM_Y

```solidity
uint256 private constant VK_S3_COM_Y =
    13799900238612879579721466063922041459340434537392216736920805107993374657577
```


### VK_COSET_SHIFT

```solidity
uint256 private constant VK_COSET_SHIFT = 5
```


### VK_QCP_0_X

```solidity
uint256 private constant VK_QCP_0_X = 21578473557091588309361521643625606794648013014197133181947992670819103775934
```


### VK_QCP_0_Y

```solidity
uint256 private constant VK_QCP_0_Y = 18236588362476326695195531997097392315059481348147701548685746610417604595065
```


### VK_INDEX_COMMIT_API_0

```solidity
uint256 private constant VK_INDEX_COMMIT_API_0 = 10900304
```


### VK_NB_CUSTOM_GATES

```solidity
uint256 private constant VK_NB_CUSTOM_GATES = 1
```


### FIXED_PROOF_SIZE

```solidity
uint256 private constant FIXED_PROOF_SIZE = 0x300
```


### PROOF_L_COM_X

```solidity
uint256 private constant PROOF_L_COM_X = 0x0
```


### PROOF_L_COM_Y

```solidity
uint256 private constant PROOF_L_COM_Y = 0x20
```


### PROOF_R_COM_X

```solidity
uint256 private constant PROOF_R_COM_X = 0x40
```


### PROOF_R_COM_Y

```solidity
uint256 private constant PROOF_R_COM_Y = 0x60
```


### PROOF_O_COM_X

```solidity
uint256 private constant PROOF_O_COM_X = 0x80
```


### PROOF_O_COM_Y

```solidity
uint256 private constant PROOF_O_COM_Y = 0xa0
```


### PROOF_H_0_COM_X

```solidity
uint256 private constant PROOF_H_0_COM_X = 0xc0
```


### PROOF_H_0_COM_Y

```solidity
uint256 private constant PROOF_H_0_COM_Y = 0xe0
```


### PROOF_H_1_COM_X

```solidity
uint256 private constant PROOF_H_1_COM_X = 0x100
```


### PROOF_H_1_COM_Y

```solidity
uint256 private constant PROOF_H_1_COM_Y = 0x120
```


### PROOF_H_2_COM_X

```solidity
uint256 private constant PROOF_H_2_COM_X = 0x140
```


### PROOF_H_2_COM_Y

```solidity
uint256 private constant PROOF_H_2_COM_Y = 0x160
```


### PROOF_L_AT_ZETA

```solidity
uint256 private constant PROOF_L_AT_ZETA = 0x180
```


### PROOF_R_AT_ZETA

```solidity
uint256 private constant PROOF_R_AT_ZETA = 0x1a0
```


### PROOF_O_AT_ZETA

```solidity
uint256 private constant PROOF_O_AT_ZETA = 0x1c0
```


### PROOF_S1_AT_ZETA

```solidity
uint256 private constant PROOF_S1_AT_ZETA = 0x1e0
```


### PROOF_S2_AT_ZETA

```solidity
uint256 private constant PROOF_S2_AT_ZETA = 0x200
```


### PROOF_GRAND_PRODUCT_COMMITMENT_X

```solidity
uint256 private constant PROOF_GRAND_PRODUCT_COMMITMENT_X = 0x220
```


### PROOF_GRAND_PRODUCT_COMMITMENT_Y

```solidity
uint256 private constant PROOF_GRAND_PRODUCT_COMMITMENT_Y = 0x240
```


### PROOF_GRAND_PRODUCT_AT_ZETA_OMEGA

```solidity
uint256 private constant PROOF_GRAND_PRODUCT_AT_ZETA_OMEGA = 0x260
```


### PROOF_BATCH_OPENING_AT_ZETA_X

```solidity
uint256 private constant PROOF_BATCH_OPENING_AT_ZETA_X = 0x280
```


### PROOF_BATCH_OPENING_AT_ZETA_Y

```solidity
uint256 private constant PROOF_BATCH_OPENING_AT_ZETA_Y = 0x2a0
```


### PROOF_OPENING_AT_ZETA_OMEGA_X

```solidity
uint256 private constant PROOF_OPENING_AT_ZETA_OMEGA_X = 0x2c0
```


### PROOF_OPENING_AT_ZETA_OMEGA_Y

```solidity
uint256 private constant PROOF_OPENING_AT_ZETA_OMEGA_Y = 0x2e0
```


### PROOF_OPENING_QCP_AT_ZETA

```solidity
uint256 private constant PROOF_OPENING_QCP_AT_ZETA = 0x300
```


### PROOF_BSB_COMMITMENTS

```solidity
uint256 private constant PROOF_BSB_COMMITMENTS = 0x320
```


### STATE_ALPHA

```solidity
uint256 private constant STATE_ALPHA = 0x0
```


### STATE_BETA

```solidity
uint256 private constant STATE_BETA = 0x20
```


### STATE_GAMMA

```solidity
uint256 private constant STATE_GAMMA = 0x40
```


### STATE_ZETA

```solidity
uint256 private constant STATE_ZETA = 0x60
```


### STATE_ALPHA_SQUARE_LAGRANGE_0

```solidity
uint256 private constant STATE_ALPHA_SQUARE_LAGRANGE_0 = 0x80
```


### STATE_FOLDED_H_X

```solidity
uint256 private constant STATE_FOLDED_H_X = 0xa0
```


### STATE_FOLDED_H_Y

```solidity
uint256 private constant STATE_FOLDED_H_Y = 0xc0
```


### STATE_LINEARISED_POLYNOMIAL_X

```solidity
uint256 private constant STATE_LINEARISED_POLYNOMIAL_X = 0xe0
```


### STATE_LINEARISED_POLYNOMIAL_Y

```solidity
uint256 private constant STATE_LINEARISED_POLYNOMIAL_Y = 0x100
```


### STATE_OPENING_LINEARISED_POLYNOMIAL_ZETA

```solidity
uint256 private constant STATE_OPENING_LINEARISED_POLYNOMIAL_ZETA = 0x120
```


### STATE_FOLDED_CLAIMED_VALUES

```solidity
uint256 private constant STATE_FOLDED_CLAIMED_VALUES = 0x140
```


### STATE_FOLDED_DIGESTS_X

```solidity
uint256 private constant STATE_FOLDED_DIGESTS_X = 0x160
```


### STATE_FOLDED_DIGESTS_Y

```solidity
uint256 private constant STATE_FOLDED_DIGESTS_Y = 0x180
```


### STATE_PI

```solidity
uint256 private constant STATE_PI = 0x1a0
```


### STATE_ZETA_POWER_N_MINUS_ONE

```solidity
uint256 private constant STATE_ZETA_POWER_N_MINUS_ONE = 0x1c0
```


### STATE_GAMMA_KZG

```solidity
uint256 private constant STATE_GAMMA_KZG = 0x1e0
```


### STATE_SUCCESS

```solidity
uint256 private constant STATE_SUCCESS = 0x200
```


### STATE_CHECK_VAR

```solidity
uint256 private constant STATE_CHECK_VAR = 0x220
```


### STATE_LAST_MEM

```solidity
uint256 private constant STATE_LAST_MEM = 0x240
```


### FS_ALPHA

```solidity
uint256 private constant FS_ALPHA = 0x616C706861
```


### FS_BETA

```solidity
uint256 private constant FS_BETA = 0x62657461
```


### FS_GAMMA

```solidity
uint256 private constant FS_GAMMA = 0x67616d6d61
```


### FS_ZETA

```solidity
uint256 private constant FS_ZETA = 0x7a657461
```


### FS_GAMMA_KZG

```solidity
uint256 private constant FS_GAMMA_KZG = 0x67616d6d61
```


### ERROR_STRING_ID

```solidity
uint256 private constant ERROR_STRING_ID = 0x08c379a000000000000000000000000000000000000000000000000000000000
```


### HASH_FR_BB

```solidity
uint256 private constant HASH_FR_BB = 340282366920938463463374607431768211456
```


### HASH_FR_ZERO_UINT256

```solidity
uint256 private constant HASH_FR_ZERO_UINT256 = 0
```


### HASH_FR_LEN_IN_BYTES

```solidity
uint8 private constant HASH_FR_LEN_IN_BYTES = 48
```


### HASH_FR_SIZE_DOMAIN

```solidity
uint8 private constant HASH_FR_SIZE_DOMAIN = 11
```


### HASH_FR_ONE

```solidity
uint8 private constant HASH_FR_ONE = 1
```


### HASH_FR_TWO

```solidity
uint8 private constant HASH_FR_TWO = 2
```


### SHA2

```solidity
uint8 private constant SHA2 = 0x2
```


### MOD_EXP

```solidity
uint8 private constant MOD_EXP = 0x5
```


### EC_ADD

```solidity
uint8 private constant EC_ADD = 0x6
```


### EC_MUL

```solidity
uint8 private constant EC_MUL = 0x7
```


### EC_PAIR

```solidity
uint8 private constant EC_PAIR = 0x8
```


## Functions
### Verify

Verify a Plonk proof.
Reverts if the proof or the public inputs are malformed.


```solidity
function Verify(bytes calldata proof, uint256[] calldata public_inputs) public view returns (bool success);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`proof`|`bytes`|serialised plonk proof (using gnark's MarshalSolidity)|
|`public_inputs`|`uint256[]`|(must be reduced)|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`success`|`bool`|true if the proof passes false otherwise|


