# Verify deployment on Mainnet the proof verifier smart contract (fork.12)

In order to verify the smart contract, you will need a machine with at least 512GB of RAM and 32 cores.

In this tutorial we will give instructions for a r6a.16xlarge aws instance. This instance has 32 cores 64 threads. The instance will use Ubuntu 22.04 LTS and the cost of the instance is about 3.62$/h. This process is quite long, it takes approximately 4-5 hours.

If using GCP, these instructions worked fine in a "n2d-highmem-64 (64 vCPUs, 512 GB memory) AMD Milan"

So lets start by launching and instance.

## Basic OS preparation

```bash
sudo apt update
sudo apt install -y tmux git curl jq
sudo apt install -y build-essential libomp-dev libgmp-dev nlohmann-json3-dev libpqxx-dev nasm libgrpc++-dev libprotobuf-dev grpc-proto libsodium-dev uuid-dev libsecp256k1-dev
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

## Install Python deps

```bash
apt install python3-pip
pip install z3-solver==4.13.0.0
```

The version of node should be: 18 (e.g. 18.19.0 )
Note that hardhat will complain that this node version is not supported byt hardhat. It seems to be just a warning and `v24.8.0` produces the same contract bytecode, so maybe it can be ignored.

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

Install Rust
```
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Install and compile circom (RUST)

```bash
cd ~
cd circom
cargo build --release
cargo install --path circom
export PATH=$PATH:~/.cargo/bin
echo 'PATH=$PATH:~/.cargo/bin' >> ~/.profile
circom --version
```

The version of circom should be: 2.1.8

## Prepare fast build constant tree tool and fflonk setup

Get the zkevm-prover and checkout to the tag. TODO: Check  if it works with RC16.

Notice the `sed` which fixes a minor problem in the Makefile causing the `bctree` to not compile correctly.

```
cd ~
git clone https://github.com/0xPolygonHermez/zkevm-prover.git
cd zkevm-prover
git checkout v8.0.0-RC9
git submodule init
git submodule update
sed -i -E 's|^(SRCS_BCT := .*./src/starkpil/stark_info\.\*)|\1 ./tools/sm/sha256/sha256.cpp ./tools/sm/sha256/bcon/bcon_sha256.cpp|' Makefile
make -j bctree fflonk_setup
```

this step takes less than 1 minute.

## Prepare and launch setup (zkevm-proverjs)

Now checkout to [v8.0.0-fork.12](https://github.com/0xPolygon/zkevm-proverjs/releases/tag/v8.0.0-fork.12).

Notice the `sed` which changes the link containing the powers of tau file, which was moved from aws to google.

```bash
cd ~
git clone https://github.com/0xPolygonHermez/zkevm-proverjs.git
cd zkevm-proverjs
git checkout v8.0.0-fork.12
rm -f package-lock.json
sed -i -E 's|https://hermez\.s3-eu-west-1\.amazonaws\.com/powersOfTau28_hez_final\.ptau|https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final.ptau|g' package.json
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
npm i hardhat@2.26.3
npm install --save-dev prettier@3.2.4 prettier-plugin-solidity@1.3.1
mkdir -p contracts/verifiers
```

To generate the same bycode it's important recover exactlly same options used during compilation, we found this information with contract information on etherscan (Settings).
Copy this information inside the file ~/contract/settings.json, as follows:

```bash
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
echo -e "module.exports={solidity:{compilers:[{version: \"0.8.20\",settings:$(cat settings.json)}]}}" > hardhat.config.js
cp ~/zkevm-proverjs/build/proof/build/final.fflonk.verifier.sol contracts/verifiers/FflonkVerifier_12.sol
sed -i 's/FflonkVerifier {/FflonkVerifier_12 {/' contracts/verifiers/FflonkVerifier_12.sol
cat <<EOF >.prettierrc
{
    "plugins": [
        "prettier-plugin-solidity"
    ],
    "printWidth": 120,
    "tabWidth": 4,
    "useTabs": false,
    "semi": true,
    "singleQuote": false,
    "quoteProps": "as-needed",
    "trailingComma": "es5",
    "bracketSpacing": false,
    "arrowParens": "always",
    "overrides": [
        {
            "files": "*.sol",
            "options": {
                "printWidth": 80,
                "tabWidth": 4,
                "useTabs": false,
                "singleQuote": false,
                "bracketSpacing": false,
                "explicitTypes": "always"
            }
        }
    ]
}
EOF
```

Once the project structure is created, we proceed to copy the smart contract generated in the previous step. This smart contract was saved on _~/zkevm-proverjs/build/proof_, and must be copied to _contracts/verifiers_ with exactly the name _Verifier.sol_. If the name or the path changes, the hash of metadata changes too, for this reason, is essential to respect the name and the path. To do it could execute these commands

```bash
cd ~/contract
cp ~/zkevm-proverjs/build/proof/build/final.fflonk.verifier.sol contracts/verifiers/FflonkVerifier_12.sol
sed -i "s/FflonkVerifier {/FflonkVerifier_12 {/" contracts/verifiers/FflonkVerifier_12.sol
sha256sum contracts/verifiers/FflonkVerifier_12.sol
```

The result should be:

```
60f5c9a01402418d4f9cc4cc56d8da1d2e5065cf6802297bae1a0848618a78c9
```

To compile smartcontract execute following command:

```bash
npx prettier --write "contracts/**/*.sol"
npx hardhat compile
```

> NOTE: During compilation warning is shown:
> Warning: Unused function parameter. Remove or comment out the variable name to silence this warning.
> --> contracts/verifiers/FflonkVerifier.sol:162:26:

Bytecode of smartcontract was on bytecode property of json file _FflonkVerifier_ generated on path _    _

```

```

Verify bytecode compiled:

```
cd ~/contract
cat ./artifacts/contracts/verifiers/FflonkVerifier_12.sol/FflonkVerifier_12.json | jq .bytecode -r | tee FflonkVerifier.sol.compiled.bytecode | sha256sum
```

The result should be:

```
beeb862ce24e8f111f0a885922d3bdd941f85ba3986ff1076db7454013786aa8
```

## Download bytecode of deployed smartcontract

To download bytecode of deployed smartcontract, need the address of smart contract, in this case it's 0x9B9671dB83CfcB4508bF361942488C5cA2b1286D.

### Download by copying data manually

Go to Etherscan or Beaconcha to get transaction bytecode.

Associated with address 0x9B9671dB83CfcB4508bF361942488C5cA2b1286D found the transacction 0x47ce4fb6fc1bc6ac737dd54b33b5618a50e644dd24ff32a72fabfb2fdc0f3f33.

-   ### Etherscan (https://etherscan.io)
    https://etherscan.io/address/0x9B9671dB83CfcB4508bF361942488C5cA2b1286D
    https://etherscan.io/tx/0x47ce4fb6fc1bc6ac737dd54b33b5618a50e644dd24ff32a72fabfb2fdc0f3f33


    Click to show more > Input Data > Select all data and copy to clipboard.

-   ### Beacocha (https://beaconcha.in)
    https://beaconcha.in/address/0x9B9671dB83CfcB4508bF361942488C5cA2b1286D
    https://beaconcha.in/tx/0x47ce4fb6fc1bc6ac737dd54b33b5618a50e644dd24ff32a72fabfb2fdc0f3f33

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
beeb862ce24e8f111f0a885922d3bdd941f85ba3986ff1076db7454013786aa8  FflonkVerifier.sol.compiled.bytecode
beeb862ce24e8f111f0a885922d3bdd941f85ba3986ff1076db7454013786aa8  FflonkVerifier.sol.explorer.bytecode
```

## Generated files hash

c8ceea75f0aa05fdbdb20ac41b224355fde07a0dbeecd6649ff8c2636b9a759c  build/c12a.starkstruct.json
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/dependencies.txt
90ec86f5e006d0603cd394cc83ca271c7037a7ff84912cc587bc515efb69b357  build/final.fflonk.verifier.sol
5fc904df53ad335fd25ee09e888e557b70f3264f3a7637bd988d8ae910c99471  build/final.r1cs
df4e27d025b52579326413f66a8350edeb3e0e1a1346ac52bb90872bd847168e  build/final.sym
cd50862af51322cd6447a5382b1a7aec16f6847d09b2e9dfe58baf42410bf30e  build/final_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  build/final_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  build/final_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  build/final_cpp/circom.hpp
aac65fe8ce1bec291c1bab8edf9f8895aca800e42794e01e33ffb3f2cb9b9aff  build/final_cpp/final.cpp
be717013bc0a8db7c3f0d71526777b78f56b99a692c19bd6d816088d5f2f8098  build/final_cpp/final.dat
8d261723a9d05668dcb2b5f4e53e84498476b3cfeb17d84834bd434b246780c1  build/final_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  build/final_cpp/fr.cpp
42339e6a440b40fba7befcb2bb8b2b1c702a30bbfb7947e131130eeb7a0eff44  build/final_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  build/final_cpp/main.cpp
1ce3bda05b58fb6e88af52a5d1f1781227c3332b5414b19fa772d15ecff24f45  build/final_js/final.wasm
e9f90211859797466368231b5f02afeb84afa497c3ccd04129e0a57a5c5a3eff  build/final_js/generate_witness.js
2bf018b05cb6dc399e72f57721d0f7b236b1a4a2d438d8b1c6763e9cd38ac8a8  build/final_js/witness_calculator.js
229783b460b741e7e7c4ab2c261fff325933f566f04f96da8420cebaa8b61da6  build/package-lock.json
7d46d90241e5c3d3554f8f15f2ad1d52a851288f641cea802e090c2211ab4151  build/package.json
8bc8b44a7e493e447af7c04d1a362c2198f3e9b29e425248b7646c36b67fd02c  build/recursive.starkstruct.json
a3f90f96acd08cab97cb44cf56b5803a218e4d324f71ac3046cb2bac1ae12739  build/recursive1.r1cs
1b46b7592fe98fe598d486925ec2e6e2dfa944635bc52b57da7678f2d67f84a0  build/recursive1.sym
510b26e6202b989da992ab7ec1c602259174236966c2b3c720f2402b7e5b8f0c  build/recursive1_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  build/recursive1_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  build/recursive1_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  build/recursive1_cpp/circom.hpp
e0d14dabd9d604d8ac5fe13a69db712f1c02634a35647ee6831d77d991618a3b  build/recursive1_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  build/recursive1_cpp/fr.cpp
3cc9d2064f68184316663175602f6a476a191e9403483d21d073e560ca83d4c7  build/recursive1_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  build/recursive1_cpp/main.cpp
b5473b163046f3f1708b342d4f3144b2a48f9dbfa895f0933cbc64bab67b0c64  build/recursive1_cpp/recursive1.cpp
d59d32ec3d5350a90086c86424a1f2a4fc03c862f2f915a6a19079a1423a83c6  build/recursive1_cpp/recursive1.dat
e9f90211859797466368231b5f02afeb84afa497c3ccd04129e0a57a5c5a3eff  build/recursive1_js/generate_witness.js
c6f58108af4d9e2b66a6e25e220eda1fedbaaed341411f2826d446424065cb94  build/recursive1_js/recursive1.wasm
2bf018b05cb6dc399e72f57721d0f7b236b1a4a2d438d8b1c6763e9cd38ac8a8  build/recursive1_js/witness_calculator.js
db43902e4b8b4de1548645af81504bece6de809004676fd3a840ec04dc8e11c3  build/recursive2.r1cs
02d222e72be5ff927f759382c4950ba4af9ba36a6535e5a85fd23284d33ed54c  build/recursive2.sym
2114d97ae95b5ffb890d0d8391d0b23335b7bf393837fe042c902d459e2ba424  build/recursive2_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  build/recursive2_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  build/recursive2_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  build/recursive2_cpp/circom.hpp
e0d14dabd9d604d8ac5fe13a69db712f1c02634a35647ee6831d77d991618a3b  build/recursive2_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  build/recursive2_cpp/fr.cpp
3cc9d2064f68184316663175602f6a476a191e9403483d21d073e560ca83d4c7  build/recursive2_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  build/recursive2_cpp/main.cpp
481ede9860ec9e05099b33a38bcee595f22e1310e1557530a182473b534734c8  build/recursive2_cpp/recursive2.cpp
5c8e4218c2a200c31390aa86dad6245354f506b589a696136db3d3d0f6a09aa5  build/recursive2_cpp/recursive2.dat
e9f90211859797466368231b5f02afeb84afa497c3ccd04129e0a57a5c5a3eff  build/recursive2_js/generate_witness.js
6283cd20205c6607389a7e9819c75f6e53eeb6dcca26936622f00ab108770986  build/recursive2_js/recursive2.wasm
2bf018b05cb6dc399e72f57721d0f7b236b1a4a2d438d8b1c6763e9cd38ac8a8  build/recursive2_js/witness_calculator.js
b16ffa4a484d5aaf74939074f3828d44b874644fbdc2fc4fb11b9ab466f6f56b  build/recursivef.r1cs
ba99ad986178db98b1a867bb9d8592fa6ba5c29d9233fd939d01424425ce6cba  build/recursivef.starkstruct.json
dc222486289156d8a0a60611afd7988252e6eb450111ab95041e923a8f68cce4  build/recursivef.sym
275df6dfc94d6c5fa080dc66d3d5b0572692ff687dbfbd8d339d6b564bb4c4f6  build/recursivef_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  build/recursivef_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  build/recursivef_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  build/recursivef_cpp/circom.hpp
e0d14dabd9d604d8ac5fe13a69db712f1c02634a35647ee6831d77d991618a3b  build/recursivef_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  build/recursivef_cpp/fr.cpp
3cc9d2064f68184316663175602f6a476a191e9403483d21d073e560ca83d4c7  build/recursivef_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  build/recursivef_cpp/main.cpp
a3a0185749d741fb1c9bc4f153f81d4f4f81cbc588b6073d1abaf3bfceba7deb  build/recursivef_cpp/recursivef.cpp
f44c036b758f513b58de044c89dd181b1a9a5eeb0954b111ef86feb34478a716  build/recursivef_cpp/recursivef.dat
e9f90211859797466368231b5f02afeb84afa497c3ccd04129e0a57a5c5a3eff  build/recursivef_js/generate_witness.js
2d086dac118db6f1ec6a66927b42680c7d1949fd4c79595868220e240d55123f  build/recursivef_js/recursivef.wasm
2bf018b05cb6dc399e72f57721d0f7b236b1a4a2d438d8b1c6763e9cd38ac8a8  build/recursivef_js/witness_calculator.js
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/buildchelpers
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/buildconstants
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/buildconstanttree
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/buildpil
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/buildrom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/buildstoragerom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/c12a_buildchelpers
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/c12a_buildconstanttree
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/c12a_buildstarkinfo
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/c12a_gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/c12a_setup
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/calculateimpols
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/compilecircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/fflonk_evk
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/fflonk_setup
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/fflonk_solidity
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/final_compile
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/final_gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/genpilcode
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/preparepil
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive1_buildchelpers
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive1_buildconstanttree
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive1_buildstarkinfo
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive1_compile
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive1_gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive1_setup
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive1_verifier_gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive2_buildchelpers
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive2_buildconstanttree
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive2_buildstarkinfo
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive2_compile
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive2_gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive2_setup
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive2_verifier_gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive_pil_check
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursive_verifier_check
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursivef_buildchelpers
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursivef_buildconstanttree
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursivef_buildstarkinfo
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursivef_compile
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursivef_gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursivef_setup
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/recursivef_verifier_gencircom
d478c26af21cc1ce56414f62ce1edd9ac441a351133bba1494341fe6897e8113  build/steps/sha256
b922e4bfacedb33cc23d6fec22e8e05358070f94aaf9733f25273103d1bec10e  build/zkevm.impols.json
78e76595a44a1eadd9a9499eee3c70447d1e23fe1777ae8aebee2905351d4eed  build/zkevm.infopil.json
9e2d94d76396a430d95d305340e5cf62e03fcaf18d6d3d2058bef6a4f8c50e8e  build/zkevm.starkstruct.json
11abeca7bc35ed95dc7c20b29260cda920e6f46592e1d03d901b2893083f5ead  build/zkevm.verifier.r1cs
ee718b0fde7dd0c73ae017fd17237ab811bc278fbe52b17ff2905ca91b9d1f76  build/zkevm.verifier.sym
ba88f146ff134bb9aeb8f9b2e056f698c56c2e25a834c78f1b5e7fc89b81b59d  build/zkevm.verifier_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  build/zkevm.verifier_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  build/zkevm.verifier_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  build/zkevm.verifier_cpp/circom.hpp
e0d14dabd9d604d8ac5fe13a69db712f1c02634a35647ee6831d77d991618a3b  build/zkevm.verifier_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  build/zkevm.verifier_cpp/fr.cpp
3cc9d2064f68184316663175602f6a476a191e9403483d21d073e560ca83d4c7  build/zkevm.verifier_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  build/zkevm.verifier_cpp/main.cpp
b6ab6661872c85fc9ecd0db177690a36851e3ea80224d1b51216e7901f634b50  build/zkevm.verifier_cpp/zkevm.verifier.cpp
feb427a1d07461dad5dff0528739a473f3d9c2a853adfb5cd982a9dc19373882  build/zkevm.verifier_cpp/zkevm.verifier.dat
e9f90211859797466368231b5f02afeb84afa497c3ccd04129e0a57a5c5a3eff  build/zkevm.verifier_js/generate_witness.js
2bf018b05cb6dc399e72f57721d0f7b236b1a4a2d438d8b1c6763e9cd38ac8a8  build/zkevm.verifier_js/witness_calculator.js
28a7fe213b3a9089cd8e70a453cb41f76471966170f8370df33e12177d8973f7  build/zkevm.verifier_js/zkevm.verifier.wasm
3a0007a3e93a69d8babf108cf4a805f936ca46cfd4336ac73f6b97a943aa36aa  c_files/c12a.chelpers/C12aSteps.hpp
cd50862af51322cd6447a5382b1a7aec16f6847d09b2e9dfe58baf42410bf30e  c_files/final_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  c_files/final_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  c_files/final_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  c_files/final_cpp/circom.hpp
aac65fe8ce1bec291c1bab8edf9f8895aca800e42794e01e33ffb3f2cb9b9aff  c_files/final_cpp/final.cpp
be717013bc0a8db7c3f0d71526777b78f56b99a692c19bd6d816088d5f2f8098  c_files/final_cpp/final.dat
8d261723a9d05668dcb2b5f4e53e84498476b3cfeb17d84834bd434b246780c1  c_files/final_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  c_files/final_cpp/fr.cpp
42339e6a440b40fba7befcb2bb8b2b1c702a30bbfb7947e131130eeb7a0eff44  c_files/final_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  c_files/final_cpp/main.cpp
bcb6885a8fd72c866633b54d79bfc1fc035617daecb2f4633651ea183f51bd59  c_files/recursive1.chelpers/Recursive1Steps.hpp
510b26e6202b989da992ab7ec1c602259174236966c2b3c720f2402b7e5b8f0c  c_files/recursive1_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  c_files/recursive1_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  c_files/recursive1_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  c_files/recursive1_cpp/circom.hpp
e0d14dabd9d604d8ac5fe13a69db712f1c02634a35647ee6831d77d991618a3b  c_files/recursive1_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  c_files/recursive1_cpp/fr.cpp
3cc9d2064f68184316663175602f6a476a191e9403483d21d073e560ca83d4c7  c_files/recursive1_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  c_files/recursive1_cpp/main.cpp
b5473b163046f3f1708b342d4f3144b2a48f9dbfa895f0933cbc64bab67b0c64  c_files/recursive1_cpp/recursive1.cpp
d59d32ec3d5350a90086c86424a1f2a4fc03c862f2f915a6a19079a1423a83c6  c_files/recursive1_cpp/recursive1.dat
e5f1247710c478f825f15bcd6063dd8d708dc1c361d899aad447f3dee0a84baf  c_files/recursive2.chelpers/Recursive2Steps.hpp
2114d97ae95b5ffb890d0d8391d0b23335b7bf393837fe042c902d459e2ba424  c_files/recursive2_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  c_files/recursive2_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  c_files/recursive2_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  c_files/recursive2_cpp/circom.hpp
e0d14dabd9d604d8ac5fe13a69db712f1c02634a35647ee6831d77d991618a3b  c_files/recursive2_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  c_files/recursive2_cpp/fr.cpp
3cc9d2064f68184316663175602f6a476a191e9403483d21d073e560ca83d4c7  c_files/recursive2_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  c_files/recursive2_cpp/main.cpp
481ede9860ec9e05099b33a38bcee595f22e1310e1557530a182473b534734c8  c_files/recursive2_cpp/recursive2.cpp
5c8e4218c2a200c31390aa86dad6245354f506b589a696136db3d3d0f6a09aa5  c_files/recursive2_cpp/recursive2.dat
d7944bedaaa0a79bc279d74e94becb00f1c3e9dcb6e32acd54f3fa46b0f5c4b2  c_files/recursivef.chelpers/RecursiveFSteps.hpp
275df6dfc94d6c5fa080dc66d3d5b0572692ff687dbfbd8d339d6b564bb4c4f6  c_files/recursivef_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  c_files/recursivef_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  c_files/recursivef_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  c_files/recursivef_cpp/circom.hpp
e0d14dabd9d604d8ac5fe13a69db712f1c02634a35647ee6831d77d991618a3b  c_files/recursivef_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  c_files/recursivef_cpp/fr.cpp
3cc9d2064f68184316663175602f6a476a191e9403483d21d073e560ca83d4c7  c_files/recursivef_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  c_files/recursivef_cpp/main.cpp
a3a0185749d741fb1c9bc4f153f81d4f4f81cbc588b6073d1abaf3bfceba7deb  c_files/recursivef_cpp/recursivef.cpp
f44c036b758f513b58de044c89dd181b1a9a5eeb0954b111ef86feb34478a716  c_files/recursivef_cpp/recursivef.dat
3219b6827f8e77062cd809db7f6262ba995b6951c2d07e89af9af79a45f03236  c_files/zkevm.chelpers/ZkevmSteps.hpp
ba88f146ff134bb9aeb8f9b2e056f698c56c2e25a834c78f1b5e7fc89b81b59d  c_files/zkevm.verifier_cpp/Makefile
3b2a847cd01a06391f3d3ccd37ae0deda4c61b40b6ec01726c21dd6993be64b0  c_files/zkevm.verifier_cpp/calcwit.cpp
9ffa8ad709695d44857e24b08eb4c5fc3465c198f8de06431db1fcbf505d1ae4  c_files/zkevm.verifier_cpp/calcwit.hpp
46e657f0ce98a5878e0610242c2327cc20f6117b46aa2c55353bf3dace70a6c8  c_files/zkevm.verifier_cpp/circom.hpp
e0d14dabd9d604d8ac5fe13a69db712f1c02634a35647ee6831d77d991618a3b  c_files/zkevm.verifier_cpp/fr.asm
4078f766e2ec8311a663ca0abfc5148319c4225074ccc85f789102fb26e39c54  c_files/zkevm.verifier_cpp/fr.cpp
3cc9d2064f68184316663175602f6a476a191e9403483d21d073e560ca83d4c7  c_files/zkevm.verifier_cpp/fr.hpp
2af134571f5ee048d5d91fd72f1f90de8a33f568cb02ec65f2239b388d0015a2  c_files/zkevm.verifier_cpp/main.cpp
b6ab6661872c85fc9ecd0db177690a36851e3ea80224d1b51216e7901f634b50  c_files/zkevm.verifier_cpp/zkevm.verifier.cpp
feb427a1d07461dad5dff0528739a473f3d9c2a853adfb5cd982a9dc19373882  c_files/zkevm.verifier_cpp/zkevm.verifier.dat
9de2275e002c9f8ae7b96f2207a0f9cfbc0f1b0c92818853456c8f922502eefe  circom/c12a.verifier.circom
74a06304ce73b282a520c358baead152dad790b0aa6b7031f6ba8c00166be459  circom/final.circom
83543e99e0a1f660761fa8a06310dfd9b69d0c0a358a73b6baec55d9587234e5  circom/recursive1.circom
4efe368b5ef6ff5444a912870d481ed2ee82a2305a8954baee28ffe830f11cd2  circom/recursive1.verifier.circom
87ec46431203280aafa2facf50156b5fda2b439bed3b5dd1b18e3ae0fbce064e  circom/recursive2.circom
4efe368b5ef6ff5444a912870d481ed2ee82a2305a8954baee28ffe830f11cd2  circom/recursive2.verifier.circom
d172debfb29890402242093ce345350cc588b117feffc2b7c46800ba7f3569db  circom/recursivef.circom
11052e4f2200236b868f71a9a7814c86ac1c5a50cae4a60a4599faf937f92fa0  circom/recursivef.verifier.circom
8b378b9aa3cfe9880c509d51e9d58843270fadbb9004498bdca11f755f641544  circom/zkevm.verifier.circom
3337432b4b9de283593a135628c0984dc5cd51b09502a1b97ca6ff6c67de0a1b  config/c12a/c12a.chelpers.bin
529737dbc001bb5376e0521118d373674274e9c66919ea9284260eb4d2d02319  config/c12a/c12a.chelpers_generic.bin
f81a9e0d224322de4d90f51f74e1fb852dc5a792040231558980a4aa25840ac1  config/c12a/c12a.const
89bb576aa687ddf18bf89340fe3ebc6f13192204a7547396314c71742ff06704  config/c12a/c12a.exec
7322ea8530b020ff269d3f7805357a387f94d41b38a5e174d5ecfa3c6af0148b  config/c12a/c12a.starkinfo.json
617de81691106c7536e6386afe3c19c08872e15e6c14c47d9d0c832ee235e8e2  config/c12a/c12a.verkey.json
ab067032e19f358874a2481e4e26150e168d782876b9e5bce2a7adc4e2c36215  config/final/final.fflonk.verkey.json
5d9e9149ba013c2d9f5edfdafea446df38a7baf171b8007bc5980fc40a11cfd3  config/final/final.fflonk.zkey
be717013bc0a8db7c3f0d71526777b78f56b99a692c19bd6d816088d5f2f8098  config/final/final.verifier.dat
9456b3dc79f596bd208bbc056565a3ab22f638b840ee11cdc0294bbf94e89836  config/recursive1/recursive1.chelpers.bin
6ffc64073f9f2d856c40cf556dccb35f3bc9489a60421bf09bfe44eae0e3b579  config/recursive1/recursive1.chelpers_generic.bin
a4220fdc1f3576d69b633d7ae713767cbe6c961ab525118a0de884590fb7bbb6  config/recursive1/recursive1.const
9c9e3f44b4740a4a694509b24441ebbefdb1a08713d783b3aad7b4ca52eaa0be  config/recursive1/recursive1.exec
d7e92de911ae2ba54565f044a8566f712c539f1c95f18ef575a6a152a9fded63  config/recursive1/recursive1.starkinfo.json
d59d32ec3d5350a90086c86424a1f2a4fc03c862f2f915a6a19079a1423a83c6  config/recursive1/recursive1.verifier.dat
b1643133756b624db4932f4be4ad8d212480a230d125c52667008d1572027c66  config/recursive1/recursive1.verkey.json
9456b3dc79f596bd208bbc056565a3ab22f638b840ee11cdc0294bbf94e89836  config/recursive2/recursive2.chelpers.bin
6ffc64073f9f2d856c40cf556dccb35f3bc9489a60421bf09bfe44eae0e3b579  config/recursive2/recursive2.chelpers_generic.bin
766be5d93cd6201ee10bc27248fb0905af74649b220b96490c7a141108f71757  config/recursive2/recursive2.const
8e54e6994f95dddf12f0fbe53c9f59cc37d6a3759be9c9533d00c1e35792e1e4  config/recursive2/recursive2.exec
d7e92de911ae2ba54565f044a8566f712c539f1c95f18ef575a6a152a9fded63  config/recursive2/recursive2.starkinfo.json
5c8e4218c2a200c31390aa86dad6245354f506b589a696136db3d3d0f6a09aa5  config/recursive2/recursive2.verifier.dat
343c8cb71d61ba0e6999df038442264b94717186aa2bc4e9a8152a70c77c434e  config/recursive2/recursive2.verkey.json
8c3a3e5a6b1cc2aa5d8879c3b0a3997cf290c78dea5b11ad31e27af8db8986f7  config/recursivef/recursivef.chelpers.bin
e8f078653969cee14c5097101d8967bfaec7a9606daca248bb281b32549a3895  config/recursivef/recursivef.chelpers_generic.bin
a55b7a6bc6fbfb3cd17c03a74cf6a799942af2c9232877108df0d84b6be6e6ec  config/recursivef/recursivef.const
9f4e5c4b20a55a28d7c9753ca41226b7116eea28d24e65e47fd7d1331a13d721  config/recursivef/recursivef.exec
5d2a3e02a0e5ea64f04d6ad8a8fc3f29edb4c959acde2460de11e21fb17c02c7  config/recursivef/recursivef.starkinfo.json
f44c036b758f513b58de044c89dd181b1a9a5eeb0954b111ef86feb34478a716  config/recursivef/recursivef.verifier.dat
9de714474935e94c742464835a348e5bcd3807d258fb5e6cff17d6dad4023e62  config/recursivef/recursivef.verkey.json
a4acd44d7811f08643d3e5d65898b8a067001593d765a71c39cd1512ef6fd032  config/scripts/keccak_connections.json
3ebed8bfd38adcd524ac09c79541fe6041aab4b1dc83c242218b1d4b2154d913  config/scripts/keccak_script.json
03f3d561df18c549c4acb656a12c48f6e9900f9fb96912031f9ed28f9e19442e  config/scripts/metadata-rom.txt
23e24f228c733e1bd02da0e09f774aba1b3f26fc72a592925835372e7bba037e  config/scripts/rom.json
1e86011196524678d36686771f21b6fcee4bc11e08e3d1599f042737e8330b07  config/scripts/sha256_gates.json
af04418178fa53d097e207927f993d6c5c4bf37c3b8220621e5d9d99b51f9453  config/scripts/sha256_script.json
676c3f58263fc284bc53ef949dd1acedcfb090f3287ee080b2a277ed2157894a  config/scripts/storage_sm_rom.json
53058053ae34f4a10f940db84f43524abc0cd7b5af9a10feb41e57710becba4c  config/zkevm/zkevm.chelpers.bin
34e4c3050294f073472e9f7f7f8373055e570c3b2eca1e96a57cdb36862db780  config/zkevm/zkevm.chelpers_generic.bin

454c08ae68b67ba30cd0f809a7b11264ea2a1d3a97eed2fa3da1159d1c43d4f1  config/zkevm/zkevm.const
f6348774a957cb37c468efcbb717c25b58df7e8e1b13d6bc7dd7d276c6c6c2a5  config/zkevm/zkevm.starkinfo.json
feb427a1d07461dad5dff0528739a473f3d9c2a853adfb5cd982a9dc19373882  config/zkevm/zkevm.verifier.dat
c0216d19287a41b67ba11f94f2d0cf260fc4ab2ceb0f50ad0e0abd45661c532d  config/zkevm/zkevm.verkey.json
13b74f6e33dcbfcb9aa1a5eb7a93691635f51f33aa91e7c867dec11509c93f4d  pil/c12a.pil
94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b  pil/recursive1.pil
94ea2856942dd0745e2d6443c6988a4fdc65ac2c3173633e897e02b6d7eaad8b  pil/recursive2.pil
62527bfc12f535e8fa3a6dd7055bc595b27fc491f7203987108ee3d13283dbfe  pil/recursivef.pil
e2c88c1ac15a5508988b7ef46d0b9fe0d541bc6fe5a8b82dc35f0473e448f477  pil/zkevm/arith.pil
24802bc7c92a21c855277a59ad7001de77695e26b2cf477f7770f39b7da666a3  pil/zkevm/binary.pil
47e7e801eeffaa1d4ebdabbe047f01605f51a6a5bc03d7dc37d2efb1ccec022c  pil/zkevm/bits2field.pil
0730f313e8df163305ce7c128bf25a71e56c57696496f82ba15531b62f66ccaf  pil/zkevm/bits2field_sha256.pil
b20af23ed3deb6354d7181b58b8538a8a4fd107ca434c61c3ac17aff333cb8c3  pil/zkevm/climb_key.pil
642f30d3de07c05fdd610c211f70ed277b810412bf5480cace5a04601bc8f34d  pil/zkevm/keccakf.pil
d09cf96169ddffaa1fbaac244fff7a7cfd9ab5213431fe1eb8f6e530d7396619  pil/zkevm/main.pil
db52d85ccdbd08a1b54e32fc962b51201375e4cb8f88d403d16f5f94196e54be  pil/zkevm/main.pil.json
60e98f80ef0dec6abc58b46c5dba54d5065f673eb671478c147f852802549338  pil/zkevm/mem.pil
ef0422585240b2f26bddf33db570cd144f1a130c2607190495aefed98291ca97  pil/zkevm/mem_align.pil
92211ea025ad7a782a9f0a21a4101d31475e8733e7c6ae53fffd5f401d599964  pil/zkevm/padding_kk.pil
6c18762cc1ff63cf6e2d741a3ba88c41e262c054602e2d9c83fe9940aca54d05  pil/zkevm/padding_kkbit.pil
75b4966082f3772a8f6845ea00a563eb58643829a517a2be60790353d3905272  pil/zkevm/padding_pg.pil
efdf8b62c3b51bc9514f276c1d6237a04e7e3be728c8581512c7f4be7101b627  pil/zkevm/padding_sha256.pil
a1fac08a65caafcc3517c70fa347632234e4ab6a211065a3d501422a4ac8849b  pil/zkevm/padding_sha256bit.pil
37c46c836f2ae41d170229b61d0724aaf3ff6d356cb78437c0950201784e6ad0  pil/zkevm/poseidong.pil
b44aedc058f875fbf87a88272f92cf6d523b2ff17d597d1bd96c29bc01410ca6  pil/zkevm/sha256f.pil
ca7aaf245a28a38f3851da532fda9dbe611bc643d2cd1c9df78e81f93cfd3bd1  pil/zkevm/storage.pil


<div class="meta_for_parser tablespecs" style="visibility:hidden">
sed "s/^0x//;s/\([0-9a-f]\{40\}\)/\1\n/g" FflonkVerifier.sol.compiled.bytecode | head
sed "s/^0x//;s/\([0-9a-f]\{40\}\)/\1\n/g" FflonkVerifier.sol.compiled.bytecode | tail
</div>
