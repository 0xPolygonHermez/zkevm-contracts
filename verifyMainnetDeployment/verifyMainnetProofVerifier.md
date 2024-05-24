# Verify deployment on Mainnet the proof verifier smart contract (elderberry2-fork.9)

In order to verify the smart contract, you will need a machine with at least 256GB of RAM and 16 cores.

In this tutorial we will give instructions for a r6a.8xlarge aws instance. This instance has 16 cores 32 threads, 512GB of SSD. The instance will use Ubuntu 22.04 LTS and the cost of the instance is about 1.82 $/h. This process is quite long, it takes approximately 5-6 hours.

So lets start by launching and instance.

## Basic OS preparation

```bash
sudo apt update
sudo apt install -y tmux git curl jq
```

## Tweaking the OS to accept high amount of memory.

```bash
echo "vm.max_map_count=655300" | sudo tee -a /etc/sysctl.conf
sudo sysctl -w vm.max_map_count=655300
export NODE_OPTIONS="--max-old-space-size=230000"
```

## Install version of node and npm

```bash
curl -sL https://deb.nodesource.com/setup_18.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
```

The version of node should be: 18 (e.g. 18.19.0 )

## Download and prepare circom

To compile circuits, we need circom installed.

```bash
cd ~
git clone https://github.com/iden3/circom.git
cd circom
git checkout v2.1.8
git log --pretty=format:'%H' -n 1
```

The hash of the commit should be: f0deda416abe91e5dd906c55507c737cd9986ab5

Install and compile circom (RUST)

```bash
cd ~
sudo apt install -y cargo
cd circom
cargo build --release
cargo install --path circom
export PATH=$PATH:~/.cargo/bin
echo 'PATH=$PATH:~/.cargo/bin' >> ~/.profile
circom --version
```

The version of circom should be: 2.1.8

## Prepare fast build constant tree tool

```bash
cd ~
git clone https://github.com/0xPolygonHermez/zkevm-prover.git
cd zkevm-prover
git checkout 40cde45deacede2b10a91ce2dd926abd2ba67541
git submodule init
git submodule update
sudo apt install -y build-essential libomp-dev libgmp-dev nlohmann-json3-dev libpqxx-dev nasm libgrpc++-dev libprotobuf-dev grpc-proto libsodium-dev uuid-dev libsecp256k1-dev
make -j bctree
```

this step takes less than 1 minute.

## Prepare and launch setup (zkevm-proverjs)

```bash
cd ~
git clone https://github.com/0xPolygonHermez/zkevm-proverjs.git
cd zkevm-proverjs
git checkout c4a2ce7617cb34b2c119742c2adbcd11ac435ec4
npm install
tmux -c "npm run buildsetup --bctree=../zkevm-prover/build/bctree"
```

This step is quite long, it takes approximately 4.5 hours. 2 out of 4.5 hours are for the powersOfTau28_hez_final.ptau download, a file of 288GB that it's loaded only once.

> NOTE: At the end of the document there is a table with all the hashes of the files generated during this process.

## Compile generated verifier smartcontract (solidity)

As a final result of the previous steps, the smart contract that verifies the test has been generated. This file is _final.fflonk.verifier.sol_. At this point, it is possible to verify the smart contract using the source code or verify that the bytecode is the same. **To verify the bytecode**, you must compile with the precisely same version, compiler, and parameters to be sure that even the metadata hash contained in the bytecode is exactly the same. The following instructions generate a project to build using the **hardhat** tool.

```bash
cd ~
mkdir contract
cd contract
npm init -y
npm install hardhat
mkdir -p contracts/verifiers
```

To generate the same bycode it's important recover exactlly same options used during compilation, we found this information with contract information on etherscan (Settings).
Copy this information inside the file ~/contract/settings.json, as follows:

```bash
cd ~/contract
cat <<EOF >settings.json
{
  "optimizer": {
    "enabled": true,
    "runs": 999999
  },
  "evmVersion": "shanghai",
  "outputSelection": {
    "*": {
      "*": [
        "evm.bytecode",
        "evm.deployedBytecode",
        "devdoc",
        "userdoc",
        "metadata",
        "abi"
      ]
    }
  },
  "libraries": {}
}
EOF
```

After that, execute the following commands.

```bash
cd ~/contract
echo -e "module.exports={solidity:{compilers:[{version: \"0.8.20\",settings:$(cat settings.json)}]}}" > hardhat.config.js
```

Once the project structure is created, we proceed to copy the smart contract generated in the previous step. This smart contract was saved on _~/zkevm-proverjs/build/proof_, and must be copied to _contracts/verifiers_ with exactly the name _Verifier.sol_. If the name or the path changes, the hash of metadata changes too, for this reason, is essential to respect the name and the path. To do it could execute these commands

```bash
cd ~/contract
cp ~/zkevm-proverjs/build/proof/final.fflonk.verifier.sol contracts/verifiers/FflonkVerifier.sol
sha256sum contracts/verifiers/FflonkVerifier.sol
```

The result should be:

```
ad7faf985475359b115d73ba216e7f6feb9cb3181889e65f62e23904da40b33a
```

To compile smartcontract execute following command:

```bash
npx hardhat compile
```

> NOTE: During compilation warning is shown:
> Warning: Unused function parameter. Remove or comment out the variable name to silence this warning.
> --> contracts/verifiers/FflonkVerifier.sol:162:26:

Bytecode of smartcontract was on bytecode property of json file _FflonkVerifier_ generated on path _artifacts/contracts/verifiers/FflonkVerifier.sol/_

```
608060405234801561000f575f80fd5b506159c7
806200001e5f395ff3fe60806040523480156100
0f575f80fd5b5060043610610029575f3560e01c
80639121da8a1461002d575b5f80fd5b61004061
003b366004615950565b610054565b6040519015
15815260200160405180910390f35b5f6158e056
5b6040516104c08201518082526020820191507f
30644e72e131a029b85045b68181585d2833e848
79b9709143e1f593f00000016104e08401518209
90508082526020820191507f30644e72e131a029
:
:
5b61590f8161286e565b61591983826128a7565b
61592281612906565b61592b81613e54565b6159
3481614549565b61593d816151d0565b61594681
6156ce565b9050805f5260205ff35b5f80610320
808486031215615963575f80fd5b610300840185
811115615974575f80fd5b849350858286011115
615985575f80fd5b8092505050925092905056fe
a2646970667358221220f9204a6729ab3cfd7d00
8e42e9e609c5982c2ce36f4db2fdd5da2d7ad03d
505064736f6c63430008140033

```

Verify bytecode compiled:

```
cd ~/contract
cat ./artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier.json | jq .bytecode -r | tee FflonkVerifier.sol.compiled.bytecode | sha256sum
```

The result should be:

```
a830254dd0e50c7fb306d028c0fed5927027814c3151822d16f26e802615ecff
```

## Download bytecode of deployed smartcontract

To download bytecode of deployed smartcontract, need the address of smart contract, in this case it's _0x0775e11309d75aA6b0967917fB0213C5673eDf81_.

### Download by copying data manually

Go to Etherscan or Beaconcha to get transaction bytecode.

Associated with address _0x0775e11309d75aA6b0967917fB0213C5673eDf81_ found the transacction _0x99c654b2338dc6e9f438b82acd5eb8af2fa2d2fe69a387714f2b2fa935ee8dbe_.

-   ### Etherscan (https://etherscan.io)
    https://etherscan.io/address/0x0775e11309d75aA6b0967917fB0213C5673eDf81
    https://etherscan.io/tx/0x99c654b2338dc6e9f438b82acd5eb8af2fa2d2fe69a387714f2b2fa935ee8dbe


    Click to show more > Input Data > Select all data and copy to clipboard.

-   ### Beacocha (https://beaconcha.in)
    https://beaconcha.in/address/0x0775e11309d75aA6b0967917fB0213C5673eDf81
    https://beaconcha.in/tx/0x99c654b2338dc6e9f438b82acd5eb8af2fa2d2fe69a387714f2b2fa935ee8dbe

    Advanced Info > Call Data > Select all data and copy to clipboard.

_NOTE: Don't use button "Copy Raw Data" because it generated non compatible format._

Some applications running on the terminal may limit the amount of input they will accept before their input buffers overflow. To avoid this situation create file _FflonkVerifier.sol.explorer.bytecode_ with editor as nano or vi.

```bash
cd ~/contract
nano FflonkVerifier.sol.explorer.bytecode
```

In nano, to paste the clipboard to the file use CTRL+P, save content using CTRL+X, and finally press Y.

### Download through L1 endpoint call

Alternatively, to the previous step, you could download the bytecode through L1 endpoint call

```bash
cd ~/contract
L1_ENDPOINT=<YOUR_L1_ENDPOINT_HERE>
 curl -s -X POST -H "Content-Type: application/json" --data '{"method":"eth_getTransactionByHash","params":["0x6cc2cbf18cefe30ec2b4776b525e187f06f88bb52fe94c1b0dd2629b199fd9c9"], "id":1,"jsonrpc":"2.0"}' $L1_ENDPOINT | jq .result.input -r > FflonkVerifier.sol.explorer.bytecode
```

## Compare bytecodes

To compare if two files are the same, you could use diff.

```bash
cd ~/contract
diff FflonkVerifier.sol.compiled.bytecode FflonkVerifier.sol.explorer.bytecode
```

Alternatively, you could check content using sha256sum:

```bash
cd ~/contract
sha256sum FflonkVerifier.sol.*.bytecode
```

The result should be:

```
a830254dd0e50c7fb306d028c0fed5927027814c3151822d16f26e802615ecff  FflonkVerifier.sol.compiled.bytecode
a830254dd0e50c7fb306d028c0fed5927027814c3151822d16f26e802615ecff  FflonkVerifier.sol.explorer.bytecode
```

## Generated files hash

<font size=2>
<table>
<tr><th>step/file</th><th>sha256</th></tr>
<tr><td colspan=2><b>buildrom</b></td></tr>
<tr><td>rom.json</td><td>676c3f58263fc284bc53ef949dd1acedcfb090f3287ee080b2a277ed2157894a</td></tr>
<tr><td colspan=2><b>buildpil</b></td></tr>
<tr><td>main.pil.json</td><td>e6220953585202f5ecfaa8d7bb2fe3d06bf85fb0af22c2fe46a97abd39ae9aa7</td></tr>
<tr><td colspan=2><b>buildstoragerom</b></td></tr>
<tr><td>storage_sm_rom.json</td><td>676c3f58263fc284bc53ef949dd1acedcfb090f3287ee080b2a277ed2157894a</td></tr>
<tr><td colspan=2><b>buildconstants</b></td></tr>
<tr><td>zkevm.const</td><td>ca154acee3bf9b31bc5a66d919af95536397cb49c5785c8c77cc4e814097a1d7</td></tr>
<tr><td colspan=2><b>buildstarkinfo</b></td></tr>
<tr><td>zkevm.starkstruct.json</td><td>284b6ce275c637af4a0b4b10cd83a881c6f1b21e21ad7ea2276379ed8393b099</td></tr>
<tr><td>zkevm.starkinfo.json</td><td>cd4615be096817d14b3b19780897ad39f5cd26f83e5d17518dae7688563fcb54</td></tr>
<tr><td colspan=2><b>buildconstanttree</b></td></tr>
<tr><td>zkevm.verkey.json</td><td>5092fbb5581804e283ee328723f106ba3076c0df26feb1937759731e23870475</td></tr>
<tr><td>zkevm.consttree</td><td>ca154acee3bf9b31bc5a66d919af95536397cb49c5785c8c77cc4e814097a1d7</td></tr>
<tr><td colspan=2><b>gencircom</b></td></tr>
<tr><td>zkevm.verifier.circom</td><td>8475ff87bc8ad6361123045d034a481a2c57935fb4a8990957458f4ace6109a2</td></tr>
<tr><td colspan=2><b>compilecircom</b></td></tr>
<tr><td>zkevm.verifier.r1cs</td><td>653122109db0086d44b339f7ddadfc64aabe851c9c29af9fc4d4e2dc8bb00b61</td></tr>
<tr><td>zkevm.verifier.sym</td><td>a84d5a34944a745428c4ed8708b7c654169a2ffd00e1eccd7044a25bd2194edf</td></tr>
<tr><td colspan=2><b>c12a_setup</b></td></tr>
<tr><td>c12a.pil</td><td>13b74f6e33dcbfcb9aa1a5eb7a93691635f51f33aa91e7c867dec11509c93f4d</td></tr>
<tr><td>c12a.const</td><td>eda18ab4398133691e0daecd1525d51435e8907dc0cde5777ec96def34b2781f</td></tr>
<tr><td>c12a.exec</td><td>6fe8e529645f1b72de3851ecd50dde6b830846c4cd3af0b83267151b11ec45e1</td></tr>
<tr><td colspan=2><b>c12a_buildstarkinfo</b></td></tr>
<tr><td>c12a.starkstruct.json</td><td>c8ceea75f0aa05fdbdb20ac41b224355fde07a0dbeecd6649ff8c2636b9a759c</td></tr>
<tr><td>c12a.starkinfo.json</td><td>c05b27f4538e8071a0e8045faeb8a6de8771053587ad657b07c9401b9597a663</td></tr>
<tr><td colspan=2><b>c12a_buildconstanttree</b></td></tr>
<tr><td>c12a.verkey.json</td><td>c11451e126f7a5f1602a5b6721aee1cef819a2760db2aec20711235404fbcbcc</td></tr>
<tr><td>c12a.consttree</td><td>eda18ab4398133691e0daecd1525d51435e8907dc0cde5777ec96def34b2781f</td></tr>
<tr><td colspan=2><b>c12a_gencircom</b></td></tr>
<tr><td>c12a.verifier.circom</td><td>ff7afa36dd7dcbe6bf882309397294b1ca092890231591bd9d9439cbc60b178e</td></tr>
<tr><td colspan=2><b>recursive1_gencircom</b></td></tr>
<tr><td>recursive1.circom</td><td>83543e99e0a1f660761fa8a06310dfd9b69d0c0a358a73b6baec55d9587234e5</td></tr>
<tr><td colspan=2><b>recursive1_compile</b></td></tr>
<tr><td>recursive1.r1cs</td><td>f44f949f14ca5fa15bcf916d68b5ba3933c869a816bf3d646adebec42a3f3b97</td></tr>
<tr><td>recursive1.sym</td><td>646bc2e3ca5da30c1221039c1e37af2ed46a2f8f7023d65a41cb80c7de5882a9</td></tr>
<tr><td colspan=2><b>recursive1_setup</b></td></tr>
<tr><td>recursive1.pil</td><td>94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b</td></tr>
<tr><td>recursive1.const</td><td>5365a7fd04c220a042364dadea615876512b016dfb305a1a04cd3e5c85b87a65</td></tr>
<tr><td>recursive1.exec</td><td>359e6e221cefd35827960ff5cf9cd506ba5e2a5ec92c33312a5903ce087aa155</td></tr>
<tr><td colspan=2><b>recursive1_buildstarkinfo</b></td></tr>
<tr><td>recursive.starkstruct.json</td><td>8bc8b44a7e493e447af7c04d1a362c2198f3e9b29e425248b7646c36b67fd02c</td></tr>
<tr><td>recursive1.starkinfo.json</td><td>ab63b4008c2b2e769519ff3df4ba6130d66b8d6778c0ba0fb7724d5a4a9e2841</td></tr>
<tr><td colspan=2><b>recursive1_buildconstanttree</b></td></tr>
<tr><td>recursive1.verkey.json</td><td>2a89c0b3c99b53adc9ced07fbe1c548c4bb78148d0fef03b150f6babc5e7024c</td></tr>
<tr><td>recursive1.consttree</td><td>5365a7fd04c220a042364dadea615876512b016dfb305a1a04cd3e5c85b87a65</td></tr>
<tr><td colspan=2><b>recursive1_verifier_gencircom</b></td></tr>
<tr><td>recursive1.verifier.circom</td><td>835cf0a8c4706ced7395957a8bef1e00b70d1007586c9fccf107f12b4936dea5</td></tr>
<tr><td colspan=2><b>recursive2_gencircom</b></td></tr>
<tr><td>recursive2.circom</td><td>41faac208dc92e088fe3277e2c19449db9ebb591de79213168f2ee4e26497bd8</td></tr>
<tr><td colspan=2><b>recursive2_compile</b></td></tr>
<tr><td>recursive2.r1cs</td><td>47c79fa4c0a239c7d5066bc16c32aa5490fec00b0c4890b7f6318aca12713b47</td></tr>
<tr><td>recursive2.sym</td><td>a47d475bcb09309b2100bfc19ce4c4baa9cee2699373290569617d71fcf51a64</td></tr>
<tr><td colspan=2><b>recursive2_setup</b></td></tr>
<tr><td>recursive2.pil</td><td>94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b</td></tr>
<tr><td>recursive2.const</td><td>a41baa8a704ee3b2671527cc40b577f8379d5aa3e4b0ef15639af94a8a5fc424</td></tr>
<tr><td>recursive2.exec</td><td>f32201da15042d9167dc8dd6707c2920d7d2e772d411566739ac874bdbf269fb</td></tr>
<tr><td colspan=2><b>recursive2_buildstarkinfo</b></td></tr>
<tr><td>recursive2.starkinfo.json</td><td>ab63b4008c2b2e769519ff3df4ba6130d66b8d6778c0ba0fb7724d5a4a9e2841</td></tr>
<tr><td colspan=2><b>recursive2_buildconstanttree</b></td></tr>
<tr><td>recursive2.verkey.json</td><td>efba78426040b2b2b11fa96bf6aa27068d47abe0b38a8239454a62e707efdf69</td></tr>
<tr><td>recursive2.consttree</td><td>a41baa8a704ee3b2671527cc40b577f8379d5aa3e4b0ef15639af94a8a5fc424</td></tr>
<tr><td colspan=2><b>recursive2_verifier_gencircom</b></td></tr>
<tr><td>recursive2.verifier.circom</td><td>835cf0a8c4706ced7395957a8bef1e00b70d1007586c9fccf107f12b4936dea5</td></tr>
<tr><td colspan=2><b>recursivef_gencircom</b></td></tr>
<tr><td>recursivef.circom</td><td>3f1ce1916c04a44dea912c7ea3f9597d7d75c0a3f301efe6ca54ba7ef41f115f</td></tr>
<tr><td colspan=2><b>recursivef_compile</b></td></tr>
<tr><td>recursivef.r1cs</td><td>e05cb8080a6b439701f06ea11884ef3bfdefebd74bb714434315adf5ee1514f6</td></tr>
<tr><td>recursivef.sym</td><td>fcbe9cd852065f1224a82f8b595d2c7aaa9fdbc616ef9048714105d69d988cd7</td></tr>
<tr><td colspan=2><b>recursivef_setup</b></td></tr>
<tr><td>recursivef.pil</td><td>62527bfc12f535e8fa3a6dd7055bc595b27fc491f7203987108ee3d13283dbfe</td></tr>
<tr><td>recursivef.const</td><td>fe0ca03b16fb7d284f6b03b88f0e99a666f5006db69b8e51ea723d07bb9b554b</td></tr>
<tr><td>recursivef.exec</td><td>1751c8a070d68cc64aa7d932a1785330da24139e547805e583f5407c5600715e</td></tr>
<tr><td colspan=2><b>recursivef_buildstarkinfo</b></td></tr>
<tr><td>recursivef.starkstruct.json</td><td>ba99ad986178db98b1a867bb9d8592fa6ba5c29d9233fd939d01424425ce6cba</td></tr>
<tr><td>recursivef.starkinfo.json</td><td>8d6e9503550ad8bdde303af5b37ad0320171d4f180fc11323b58fbf8d82bb1a6</td></tr>
<tr><td colspan=2><b>recursivef_buildconstanttree</b></td></tr>
<tr><td>recursivef.verkey.json</td><td>e391e7f55efac7d781bf03a2666e4cf3c5336e548a1acfa89fa295a1d9b408fe</td></tr>
<tr><td>recursivef.consttree</td><td>fe0ca03b16fb7d284f6b03b88f0e99a666f5006db69b8e51ea723d07bb9b554b</td></tr>
<tr><td colspan=2><b>recursivef_verifier_gencircom</b></td></tr>
<tr><td>recursivef.verifier.circom</td><td>64dd7df291518a73d0c71a1ca329e1f05bf3f25a97f2b9b905a8cdd495cb9ed6</td></tr>
<tr><td colspan=2><b>final_gencircom</b></td></tr>
<tr><td>final.circom</td><td>74a06304ce73b282a520c358baead152dad790b0aa6b7031f6ba8c00166be459</td></tr>
<tr><td colspan=2><b>final_compile</b></td></tr>
<tr><td>final.r1cs</td><td>014d04d4dc123f9f0e625ac6819b41a5ed2baf83d712d00bad326b5763d0b77a</td></tr>
<tr><td>final.sym</td><td>e9cae6fc94d002475857b90b4cea238e60c4ea4492e435ebb9aa91e5e055775b</td></tr>
<tr><td colspan=2><b>fflonk_setup</b></td></tr>
<tr><td>final.fflonk.zkey</td><td>fdc2c9e25735144653663f29806e711e811b4c7135785d01c5e10f13e3c4cbcc</td></tr>
<tr><td colspan=2><b>fflonk_evk</b></td></tr>
<tr><td>final.fflonk.verkey.json</td><td>23f1f4593ab0bb77a7aeb5ad30c5bddbc4b29a696e2e4b961500d9260e4d04b5</td></tr>
<tr><td>dependencies.txt</td><td>d2ecb931d898a37e596b2b4716ca22f875fae3de913d03bf0106ef2ea10eecd8</td></tr>
<tr><td colspan=2><b>fflonk_solidity</b></td></tr>
<tr><td>final.fflonk.verifier.sol</td><td>ad7faf985475359b115d73ba216e7f6feb9cb3181889e65f62e23904da40b33a</td></tr>
</table>


<div class="meta_for_parser tablespecs" style="visibility:hidden">
sed "s/^0x//;s/\([0-9a-f]\{40\}\)/\1\n/g" FflonkVerifier.sol.compiled.bytecode | head
sed "s/^0x//;s/\([0-9a-f]\{40\}\)/\1\n/g" FflonkVerifier.sol.compiled.bytecode | tail
</div>