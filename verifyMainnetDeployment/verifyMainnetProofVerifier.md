# Verify deployment on Mainnet the proof verifier smart contract (elderberry-fork.8)

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
git checkout 1f228c110be466ec8b91d251713df4194ba49aeb
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
9bf2d96c589a64ba8ebde36f280993d1dc0ac3ca3cac1d09b5550055b8a523e8
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
608060405234801561001057600080fd5b506159
ee80620000216000396000f3fe60806040523480
1561001057600080fd5b506004361061002b5760
003560e01c80639121da8a14610030575b600080
fd5b61004361003e366004615973565b61005756
5b604051901515815260200160405180910390f3
5b6000615901565b6040516104c0820151808252
6020820191507f30644e72e131a029b85045b681
81585d2833e84879b9709143e1f593f000000161
04e0840151820990508082526020820191507f30
:
:
81612878565b61593a83826128b1565b61594381
612911565b61594c81613e61565b615955816145
59565b61595e816151f0565b615967816156ee56
5b90508060005260206000f35b60008061032080
848603121561598857600080fd5b610300840185
81111561599a57600080fd5b8493508582860111
156159ac57600080fd5b80925050509250929050
56fea2646970667358221220065c100f41ce696b
303e853b86cdaa6a5ef43dec684aa118e566f3fa
613427c464736f6c63430008140033

```

Verify bytecode compiled:

```
cd ~/contract
cat ./artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier.json | jq .bytecode -r | tee FflonkVerifier.sol.compiled.bytecode | sha256sum
```

The result should be:

```
27270e1846e7e8512ab9cc311a96a1425a03adda282b18d5beb521dfe09c3d22
```

## Download bytecode of deployed smartcontract

To download bytecode of deployed smartcontract, need the address of smart contract, in this case it's _0x4AaBBA26EA9E7A7fbD052d17a167e6aE3F8eC7Be_.

### Download by copying data manually

Go to Etherscan or Beaconcha to get transaction bytecode.

Associated with address _0x4AaBBA26EA9E7A7fbD052d17a167e6aE3F8eC7Be_ found the transacction _0x6cc2cbf18cefe30ec2b4776b525e187f06f88bb52fe94c1b0dd2629b199fd9c9_.

-   ### Etherscan (https://etherscan.io)
    https://etherscan.io/address/0x4AaBBA26EA9E7A7fbD052d17a167e6aE3F8eC7Be
    https://etherscan.io/tx/0x6cc2cbf18cefe30ec2b4776b525e187f06f88bb52fe94c1b0dd2629b199fd9c9


    Click to see more > Input Data > Select all data and copy to clipboard.

-   ### Beacocha (https://beaconcha.in)
    https://beaconcha.in/address/0x4AaBBA26EA9E7A7fbD052d17a167e6aE3F8eC7Be
    https://beaconcha.in/tx/0x6cc2cbf18cefe30ec2b4776b525e187f06f88bb52fe94c1b0dd2629b199fd9c9

    Advanced Info > Call Data > Select all data and copy to clipboard.

_NOTE: Don't use button "Copy Raw Data" because it generated non compatible format._

Some applications running on the terminal may limit the amount of input they will accept before their input buffers overflow. To avoid this situation create file _FflonkVerifier.sol.explorer.bytecode_ with editor as nano or vi.

```bash
cd ~/contract
nano FflonkVerifier.sol.explorer.bytecode
```

In nano, to paste the clipboard to the file use CTRL+P, save content using CTRL+X, and finally press Y.

### Download through L1 endpoint call

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
27270e1846e7e8512ab9cc311a96a1425a03adda282b18d5beb521dfe09c3d22  FflonkVerifier.sol.compiled.bytecode
27270e1846e7e8512ab9cc311a96a1425a03adda282b18d5beb521dfe09c3d22  FflonkVerifier.sol.explorer.bytecode
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
<tr><td>zkevm.const</td><td>ca00d4c994f4793c14b19a9a26f17f170165b9177ada598f94a416604a6ec0b8</td></tr>
<tr><td colspan=2><b>buildstarkinfo</b></td></tr>
<tr><td>zkevm.starkstruct.json</td><td>284b6ce275c637af4a0b4b10cd83a881c6f1b21e21ad7ea2276379ed8393b099</td></tr>
<tr><td>zkevm.starkinfo.json</td><td>cd4615be096817d14b3b19780897ad39f5cd26f83e5d17518dae7688563fcb54</td></tr>
<tr><td colspan=2><b>buildconstanttree</b></td></tr>
<tr><td>zkevm.verkey.json</td><td>466b663f730c032b235e7c9ac57d4492bdeea51af8b62bc204ef20700de88c6d</td></tr>
<tr><td>zkevm.consttree</td><td>ca00d4c994f4793c14b19a9a26f17f170165b9177ada598f94a416604a6ec0b8</td></tr>
<tr><td colspan=2><b>gencircom</b></td></tr>
<tr><td>zkevm.verifier.circom</td><td>4a9abd5c5d31f3675cac455fb4e8e06a1f524d86e4e6e18f32f0090f017c9f6d</td></tr>
<tr><td colspan=2><b>compilecircom</b></td></tr>
<tr><td>zkevm.verifier.r1cs</td><td>3ed36eec0462885d480e6e3023f91e0265aad8c5556aa33d6c7b34e866e59605</td></tr>
<tr><td>zkevm.verifier.sym</td><td>57803c3774b227440b0cae55bace553a198ec675d8bdae72b37bbc2a59b7d9c9</td></tr>
<tr><td colspan=2><b>c12a_setup</b></td></tr>
<tr><td>c12a.pil</td><td>13b74f6e33dcbfcb9aa1a5eb7a93691635f51f33aa91e7c867dec11509c93f4d</td></tr>
<tr><td>c12a.const</td><td>96b15b147af5ffcf08f2692d6bcbc149ca46521f80a2d5476da017c78c673cb7</td></tr>
<tr><td>c12a.exec</td><td>6fe8e529645f1b72de3851ecd50dde6b830846c4cd3af0b83267151b11ec45e1</td></tr>
<tr><td colspan=2><b>c12a_buildstarkinfo</b></td></tr>
<tr><td>c12a.starkstruct.json</td><td>c8ceea75f0aa05fdbdb20ac41b224355fde07a0dbeecd6649ff8c2636b9a759c</td></tr>
<tr><td>c12a.starkinfo.json</td><td>c05b27f4538e8071a0e8045faeb8a6de8771053587ad657b07c9401b9597a663</td></tr>
<tr><td colspan=2><b>c12a_buildconstanttree</b></td></tr>
<tr><td>c12a.verkey.json</td><td>20f9ed1d602fe5155c0c93f342fda579987cd85b9011fd8658a427ffd09e7468</td></tr>
<tr><td>c12a.consttree</td><td>96b15b147af5ffcf08f2692d6bcbc149ca46521f80a2d5476da017c78c673cb7</td></tr>
<tr><td colspan=2><b>c12a_gencircom</b></td></tr>
<tr><td>c12a.verifier.circom</td><td>63c0537db15875dd0e61696c5b97344424f1a1dffaa201ae04bded78feb5bb0e</td></tr>
<tr><td colspan=2><b>recursive1_gencircom</b></td></tr>
<tr><td>recursive1.circom</td><td>83543e99e0a1f660761fa8a06310dfd9b69d0c0a358a73b6baec55d9587234e5</td></tr>
<tr><td colspan=2><b>recursive1_compile</b></td></tr>
<tr><td>recursive1.r1cs</td><td>9ef158594515431ac644c0b79cc9b3ca441754ea98529e1ae2db176ccced110a</td></tr>
<tr><td>recursive1.sym</td><td>f2db344f3289e513fc8a9cacc68b697a39a410fae834bdc8feabee7b394cabc0</td></tr>
<tr><td colspan=2><b>recursive1_setup</b></td></tr>
<tr><td>recursive1.pil</td><td>94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b</td></tr>
<tr><td>recursive1.const</td><td>f81f9d99dc7be4ec8ce515a0d58958e10d09aaefabd778164fc4f076bbf273d0</td></tr>
<tr><td>recursive1.exec</td><td>359e6e221cefd35827960ff5cf9cd506ba5e2a5ec92c33312a5903ce087aa155</td></tr>
<tr><td colspan=2><b>recursive1_buildstarkinfo</b></td></tr>
<tr><td>recursive.starkstruct.json</td><td>8bc8b44a7e493e447af7c04d1a362c2198f3e9b29e425248b7646c36b67fd02c</td></tr>
<tr><td>recursive1.starkinfo.json</td><td>ab63b4008c2b2e769519ff3df4ba6130d66b8d6778c0ba0fb7724d5a4a9e2841</td></tr>
<tr><td colspan=2><b>recursive1_buildconstanttree</b></td></tr>
<tr><td>recursive1.verkey.json</td><td>883d526a0a9027641307a56f3cf94bbd3072d98413273f424c5026951277aec6</td></tr>
<tr><td>recursive1.consttree</td><td>f81f9d99dc7be4ec8ce515a0d58958e10d09aaefabd778164fc4f076bbf273d0</td></tr>
<tr><td colspan=2><b>recursive1_verifier_gencircom</b></td></tr>
<tr><td>recursive1.verifier.circom</td><td>835cf0a8c4706ced7395957a8bef1e00b70d1007586c9fccf107f12b4936dea5</td></tr>
<tr><td colspan=2><b>recursive2_gencircom</b></td></tr>
<tr><td>recursive2.circom</td><td>c936419331d9d07aacdc912002d30bce42baa2c05a956b51d12580c82276803a</td></tr>
<tr><td colspan=2><b>recursive2_compile</b></td></tr>
<tr><td>recursive2.r1cs</td><td>b2c0f5fb9ccda0474e246cdeca3e34fc5907cd5b34f15f2192b163fb53062376</td></tr>
<tr><td>recursive2.sym</td><td>a47d475bcb09309b2100bfc19ce4c4baa9cee2699373290569617d71fcf51a64</td></tr>
<tr><td colspan=2><b>recursive2_setup</b></td></tr>
<tr><td>recursive2.pil</td><td>94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b</td></tr>
<tr><td>recursive2.const</td><td>381fcf6ad4237bdbf878473f854053849a7decfbaab6c846624c41d3000ef5b8</td></tr>
<tr><td>recursive2.exec</td><td>f32201da15042d9167dc8dd6707c2920d7d2e772d411566739ac874bdbf269fb</td></tr>
<tr><td colspan=2><b>recursive2_buildstarkinfo</b></td></tr>
<tr><td>recursive2.starkinfo.json</td><td>ab63b4008c2b2e769519ff3df4ba6130d66b8d6778c0ba0fb7724d5a4a9e2841</td></tr>
<tr><td colspan=2><b>recursive2_buildconstanttree</b></td></tr>
<tr><td>recursive2.verkey.json</td><td>a2477ca847f493163113860a42ecede027bc67b4935e5ab30f2e825009363a47</td></tr>
<tr><td>recursive2.consttree</td><td>381fcf6ad4237bdbf878473f854053849a7decfbaab6c846624c41d3000ef5b8</td></tr>
<tr><td colspan=2><b>recursive2_verifier_gencircom</b></td></tr>
<tr><td>recursive2.verifier.circom</td><td>835cf0a8c4706ced7395957a8bef1e00b70d1007586c9fccf107f12b4936dea5</td></tr>
<tr><td colspan=2><b>recursivef_gencircom</b></td></tr>
<tr><td>recursivef.circom</td><td>68ba6079a221f4cfe3afd071e8df62c38309f34d0633f5574cf76750d8fe2066</td></tr>
<tr><td colspan=2><b>recursivef_compile</b></td></tr>
<tr><td>recursivef.r1cs</td><td>f45f7a9caa97913263f81ba31630dd615403f9fe3d72478a270b65b1be8a468e</td></tr>
<tr><td>recursivef.sym</td><td>fcbe9cd852065f1224a82f8b595d2c7aaa9fdbc616ef9048714105d69d988cd7</td></tr>
<tr><td colspan=2><b>recursivef_setup</b></td></tr>
<tr><td>recursivef.pil</td><td>62527bfc12f535e8fa3a6dd7055bc595b27fc491f7203987108ee3d13283dbfe</td></tr>
<tr><td>recursivef.const</td><td>a74d6e18aab5a524c0e1ea87001cdd88cb20fcf8a957e831d28b58b116cb358d</td></tr>
<tr><td>recursivef.exec</td><td>1751c8a070d68cc64aa7d932a1785330da24139e547805e583f5407c5600715e</td></tr>
<tr><td colspan=2><b>recursivef_buildstarkinfo</b></td></tr>
<tr><td>recursivef.starkstruct.json</td><td>ba99ad986178db98b1a867bb9d8592fa6ba5c29d9233fd939d01424425ce6cba</td></tr>
<tr><td>recursivef.starkinfo.json</td><td>8d6e9503550ad8bdde303af5b37ad0320171d4f180fc11323b58fbf8d82bb1a6</td></tr>
<tr><td colspan=2><b>recursivef_buildconstanttree</b></td></tr>
<tr><td>recursivef.verkey.json</td><td>f41c6973c1a71970af291da4177f11f1b7accda7654c63169c607efeef5981e6</td></tr>
<tr><td>recursivef.consttree</td><td>a74d6e18aab5a524c0e1ea87001cdd88cb20fcf8a957e831d28b58b116cb358d</td></tr>
<tr><td colspan=2><b>recursivef_verifier_gencircom</b></td></tr>
<tr><td>recursivef.verifier.circom</td><td>3607ed5c1ec397aaa35a09122128d57896b0b9ae648a273721f23c82f69eca30</td></tr>
<tr><td colspan=2><b>final_gencircom</b></td></tr>
<tr><td>final.circom</td><td>74a06304ce73b282a520c358baead152dad790b0aa6b7031f6ba8c00166be459</td></tr>
<tr><td colspan=2><b>final_compile</b></td></tr>
<tr><td>final.r1cs</td><td>8980408e97bd37a12dcb3cca90309421a25b17d899a9021a7eb55d86c46b4eb5</td></tr>
<tr><td>final.sym</td><td>9c20071021039f3f82b3ecb471402949cbbc290812da97f47aae4b13ad73342d</td></tr>
<tr><td colspan=2><b>fflonk_setup</b></td></tr>
<tr><td>final.fflonk.zkey</td><td>95f221bb359705463b02c43e7c7fc3928676dfc4e2a788504d2009a598f144ee</td></tr>
<tr><td colspan=2><b>fflonk_evk</b></td></tr>
<tr><td>final.fflonk.verkey.json</td><td>65fe92de992fa6a8e43760dd4c7629d700dd9cb4ef8c4210581b6e277fec104a</td></tr>
<tr><td>dependencies.txt</td><td>1201d73ded9420e99e434147a91f82200781bb6b6348dfca6439f315b9612672</td></tr>
<tr><td colspan=2><b>fflonk_solidity</b></td></tr>
<tr><td>final.fflonk.verifier.sol</td><td>9bf2d96c589a64ba8ebde36f280993d1dc0ac3ca3cac1d09b5550055b8a523e8</td></tr>
</table>


<div class="meta_for_parser tablespecs" style="visibility:hidden">
sed "s/^0x//;s/\([0-9a-f]\{40\}\)/\1\n/g" ~/contract/FflonkVerifier.sol.compiled.bytecode | head
sed "s/^0x//;s/\([0-9a-f]\{40\}\)/\1\n/g" ~/contract/FflonkVerifier.sol.compiled.bytecode | tail
</div>