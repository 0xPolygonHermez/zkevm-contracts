# PlonkVerifier
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/verifiers/v4.0.0-rc.3/PlonkVerifier.sol)


## State Variables
### R_MOD

```solidity
uint256 private constant R_MOD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
```


### R_MOD_MINUS_ONE

```solidity
uint256 private constant R_MOD_MINUS_ONE = 21888242871839275222246405745257275088548364400416034343698204186575808495616;
```


### P_MOD

```solidity
uint256 private constant P_MOD = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
```


### G2_SRS_0_X_0

```solidity
uint256 private constant G2_SRS_0_X_0 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
```


### G2_SRS_0_X_1

```solidity
uint256 private constant G2_SRS_0_X_1 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
```


### G2_SRS_0_Y_0

```solidity
uint256 private constant G2_SRS_0_Y_0 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
```


### G2_SRS_0_Y_1

```solidity
uint256 private constant G2_SRS_0_Y_1 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
```


### G2_SRS_1_X_0

```solidity
uint256 private constant G2_SRS_1_X_0 = 15805639136721018565402881920352193254830339253282065586954346329754995870280;
```


### G2_SRS_1_X_1

```solidity
uint256 private constant G2_SRS_1_X_1 = 19089565590083334368588890253123139704298730990782503769911324779715431555531;
```


### G2_SRS_1_Y_0

```solidity
uint256 private constant G2_SRS_1_Y_0 = 9779648407879205346559610309258181044130619080926897934572699915909528404984;
```


### G2_SRS_1_Y_1

```solidity
uint256 private constant G2_SRS_1_Y_1 = 6779728121489434657638426458390319301070371227460768374343986326751507916979;
```


### G1_SRS_X

```solidity
uint256 private constant G1_SRS_X = 14312776538779914388377568895031746459131577658076416373430523308756343304251;
```


### G1_SRS_Y

```solidity
uint256 private constant G1_SRS_Y = 11763105256161367503191792604679297387056316997144156930871823008787082098465;
```


### VK_NB_PUBLIC_INPUTS

```solidity
uint256 private constant VK_NB_PUBLIC_INPUTS = 2;
```


### VK_DOMAIN_SIZE

```solidity
uint256 private constant VK_DOMAIN_SIZE = 16777216;
```


### VK_INV_DOMAIN_SIZE

```solidity
uint256 private constant VK_INV_DOMAIN_SIZE =
    21888241567198334088790460357988866238279339518792980768180410072331574733841;
```


### VK_OMEGA

```solidity
uint256 private constant VK_OMEGA = 5709868443893258075976348696661355716898495876243883251619397131511003808859;
```


### VK_QL_COM_X

```solidity
uint256 private constant VK_QL_COM_X = 17984004271810887111892332882651374483612811613160171882231530673955342124072;
```


### VK_QL_COM_Y

```solidity
uint256 private constant VK_QL_COM_Y = 13277994607875064672295433418223618455646015691912141325106751561841646085822;
```


### VK_QR_COM_X

```solidity
uint256 private constant VK_QR_COM_X = 16336286973672788525637509231329701034039020185740400021577697914995487271901;
```


### VK_QR_COM_Y

```solidity
uint256 private constant VK_QR_COM_Y = 88284377293612431075210969180485407669835075356048788125030179865751136579;
```


### VK_QM_COM_X

```solidity
uint256 private constant VK_QM_COM_X = 10856514239855788242760873537198968126773773371401212930763195728908952457266;
```


### VK_QM_COM_Y

```solidity
uint256 private constant VK_QM_COM_Y = 9275209459688740642101488227886989724826404626746083670876354123229317070279;
```


### VK_QO_COM_X

```solidity
uint256 private constant VK_QO_COM_X = 11483266664351462882096699260743761962335837409017508503826409502538996076321;
```


### VK_QO_COM_Y

```solidity
uint256 private constant VK_QO_COM_Y = 17394959804451514544078291653193154652690985857122468223674247897665667008225;
```


### VK_QK_COM_X

```solidity
uint256 private constant VK_QK_COM_X = 6378083169737830823085597784511445554718388062388953364429190548392020833332;
```


### VK_QK_COM_Y

```solidity
uint256 private constant VK_QK_COM_Y = 12423874058816725405347015291038805106767729770869142043443023930694783565135;
```


### VK_S1_COM_X

```solidity
uint256 private constant VK_S1_COM_X = 8432363989348148399267595343996871949745756313266171098803972147558566645391;
```


### VK_S1_COM_Y

```solidity
uint256 private constant VK_S1_COM_Y = 21830041218908693046173167152196424202345484683169853420596524951634570306585;
```


### VK_S2_COM_X

```solidity
uint256 private constant VK_S2_COM_X = 2889872191603241225798623124219684248629415321428218534303823116357979417612;
```


### VK_S2_COM_Y

```solidity
uint256 private constant VK_S2_COM_Y = 8446598484540146291961338772594737249603462456099116591415979984815127389111;
```


### VK_S3_COM_X

```solidity
uint256 private constant VK_S3_COM_X = 12894021857927799668653295424700631150139887020229360316861211114803005826079;
```


### VK_S3_COM_Y

```solidity
uint256 private constant VK_S3_COM_Y = 5332155988317853016248818837542073627058808403298822656476772250044723938116;
```


### VK_COSET_SHIFT

```solidity
uint256 private constant VK_COSET_SHIFT = 5;
```


### VK_QCP_0_X

```solidity
uint256 private constant VK_QCP_0_X = 16113316688614670925300831064391815772431716488200414163545127725991745431527;
```


### VK_QCP_0_Y

```solidity
uint256 private constant VK_QCP_0_Y = 18613967203673816695007264416375047840688367875268537453854528850830700989951;
```


### VK_INDEX_COMMIT_API_0

```solidity
uint256 private constant VK_INDEX_COMMIT_API_0 = 10853426;
```


### VK_NB_CUSTOM_GATES

```solidity
uint256 private constant VK_NB_CUSTOM_GATES = 1;
```


### FIXED_PROOF_SIZE

```solidity
uint256 private constant FIXED_PROOF_SIZE = 0x300;
```


### PROOF_L_COM_X

```solidity
uint256 private constant PROOF_L_COM_X = 0x0;
```


### PROOF_L_COM_Y

```solidity
uint256 private constant PROOF_L_COM_Y = 0x20;
```


### PROOF_R_COM_X

```solidity
uint256 private constant PROOF_R_COM_X = 0x40;
```


### PROOF_R_COM_Y

```solidity
uint256 private constant PROOF_R_COM_Y = 0x60;
```


### PROOF_O_COM_X

```solidity
uint256 private constant PROOF_O_COM_X = 0x80;
```


### PROOF_O_COM_Y

```solidity
uint256 private constant PROOF_O_COM_Y = 0xa0;
```


### PROOF_H_0_COM_X

```solidity
uint256 private constant PROOF_H_0_COM_X = 0xc0;
```


### PROOF_H_0_COM_Y

```solidity
uint256 private constant PROOF_H_0_COM_Y = 0xe0;
```


### PROOF_H_1_COM_X

```solidity
uint256 private constant PROOF_H_1_COM_X = 0x100;
```


### PROOF_H_1_COM_Y

```solidity
uint256 private constant PROOF_H_1_COM_Y = 0x120;
```


### PROOF_H_2_COM_X

```solidity
uint256 private constant PROOF_H_2_COM_X = 0x140;
```


### PROOF_H_2_COM_Y

```solidity
uint256 private constant PROOF_H_2_COM_Y = 0x160;
```


### PROOF_L_AT_ZETA

```solidity
uint256 private constant PROOF_L_AT_ZETA = 0x180;
```


### PROOF_R_AT_ZETA

```solidity
uint256 private constant PROOF_R_AT_ZETA = 0x1a0;
```


### PROOF_O_AT_ZETA

```solidity
uint256 private constant PROOF_O_AT_ZETA = 0x1c0;
```


### PROOF_S1_AT_ZETA

```solidity
uint256 private constant PROOF_S1_AT_ZETA = 0x1e0;
```


### PROOF_S2_AT_ZETA

```solidity
uint256 private constant PROOF_S2_AT_ZETA = 0x200;
```


### PROOF_GRAND_PRODUCT_COMMITMENT_X

```solidity
uint256 private constant PROOF_GRAND_PRODUCT_COMMITMENT_X = 0x220;
```


### PROOF_GRAND_PRODUCT_COMMITMENT_Y

```solidity
uint256 private constant PROOF_GRAND_PRODUCT_COMMITMENT_Y = 0x240;
```


### PROOF_GRAND_PRODUCT_AT_ZETA_OMEGA

```solidity
uint256 private constant PROOF_GRAND_PRODUCT_AT_ZETA_OMEGA = 0x260;
```


### PROOF_BATCH_OPENING_AT_ZETA_X

```solidity
uint256 private constant PROOF_BATCH_OPENING_AT_ZETA_X = 0x280;
```


### PROOF_BATCH_OPENING_AT_ZETA_Y

```solidity
uint256 private constant PROOF_BATCH_OPENING_AT_ZETA_Y = 0x2a0;
```


### PROOF_OPENING_AT_ZETA_OMEGA_X

```solidity
uint256 private constant PROOF_OPENING_AT_ZETA_OMEGA_X = 0x2c0;
```


### PROOF_OPENING_AT_ZETA_OMEGA_Y

```solidity
uint256 private constant PROOF_OPENING_AT_ZETA_OMEGA_Y = 0x2e0;
```


### PROOF_OPENING_QCP_AT_ZETA

```solidity
uint256 private constant PROOF_OPENING_QCP_AT_ZETA = 0x300;
```


### PROOF_BSB_COMMITMENTS

```solidity
uint256 private constant PROOF_BSB_COMMITMENTS = 0x320;
```


### STATE_ALPHA

```solidity
uint256 private constant STATE_ALPHA = 0x0;
```


### STATE_BETA

```solidity
uint256 private constant STATE_BETA = 0x20;
```


### STATE_GAMMA

```solidity
uint256 private constant STATE_GAMMA = 0x40;
```


### STATE_ZETA

```solidity
uint256 private constant STATE_ZETA = 0x60;
```


### STATE_ALPHA_SQUARE_LAGRANGE_0

```solidity
uint256 private constant STATE_ALPHA_SQUARE_LAGRANGE_0 = 0x80;
```


### STATE_FOLDED_H_X

```solidity
uint256 private constant STATE_FOLDED_H_X = 0xa0;
```


### STATE_FOLDED_H_Y

```solidity
uint256 private constant STATE_FOLDED_H_Y = 0xc0;
```


### STATE_LINEARISED_POLYNOMIAL_X

```solidity
uint256 private constant STATE_LINEARISED_POLYNOMIAL_X = 0xe0;
```


### STATE_LINEARISED_POLYNOMIAL_Y

```solidity
uint256 private constant STATE_LINEARISED_POLYNOMIAL_Y = 0x100;
```


### STATE_OPENING_LINEARISED_POLYNOMIAL_ZETA

```solidity
uint256 private constant STATE_OPENING_LINEARISED_POLYNOMIAL_ZETA = 0x120;
```


### STATE_FOLDED_CLAIMED_VALUES

```solidity
uint256 private constant STATE_FOLDED_CLAIMED_VALUES = 0x140;
```


### STATE_FOLDED_DIGESTS_X

```solidity
uint256 private constant STATE_FOLDED_DIGESTS_X = 0x160;
```


### STATE_FOLDED_DIGESTS_Y

```solidity
uint256 private constant STATE_FOLDED_DIGESTS_Y = 0x180;
```


### STATE_PI

```solidity
uint256 private constant STATE_PI = 0x1a0;
```


### STATE_ZETA_POWER_N_MINUS_ONE

```solidity
uint256 private constant STATE_ZETA_POWER_N_MINUS_ONE = 0x1c0;
```


### STATE_GAMMA_KZG

```solidity
uint256 private constant STATE_GAMMA_KZG = 0x1e0;
```


### STATE_SUCCESS

```solidity
uint256 private constant STATE_SUCCESS = 0x200;
```


### STATE_CHECK_VAR

```solidity
uint256 private constant STATE_CHECK_VAR = 0x220;
```


### STATE_LAST_MEM

```solidity
uint256 private constant STATE_LAST_MEM = 0x240;
```


### FS_ALPHA

```solidity
uint256 private constant FS_ALPHA = 0x616C706861;
```


### FS_BETA

```solidity
uint256 private constant FS_BETA = 0x62657461;
```


### FS_GAMMA

```solidity
uint256 private constant FS_GAMMA = 0x67616d6d61;
```


### FS_ZETA

```solidity
uint256 private constant FS_ZETA = 0x7a657461;
```


### FS_GAMMA_KZG

```solidity
uint256 private constant FS_GAMMA_KZG = 0x67616d6d61;
```


### ERROR_STRING_ID

```solidity
uint256 private constant ERROR_STRING_ID = 0x08c379a000000000000000000000000000000000000000000000000000000000;
```


### HASH_FR_BB

```solidity
uint256 private constant HASH_FR_BB = 340282366920938463463374607431768211456;
```


### HASH_FR_ZERO_UINT256

```solidity
uint256 private constant HASH_FR_ZERO_UINT256 = 0;
```


### HASH_FR_LEN_IN_BYTES

```solidity
uint8 private constant HASH_FR_LEN_IN_BYTES = 48;
```


### HASH_FR_SIZE_DOMAIN

```solidity
uint8 private constant HASH_FR_SIZE_DOMAIN = 11;
```


### HASH_FR_ONE

```solidity
uint8 private constant HASH_FR_ONE = 1;
```


### HASH_FR_TWO

```solidity
uint8 private constant HASH_FR_TWO = 2;
```


### SHA2

```solidity
uint8 private constant SHA2 = 0x2;
```


### MOD_EXP

```solidity
uint8 private constant MOD_EXP = 0x5;
```


### EC_ADD

```solidity
uint8 private constant EC_ADD = 0x6;
```


### EC_MUL

```solidity
uint8 private constant EC_MUL = 0x7;
```


### EC_PAIR

```solidity
uint8 private constant EC_PAIR = 0x8;
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


