# Verify deployment on Mainnet the proof verifier smart contract (fork.11)

In order to verify the smart contract, you will need a machine with at least 512GB of RAM and 32 cores.

In this tutorial we will give instructions for a r6a.16xlarge aws instance. This instance has 32 cores 64 threads. The instance will use Ubuntu 22.04 LTS and the cost of the instance is about 3.62$/h. This process is quite long, it takes approximately 4-5 hours.

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

## Prepare fast build constant tree tool and fflonk setup

```bash
cd ~
git clone https://github.com/0xPolygonHermez/zkevm-prover.git
cd zkevm-prover
git checkout 4a237f1c5d770373c9ff19d75fe87890c4599878
git submodule init
git submodule update
sudo apt install -y build-essential libomp-dev libgmp-dev nlohmann-json3-dev libpqxx-dev nasm libgrpc++-dev libprotobuf-dev grpc-proto libsodium-dev uuid-dev libsecp256k1-dev
make -j bctree fflonkSetup
```

this step takes less than 1 minute.

## Prepare and launch setup (zkevm-proverjs)

```bash
cd ~
git clone https://github.com/0xPolygonHermez/zkevm-proverjs.git
cd zkevm-proverjs   
git checkout cec76cc411838b78d3649543fb0fca712317c713
npm install
tmux -c "npm run buildsetup --bctree=../zkevm-prover/build/bctree --fflonksetup=../zkevm-prover/build/fflonkSetup --mode=25"
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
cp ~/zkevm-proverjs/build/proof/build/final.fflonk.verifier.sol contracts/verifiers/FflonkVerifier_11.sol
sed -i "s/FflonkVerifier {/FflonkVerifier_11 {/" contracts/verifiers/FflonkVerifier_11.sol
sha256sum contracts/verifiers/FflonkVerifier_11.sol
```

The result should be:

```
367fab7b80c452378ba888be84ec08aea3fcf5099cdc4d61c140c61f99982f31
```

To compile smartcontract execute following command:

```bash
npx hardhat compile
```

> NOTE: During compilation warning is shown:
> Warning: Unused function parameter. Remove or comment out the variable name to silence this warning.
> --> contracts/verifiers/FflonkVerifier.sol:162:26:

Bytecode of smartcontract was on bytecode property of json file _FflonkVerifier_ generated on path _    _

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
a2646970667358221220491c0c93723bfb955947
5a1591c0c81ce115186e98fc632a12509d669f9c
89d964736f6c63430008140033
```

Verify bytecode compiled:

```
cd ~/contract
cat ./artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier_11.json | jq .bytecode -r | tee FflonkVerifier.sol.compiled.bytecode | sha256sum
```

The result should be:

```
ab331dc7cc63216e55a3058e51773cdfda280aa37382f444471373706d112a57
```

## Download bytecode of deployed smartcontract

To download bytecode of deployed smartcontract, need the address of smart contract, in this case it's _0x0775e11309d75aA6b0967917fB0213C5673eDf81_.

### Download by copying data manually

Go to Etherscan or Beaconcha to get transaction bytecode.

Associated with address _0x082cCe3072A26a3871D3e5D40afB425fF5038Cf6_ found the transacction _0xeef8a49cc2469c11043eeb4a1a90c9c184ea1908651326b1b81f2761218f3397_.

-   ### Etherscan (https://etherscan.io)
    https://etherscan.io/address/0xc521580cd8586cc688a7430f9dce0f6a803f2883
    https://etherscan.io/tx/0xeef8a49cc2469c11043eeb4a1a90c9c184ea1908651326b1b81f2761218f3397


    Click to show more > Input Data > Select all data and copy to clipboard.

-   ### Beacocha (https://beaconcha.in)
    https://beaconcha.in/address/0x082cCe3072A26a3871D3e5D40afB425fF5038Cf6
    https://beaconcha.in/tx/0xeef8a49cc2469c11043eeb4a1a90c9c184ea1908651326b1b81f2761218f3397

    Advanced Info > Call Data > Select all data and copy to clipboard.

_NOTE: Don't use button "Copy Raw Data" because it generated non compatible format._

Some applications running on the terminal may limit the amount of input they will accept before their input buffers overflow. To avoid this situation create file _FflonkVerifier.sol.explorer.bytecode_ with editor as nano or vi.

```bash
cd ~/contract
nano FflonkVerifier.sol.explorer.bytecode
```

In nano, to paste the clipboard to the file use CTRL+P, save content using CTRL+X, and finally press Y.

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
ab331dc7cc63216e55a3058e51773cdfda280aa37382f444471373706d112a57  FflonkVerifier.sol.compiled.bytecode
ab331dc7cc63216e55a3058e51773cdfda280aa37382f444471373706d112a57  FflonkVerifier.sol.explorer.bytecode
```

## Generated files hash

<font size=2>
<table>
<tr><th>step/file</th><th>sha256</th></tr>
<tr><td colspan=2><b>buildrom</b></td></tr>
<tr><td>rom.json</td><td>676c3f58263fc284bc53ef949dd1acedcfb090f3287ee080b2a277ed2157894a</td></tr>
<tr><td colspan=2><b>buildpil</b></td></tr>
<tr><td>main.pil.json</td><td>8b3894aeb17bd1cd375063105c200c3f85148fd783c42f22903ba85c8ff85efe</td></tr>
<tr><td colspan=2><b>buildstoragerom</b></td></tr>
<tr><td>storage_sm_rom.json</td><td>676c3f58263fc284bc53ef949dd1acedcfb090f3287ee080b2a277ed2157894a</td></tr>
<tr><td colspan=2><b>buildconstants</b></td></tr>
<tr><td>zkevm.const</td><td>77c18ef9c1445beea1e0bc05ebb50b2ab67fcc59fd579ee422b00572ce4ab582</td></tr>
<tr><td colspan=2><b>buildstarkinfo</b></td></tr>
<tr><td>zkevm.starkstruct.json</td><td>9e2d94d76396a430d95d305340e5cf62e03fcaf18d6d3d2058bef6a4f8c50e8e</td></tr>
<tr><td>zkevm.starkinfo.json</td><td>5d777c79b68570e51979e1c50aaa11d54375a028dd4221f468dd31b944748dce</td></tr>
<tr><td colspan=2><b>buildconstanttree</b></td></tr>
<tr><td>zkevm.verkey.json</td><td>32604064219ca291fc778b1e0c62cb887a4f0b625d350df86e0c99beb6e6bac4</td></tr>
<tr><td>zkevm.consttree</td><td></td></tr>
<tr><td colspan=2><b>gencircom</b></td></tr>
<tr><td>zkevm.verifier.circom</td><td>f3bbb6effee41eb8884c63681350f8c0d2410e8418ccb6127a1e617277144425</td></tr>
<tr><td colspan=2><b>compilecircom</b></td></tr>
<tr><td>zkevm.verifier.r1cs</td><td>3c1483234fc00a655dda4d362c64f642d7013f6c165763fa8da575af2a972765</td></tr>
<tr><td>zkevm.verifier.sym</td><td>5f2ba8617894d4b88e68e37e5333e7a654f0838028a5ce44bed7097ed5288f02</td></tr>
<tr><td colspan=2><b>c12a_setup</b></td></tr>
<tr><td>c12a.pil</td><td>13b74f6e33dcbfcb9aa1a5eb7a93691635f51f33aa91e7c867dec11509c93f4d</td></tr>
<tr><td>c12a.const</td><td>eb2e71cdc818a4dfe34741ab6faa1b46adc72b2dba8ec4249dfb7d18f360c18a</td></tr>
<tr><td>c12a.exec</td><td>63485493e7f028bfd90063d6c53d7f82a2bd4711f05c0f398af758b04b9489e6</td></tr>
<tr><td colspan=2><b>c12a_buildstarkinfo</b></td></tr>
<tr><td>c12a.starkstruct.json</td><td>c8ceea75f0aa05fdbdb20ac41b224355fde07a0dbeecd6649ff8c2636b9a759c</td></tr>
<tr><td>c12a.starkinfo.json</td><td>7322ea8530b020ff269d3f7805357a387f94d41b38a5e174d5ecfa3c6af0148b</td></tr>
<tr><td colspan=2><b>c12a_buildconstanttree</b></td></tr>
<tr><td>c12a.verkey.json</td><td>bc3c0f2e138e87dd57f1ebb4e148c12c6f08d2a45bcb64ea8c91d992c545787c</td></tr>
<tr><td>c12a.consttree</td><td></td></tr>
<tr><td colspan=2><b>c12a_gencircom</b></td></tr>
<tr><td>c12a.verifier.circom</td><td>78b8dbc8f5f8afd4a77aa01f05e51b3d8ed6d6b8af3cc2d37e7fb5c189691aad</td></tr>
<tr><td colspan=2><b>recursive1_gencircom</b></td></tr>
<tr><td>recursive1.circom</td><td>83543e99e0a1f660761fa8a06310dfd9b69d0c0a358a73b6baec55d9587234e5</td></tr>
<tr><td colspan=2><b>recursive1_compile</b></td></tr>
<tr><td>recursive1.r1cs</td><td>0583c70590b5abb8ca9cbacfcd7f33ace109537e24be9b947e122dfabdf95d66</td></tr>
<tr><td>recursive1.sym</td><td>1b46b7592fe98fe598d486925ec2e6e2dfa944635bc52b57da7678f2d67f84a0</td></tr>
<tr><td colspan=2><b>recursive1_setup</b></td></tr>
<tr><td>recursive1.pil</td><td>94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b</td></tr>
<tr><td>recursive1.const</td><td>b2448b85aa048d885cb691cc66ce26deadac77d465bd2e01142d22cd26e147b9</td></tr>
<tr><td>recursive1.exec</td><td>9c9e3f44b4740a4a694509b24441ebbefdb1a08713d783b3aad7b4ca52eaa0be</td></tr>
<tr><td colspan=2><b>recursive1_buildstarkinfo</b></td></tr>
<tr><td>recursive.starkstruct.json</td><td>8bc8b44a7e493e447af7c04d1a362c2198f3e9b29e425248b7646c36b67fd02c</td></tr>
<tr><td>recursive1.starkinfo.json</td><td>d7e92de911ae2ba54565f044a8566f712c539f1c95f18ef575a6a152a9fded63</td></tr>
<tr><td colspan=2><b>recursive1_buildconstanttree</b></td></tr>
<tr><td>recursive1.verkey.json</td><td>5980a534f46d0d7d132773719d0a8a0c09957ed62162bf80de82878bfb96692f</td></tr>
<tr><td>recursive1.consttree</td><td></td></tr>
<tr><td colspan=2><b>recursive1_verifier_gencircom</b></td></tr>
<tr><td>recursive1.verifier.circom</td><td>4efe368b5ef6ff5444a912870d481ed2ee82a2305a8954baee28ffe830f11cd2</td></tr>
<tr><td colspan=2><b>recursive2_gencircom</b></td></tr>
<tr><td>recursive2.circom</td><td>2403af9f05532ec723887cf437eff099d4d9c11dffd4edca3cfe203394c92bc6</td></tr>
<tr><td colspan=2><b>recursive2_compile</b></td></tr>
<tr><td>recursive2.r1cs</td><td>bd1f3b6ff423ebc1ec0960b7595c4ee6d8bbe77a5146f3ef1904b2d7f0418a7c</td></tr>
<tr><td>recursive2.sym</td><td>02d222e72be5ff927f759382c4950ba4af9ba36a6535e5a85fd23284d33ed54c</td></tr>
<tr><td colspan=2><b>recursive2_setup</b></td></tr>
<tr><td>recursive2.pil</td><td>94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b</td></tr>
<tr><td>recursive2.const</td><td>5d33198f77bb6e66b377114b64e2a0698219b75fab06dcbf6916a200d6bb9a5f</td></tr>
<tr><td>recursive2.exec</td><td>8e54e6994f95dddf12f0fbe53c9f59cc37d6a3759be9c9533d00c1e35792e1e4</td></tr>
<tr><td colspan=2><b>recursive2_buildstarkinfo</b></td></tr>
<tr><td>recursive2.starkinfo.json</td><td>d7e92de911ae2ba54565f044a8566f712c539f1c95f18ef575a6a152a9fded63</td></tr>
<tr><td colspan=2><b>recursive2_buildconstanttree</b></td></tr>
<tr><td>recursive2.verkey.json</td><td>181a09dbed53d260a00d89309e4bca2b5e6fea6324dcd3c85e7721fd5e5de11f</td></tr>
<tr><td>recursive2.consttree</td><td></td></tr>
<tr><td colspan=2><b>recursive2_verifier_gencircom</b></td></tr>
<tr><td>recursive2.verifier.circom</td><td>4efe368b5ef6ff5444a912870d481ed2ee82a2305a8954baee28ffe830f11cd2</td></tr>
<tr><td colspan=2><b>recursivef_gencircom</b></td></tr>
<tr><td>recursivef.circom</td><td>1645f01cbe10cfeb0d9f97c75e4bffbd59c5397456ae5bc00c56b2223db7dda6</td></tr>
<tr><td colspan=2><b>recursivef_compile</b></td></tr>
<tr><td>recursivef.r1cs</td><td>890f9478ae714050dfde490593cdb049fbe4b556b75fd3509e8e712a97b9100c</td></tr>
<tr><td>recursivef.sym</td><td>dc222486289156d8a0a60611afd7988252e6eb450111ab95041e923a8f68cce4</td></tr>
<tr><td colspan=2><b>recursivef_setup</b></td></tr>
<tr><td>recursivef.pil</td><td>62527bfc12f535e8fa3a6dd7055bc595b27fc491f7203987108ee3d13283dbfe</td></tr>
<tr><td>recursivef.const</td><td>d4cca4ae37f7cbb23117b613d6e2ca360ac45221593d381ffe01d028c0be7767</td></tr>
<tr><td>recursivef.exec</td><td>9f4e5c4b20a55a28d7c9753ca41226b7116eea28d24e65e47fd7d1331a13d721</td></tr>
<tr><td colspan=2><b>recursivef_buildstarkinfo</b></td></tr>
<tr><td>recursivef.starkstruct.json</td><td>ba99ad986178db98b1a867bb9d8592fa6ba5c29d9233fd939d01424425ce6cba</td></tr>
<tr><td>recursivef.starkinfo.json</td><td>5d2a3e02a0e5ea64f04d6ad8a8fc3f29edb4c959acde2460de11e21fb17c02c7</td></tr>
<tr><td colspan=2><b>recursivef_buildconstanttree</b></td></tr>
<tr><td>recursivef.verkey.json</td><td>0e661f73837ee435818355bd03473519e181553e93826d0488ce37ad7de54946</td></tr>
<tr><td>recursivef.consttree</td><td></td></tr>
<tr><td colspan=2><b>recursivef_verifier_gencircom</b></td></tr>
<tr><td>recursivef.verifier.circom</td><td>49e7ffac443928992740f6adde19955d9b2ec7470f19060ee61d5a0fcb937635</td></tr>
<tr><td colspan=2><b>final_gencircom</b></td></tr>
<tr><td>final.circom</td><td>74a06304ce73b282a520c358baead152dad790b0aa6b7031f6ba8c00166be459</td></tr>
<tr><td colspan=2><b>final_compile</b></td></tr>
<tr><td>final.r1cs</td><td>34453e1dc378df36b6608bb6d079504dcec8073558b9a1dcdfcb0feaeac13b6c</td></tr>
<tr><td>final.sym</td><td>66d090bedc8a30f43e6127522bd06fc357e0b5180e7f52149f215c9056aa5803</td></tr>
<tr><td colspan=2><b>fflonk_setup</b></td></tr>
<tr><td>final.fflonk.zkey</td><td>db8ce4d6da6f20e494568b3150e3c17db1aa987c9baf5e91d126d8d1bceba549</td></tr>
<tr><td colspan=2><b>fflonk_evk</b></td></tr>
<tr><td>final.fflonk.verkey.json</td><td>fe3d4c74ff681a881ea00bdbf449cf303240560c0908f91f383e161bd71ff927</td></tr>
<tr><td>dependencies.txt</td><td>9f9c3c76fe1832250aa8e332d1bba55bbdf963fd06b830aeb743548963722153</td></tr>
<tr><td colspan=2><b>fflonk_solidity</b></td></tr>
<tr><td>final.fflonk.verifier.sol</td><td>3e0aec706be943e508990b5fc5c7fa7146710f47bf71d6b668dbb2d8bcd27ea1</td></tr>
</table>


<div class="meta_for_parser tablespecs" style="visibility:hidden">
sed "s/^0x//;s/\([0-9a-f]\{40\}\)/\1\n/g" FflonkVerifier.sol.compiled.bytecode | head
sed "s/^0x//;s/\([0-9a-f]\{40\}\)/\1\n/g" FflonkVerifier.sol.compiled.bytecode | tail
</div>