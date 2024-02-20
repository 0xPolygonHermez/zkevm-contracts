# Verify deployment on Mainnet the proof verifier smart contract (etrog-fork.7)

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
git checkout ede545493ca4ab6cbd136dbcc452c7794d01bb08
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
8ae7baadd9f2ffb07862b0a74c20e1ad1cc2d4136e416ce5beac82a4e9a44923
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
a2646970667358221220761b1f07d5034592f204
cb3439dbfabc28fb771c6e1bc6c8016e3d7b42ad
5a2164736f6c63430008140033
```

Verify bytecode compiled:

```
cd ~/contract
cat ./artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier.json | jq .bytecode -r | tee FflonkVerifier.sol.compiled.bytecode | sha256sum
```

The result should be:

```
34c11f41d424eb821b42630183c4b97dc8689163276ca50095e5918202950703
```

## Download bytecode of deployed smartcontract

To download bytecode of deployed smartcontract, need the address of smart contract, in this case it's _0x1C3A3da552b8662CD69538356b1E7c2E9CC1EBD8_.

### Download by copying data manually

Go to Etherscan or Beaconcha to get transaction bytecode.

Associated with address _0x1C3A3da552b8662CD69538356b1E7c2E9CC1EBD8_ found the transacction _0x2f0ce26dd454211f84df373e7b37be2d683cb71532bc6d0ec63d6fcdbaa4c5e3_.

-   ### Etherscan (https://etherscan.io)

        https://etherscan.io/address/0x1C3A3da552b8662CD69538356b1E7c2E9CC1EBD8
        https://etherscan.io/tx/0x2f0ce26dd454211f84df373e7b37be2d683cb71532bc6d0ec63d6fcdbaa4c5e3

    Click to see more > Input Data > Select all data and copy to clipboard.

-   ### Beacocha (https://beaconcha.in)
        https://beaconcha.in/address/0x1C3A3da552b8662CD69538356b1E7c2E9CC1EBD8
        https://beaconcha.in/tx/0x2f0ce26dd454211f84df373e7b37be2d683cb71532bc6d0ec63d6fcdbaa4c5e3
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
 curl -s -X POST -H "Content-Type: application/json" --data '{"method":"eth_getTransactionByHash","params":["0x2f0ce26dd454211f84df373e7b37be2d683cb71532bc6d0ec63d6fcdbaa4c5e3"], "id":1,"jsonrpc":"2.0"}' $L1_ENDPOINT | jq .result.input -r > FflonkVerifier.sol.explorer.bytecode
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
34c11f41d424eb821b42630183c4b97dc8689163276ca50095e5918202950703  FflonkVerifier.sol.compiled.bytecode
34c11f41d424eb821b42630183c4b97dc8689163276ca50095e5918202950703  FflonkVerifier.sol.explorer.bytecode
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
<tr><td>zkevm.const</td><td>3d0c910c9bfa143209e8f545e23e2e98b29f4f5a40c04001fc8254aee9f121c7</td></tr>
<tr><td colspan=2><b>buildstarkinfo</b></td></tr>
<tr><td>zkevm.starkstruct.json</td><td>284b6ce275c637af4a0b4b10cd83a881c6f1b21e21ad7ea2276379ed8393b099</td></tr>
<tr><td>zkevm.starkinfo.json</td><td>cd4615be096817d14b3b19780897ad39f5cd26f83e5d17518dae7688563fcb54</td></tr>
<tr><td colspan=2><b>buildconstanttree</b></td></tr>
<tr><td>zkevm.verkey.json</td><td>7d024c2295c3bc478de5a71c4006ede5731420236651e29a384609c913c8eee9</td></tr>
<tr><td>zkevm.consttree</td><td>3d0c910c9bfa143209e8f545e23e2e98b29f4f5a40c04001fc8254aee9f121c7</td></tr>
<tr><td colspan=2><b>gencircom</b></td></tr>
<tr><td>zkevm.verifier.circom</td><td>e832840aa97ca0e47a448f24ac7019ea80bfb6e9354cbe2fd7a6dada1d5d807b</td></tr>
<tr><td colspan=2><b>compilecircom</b></td></tr>
<tr><td>zkevm.verifier.r1cs</td><td>25f656f632964f8c7800c4d222f34a6e94a576c9b4f3b81fbc2ba6f03889719f</td></tr>
<tr><td>zkevm.verifier.sym</td><td>e32fc039e6bb550f7d2e375804b0679c6761d488111e6aa9b3b3a638af08ec36</td></tr>
<tr><td colspan=2><b>c12a_setup</b></td></tr>
<tr><td>c12a.pil</td><td>13b74f6e33dcbfcb9aa1a5eb7a93691635f51f33aa91e7c867dec11509c93f4d</td></tr>
<tr><td>c12a.const</td><td>5fffa6480307f60c9c1202539ae39051cbcb72863bb8e2db5bebf74a2d048f9b</td></tr>
<tr><td>c12a.exec</td><td>6fe8e529645f1b72de3851ecd50dde6b830846c4cd3af0b83267151b11ec45e1</td></tr>
<tr><td colspan=2><b>c12a_buildstarkinfo</b></td></tr>
<tr><td>c12a.starkstruct.json</td><td>c8ceea75f0aa05fdbdb20ac41b224355fde07a0dbeecd6649ff8c2636b9a759c</td></tr>
<tr><td>c12a.starkinfo.json</td><td>c05b27f4538e8071a0e8045faeb8a6de8771053587ad657b07c9401b9597a663</td></tr>
<tr><td colspan=2><b>c12a_buildconstanttree</b></td></tr>
<tr><td>c12a.verkey.json</td><td>e6a963de090b49ce93c058ffe5438f209091186987b5fc162d6e9122bf86f333</td></tr>
<tr><td>c12a.consttree</td><td>5fffa6480307f60c9c1202539ae39051cbcb72863bb8e2db5bebf74a2d048f9b</td></tr>
<tr><td colspan=2><b>c12a_gencircom</b></td></tr>
<tr><td>c12a.verifier.circom</td><td>306ef5102ad64e14cb385e7e888dce3fccd73dbd55aa443c1561152779fdf9dd</td></tr>
<tr><td colspan=2><b>recursive1_gencircom</b></td></tr>
<tr><td>recursive1.circom</td><td>83543e99e0a1f660761fa8a06310dfd9b69d0c0a358a73b6baec55d9587234e5</td></tr>
<tr><td colspan=2><b>recursive1_compile</b></td></tr>
<tr><td>recursive1.r1cs</td><td>bf748272be6aeba8eb8dc3146e68a9eb938c7139d690be1e94a506a4d756eec8</td></tr>
<tr><td>recursive1.sym</td><td>646bc2e3ca5da30c1221039c1e37af2ed46a2f8f7023d65a41cb80c7de5882a9</td></tr>
<tr><td colspan=2><b>recursive1_setup</b></td></tr>
<tr><td>recursive1.pil</td><td>94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b</td></tr>
<tr><td>recursive1.const</td><td>bba22272d800b85e67e3b0360dbd67f972804129a8f5ee4a434a26976a3bc8a4</td></tr>
<tr><td>recursive1.exec</td><td>359e6e221cefd35827960ff5cf9cd506ba5e2a5ec92c33312a5903ce087aa155</td></tr>
<tr><td colspan=2><b>recursive1_buildstarkinfo</b></td></tr>
<tr><td>recursive.starkstruct.json</td><td>8bc8b44a7e493e447af7c04d1a362c2198f3e9b29e425248b7646c36b67fd02c</td></tr>
<tr><td>recursive1.starkinfo.json</td><td>ab63b4008c2b2e769519ff3df4ba6130d66b8d6778c0ba0fb7724d5a4a9e2841</td></tr>
<tr><td colspan=2><b>recursive1_buildconstanttree</b></td></tr>
<tr><td>recursive1.verkey.json</td><td>44f3b6afb36a458031e327d2119a15689ec38eb10ccff729dfda0bae3bf16921</td></tr>
<tr><td>recursive1.consttree</td><td>bba22272d800b85e67e3b0360dbd67f972804129a8f5ee4a434a26976a3bc8a4</td></tr>
<tr><td colspan=2><b>recursive1_verifier_gencircom</b></td></tr>
<tr><td>recursive1.verifier.circom</td><td>835cf0a8c4706ced7395957a8bef1e00b70d1007586c9fccf107f12b4936dea5</td></tr>
<tr><td colspan=2><b>recursive2_gencircom</b></td></tr>
<tr><td>recursive2.circom</td><td>0c03000a9a56601a086fc5c91e9119e2e63fa699fe9d5f362b506c2d3602449f</td></tr>
<tr><td colspan=2><b>recursive2_compile</b></td></tr>
<tr><td>recursive2.r1cs</td><td>2fdd9f433b07c90a367dbc2335b7921c1ef242e6466fc5a25b8ebcf8660ff77a</td></tr>
<tr><td>recursive2.sym</td><td>a47d475bcb09309b2100bfc19ce4c4baa9cee2699373290569617d71fcf51a64</td></tr>
<tr><td colspan=2><b>recursive2_setup</b></td></tr>
<tr><td>recursive2.pil</td><td>94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b</td></tr>
<tr><td>recursive2.const</td><td>7ee905f3949c67af84f417ce2b996b2946b7bf1d4557f8a67f9d7f7ab9540902</td></tr>
<tr><td>recursive2.exec</td><td>f32201da15042d9167dc8dd6707c2920d7d2e772d411566739ac874bdbf269fb</td></tr>
<tr><td colspan=2><b>recursive2_buildstarkinfo</b></td></tr>
<tr><td>recursive2.starkinfo.json</td><td>ab63b4008c2b2e769519ff3df4ba6130d66b8d6778c0ba0fb7724d5a4a9e2841</td></tr>
<tr><td colspan=2><b>recursive2_buildconstanttree</b></td></tr>
<tr><td>recursive2.verkey.json</td><td>fc3f0d4aaf11bb001102a37e397262aa62a02b6ca001b5c00ba9fccdfb06dda6</td></tr>
<tr><td>recursive2.consttree</td><td>7ee905f3949c67af84f417ce2b996b2946b7bf1d4557f8a67f9d7f7ab9540902</td></tr>
<tr><td colspan=2><b>recursive2_verifier_gencircom</b></td></tr>
<tr><td>recursive2.verifier.circom</td><td>835cf0a8c4706ced7395957a8bef1e00b70d1007586c9fccf107f12b4936dea5</td></tr>
<tr><td colspan=2><b>recursivef_gencircom</b></td></tr>
<tr><td>recursivef.circom</td><td>84f7538268a29a67e7836691b1706f9228fe73f4d890eee7f65f3ddcfc3aafc3</td></tr>
<tr><td colspan=2><b>recursivef_compile</b></td></tr>
<tr><td>recursivef.r1cs</td><td>2861953db44082184ee7a1dcff9b37ab131e3d58cc5539cfe258c6d23f505f8c</td></tr>
<tr><td>recursivef.sym</td><td>fcbe9cd852065f1224a82f8b595d2c7aaa9fdbc616ef9048714105d69d988cd7</td></tr>
<tr><td colspan=2><b>recursivef_setup</b></td></tr>
<tr><td>recursivef.pil</td><td>62527bfc12f535e8fa3a6dd7055bc595b27fc491f7203987108ee3d13283dbfe</td></tr>
<tr><td>recursivef.const</td><td>0f32c1d45e2e7390cd21bcfadb1be399ea02f6c91c76aaca963a7ee1f131ba41</td></tr>
<tr><td>recursivef.exec</td><td>1751c8a070d68cc64aa7d932a1785330da24139e547805e583f5407c5600715e</td></tr>
<tr><td colspan=2><b>recursivef_buildstarkinfo</b></td></tr>
<tr><td>recursivef.starkstruct.json</td><td>ba99ad986178db98b1a867bb9d8592fa6ba5c29d9233fd939d01424425ce6cba</td></tr>
<tr><td>recursivef.starkinfo.json</td><td>8d6e9503550ad8bdde303af5b37ad0320171d4f180fc11323b58fbf8d82bb1a6</td></tr>
<tr><td colspan=2><b>recursivef_buildconstanttree</b></td></tr>
<tr><td>recursivef.verkey.json</td><td>3e16829b5af0ea65a5f49724d96ed429e1d4da088d4b0c1556093632f94e6bbc</td></tr>
<tr><td>recursivef.consttree</td><td>0f32c1d45e2e7390cd21bcfadb1be399ea02f6c91c76aaca963a7ee1f131ba41</td></tr>
<tr><td colspan=2><b>recursivef_verifier_gencircom</b></td></tr>
<tr><td>recursivef.verifier.circom</td><td>68406381a2d730ede86e41ce80f4c214cabb83fd307768b43d5b407978f94c04</td></tr>
<tr><td colspan=2><b>final_gencircom</b></td></tr>
<tr><td>final.circom</td><td>74a06304ce73b282a520c358baead152dad790b0aa6b7031f6ba8c00166be459</td></tr>
<tr><td colspan=2><b>final_compile</b></td></tr>
<tr><td>final.r1cs</td><td>bf28b9d2adff923fbf2505a116bf5c29f116b1187fcae972bc78d1f254963380</td></tr>
<tr><td>final.sym</td><td>9c20071021039f3f82b3ecb471402949cbbc290812da97f47aae4b13ad73342d</td></tr>
<tr><td colspan=2><b>fflonk_setup</b></td></tr>
<tr><td>final.fflonk.zkey</td><td>b0a674854e811c9d935cfae6fa0cc4b0efbba7014365b06d026b0bc3667a0c7b</td></tr>
<tr><td colspan=2><b>fflonk_evk</b></td></tr>
<tr><td>final.fflonk.verkey.json</td><td>44b4d3ac1331dd17246611687f7c65f659d377c34467df1d49e2e558c3aad1ad</td></tr>
<tr><td>dependencies.txt</td><td>bb198945774e109721e2bde02a369edf96d21a0533f4bf9882a472dadd90d117</td></tr>
<tr><td colspan=2><b>fflonk_solidity</b></td></tr>
<tr><td>final.fflonk.verifier.sol</td><td>8ae7baadd9f2ffb07862b0a74c20e1ad1cc2d4136e416ce5beac82a4e9a44923</td></tr>
</table>
