# Verify Deployment of Proof Verifier Smart Contract

In order to verify the smart contract, you will need a machine with at least 256GB of RAM and 16 cores.

In this tutorial we will give instructions for a r6a.8xlarge aws instance. This instance has 16 cores 32 threads, 512GB of SSD. The instance will use Ubuntu 22.04 LTS and the cost of the instance is about 1.82 $/h. This process is quite long, it takes approximately 5-6 hours.

So lets start by launching and instance. 

## Basic OS preparation

````bash
sudo apt update
sudo apt install -y tmux git curl
````

## Tweeking the OS to accept high amount of memory.

````bash
echo "vm.max_map_count=655300" | sudo tee -a /etc/sysctl.conf
sudo sysctl -w vm.max_map_count=655300
export NODE_OPTIONS="--max-old-space-size=230000"
````

## Install version of node and npm


````bash
curl -sL https://deb.nodesource.com/setup_18.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
````
The version of node should be: 18 (e.g. 18.14.0 )

## Download and prepare circom
To compile circuits, we need circom installed.
````bash
cd ~
git clone https://github.com/iden3/circom.git
cd circom
git checkout v2.1.5
git log --pretty=format:'%H' -n 1
````
The hash of the commit should be: 127414e9088cc017a357233f30f3fd7d91a8906c


Install and compile circom (RUST)
````bash
sudo apt install -y cargo
cd circom
cargo build --release
cargo install --path circom
export PATH=$PATH:~/.cargo/bin
echo 'PATH=$PATH:~/.cargo/bin' >> ~/.profile
circom --version
````
The version of circom should be: 2.1.5


## Prepare fast build constant tree tool

````bash
cd ~
git clone https://github.com/0xPolygonHermez/zkevm-prover.git
cd zkevm-prover
git checkout 221bafe31ee6a6e23d8f2853088ac27ee71deb8a
git submodule init
git submodule update
sudo apt install -y build-essential libomp-dev libgmp-dev nlohmann-json3-dev libpqxx-dev nasm libgrpc++-dev libprotobuf-dev grpc-proto libsodium-dev uuid-dev libsecp256k1-dev
make -j bctree
````
this step takes less than 5 minutes.

## Prepare and launch setup (zkevm-proverjs)

````bash
cd ~
git clone https://github.com/0xPolygonHermez/zkevm-proverjs.git
cd zkevm-proverjs
git checkout fbe6b37a00d87ac6e4607ab9b91f4d514f7c72c1
npm install
tmux -c "npm run buildsetup --bctree=../zkevm-prover/build/bctree"
````
This step is quite long, it takes approximately 4.5 hours. 2 out of 4.5 hours are for the powersOfTau28_hez_final.ptau download, a file of 288GB that it's loaded only once.
> NOTE: At the end of the document there is a table with all the hashes of the files generated during this process. 

## Compile generated verifier smartcontract (solidity)

As a final result of the previous steps, the smart contract that verifies the test has been generated. This file is *final.fflonk.verifier.sol*. At this point, it is possible to verify the smart contract using the source code or verify that the bytecode is the same. **To verify the bytecode**, you must compile with the precisely same version, compiler, and parameters to be sure that even the metadata hash contained in the bytecode is exactly the same. The following instructions generate a project to build using the **hardhat** tool.
````bash
cd ~
mkdir contract
cd contract
npm init -y 
npm install hardhat
mkdir -p contracts/verifiers
echo -e "module.exports={solidity:{compilers:[{version: \"0.8.17\",settings:{optimizer:{enabled:true,runs:999999}}}]}}" > hardhat.config.js
````
Once the project structure is created, we proceed to copy the smart contract generated in the previous step. This smart contract was saved on *~/zkevm-proverjs/build/proof*, and must be copied to *contracts/verifiers* with exactly the name *Verifier.sol*. If the name or the path changes, the hash of metadata changes too, for this reason, is essential to respect the name and the path. To do it could execute these commands
````bash
cd ~/contract
cp ~/zkevm-proverjs/build/proof/final.fflonk.verifier.sol contracts/verifiers/FflonkVerifier.sol
sha256sum contracts/verifiers/FflonkVerifier.sol
````
The result should be:
````
43e64ada9b72b53740f9ddb5a2c0d30be47f92628593fae247b95c6999861703
````
To compile smartcontract execute following command:
````bash
npx hardhat compile
````
Bytecode of smartcontract was on bytecode property of json file *Verifier.json* generated on path *artifacts/contracts/verifiers/FflonkVerifier.sol*
````
608060405234801561001057600080fd5b50612b
a9806100206000396000f3fe6080604052348015
61001057600080fd5b506004361061002b576000
:
:
612ae357612ae3612a4c565b604051601f82017f
ffffffffffffffffffffffffffffffffffffffff
ffffffffffffffffffffffe0908116603f011681
01908382118183101715612b2957612b29612a4c
565b81604052828152886020848701011115612b
4257600080fd5b82602086016020830137600060
2084830101528096505050505050612b6a846020
8501612a7b565b9050925092905056fea2646970
6673582212205b7f4daf66d2ec28ca29e86ee127
0f601bb1fc509b9d879770258508d85a03676473
6f6c63430008110033
````
To extract bytecode on file in one line. If you prefer do it , you cold copy and paste in a file.
````bash
cd ~/contract
grep bytecode artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier.json |sed 's/.*"\(0x.*\)".*/\1/' > ~/contract/FflonkVerifier.sol.compiled.bytecode
````
> NOTE: if you prefer you can copy by hand the content of the bytecode of the file *artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier.json* over files *FflonkVerifier.sol.compiled.bytecode*. Remember to copy only the content inside the double quotes (without double quotes).
> 
Verify bytecode compiled:
````
sha256sum ~/contract/FflonkVerifier.sol.compiled.bytecode
````
The result should be:
````
071fa7699cfe7be2516209373e148d1c306b7b12059b2d39779596c86d48a2c8
````

## Download bytecode of deployed smartcontract

To download bytecode of deployed smartcontract, need the address of smart contract, in this case it's *0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9*. Go to Etherscan, Blockscout or Beaconcha to get transaction bytecode.  

Associated with address *0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9* found the transacction *0x3ed835c4a7677dae8e7a22b981be03a86540c10fec7953eaa1f979355513adbc*.

- ### Etherscan (https://etherscan.io)
    https://etherscan.io/address/0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9
https://etherscan.io/tx/0x3ed835c4a7677dae8e7a22b981be03a86540c10fec7953eaa1f979355513adbc
Click to see more > Input Data > Select all data and copy to clipboard.

- ### Blockscout (https://blockscout.com/eth/mainnet)
    https://blockscout.com/eth/mainnet/address/0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9
https://blockscout.com/eth/mainnet/tx/0x3ed835c4a7677dae8e7a22b981be03a86540c10fec7953eaa1f979355513adbc
View details > Raw input > Copy to clipboard

- ### Beacocha (https://beaconcha.in)
    https://beaconcha.in/address/0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9
https://beaconcha.in/tx/0x3ed835c4a7677dae8e7a22b981be03a86540c10fec7953eaa1f979355513adbc
Advanced Info > Call Data > Select all data and copy to clipboard.
*NOTE: Don't use button "Copy Raw Data" because it generated non compatible format.*

Some applications running on the terminal may limit the amount of input they will accept before their input buffers overflow. To avoid this situation create file *FflonkVerifier.sol.explorer.bytecode* with editor as nano or vi.

````bash
cd ~/contract
nano FflonkVerifier.sol.explorer.bytecode
````
In nano, to paste the clipboard to the file use CTRL+P, save content using CTRL+X, and finally press Y. To compare if two files are the same, you could use diff.
````bash
cd ~/contract
diff FflonkVerifier.sol.compiled.bytecode FflonkVerifier.sol.explorer.bytecode
````
Alternatively, you could check content using sha256sum:
````bash
cd ~/contract
sha256sum FflonkVerifier.sol.*.bytecode
````
The result should be:
````
071fa7699cfe7be2516209373e148d1c306b7b12059b2d39779596c86d48a2c8  FflonkVerifier.sol.compiled.bytecode
071fa7699cfe7be2516209373e148d1c306b7b12059b2d39779596c86d48a2c8  FflonkVerifier.sol.explorer.bytecode
````

## Generated files hash
<font size=2>
<table>
<tr><th>step/file</th><th>sha256</th></tr>
<tr><td colspan=2><b>buildrom</b></td></tr>
<tr><td>rom.json</td><td>cc14764543db4c81ca6ce53b19d075f3a2c2a72783e6e8d2931698bd77321740</td></tr>
<tr><td colspan=2><b>buildpil</b></td></tr>
<tr><td>main.pil.json</td><td>d6559b5db541b18ec9e510eac3cb8a565b776f1e5fc3ff4797dda5e2b5841698</td></tr>
<tr><td colspan=2><b>buildstoragerom</b></td></tr>
<tr><td>storage_sm_rom.json</td><td>7443b587be9ad40b536adaa678f505450938095ce8175f663b22d3c0d03c0414</td></tr>
<tr><td colspan=2><b>buildconstants</b></td></tr>
<tr><td>zkevm.const</td><td>f00d5df0a0e218ee6e3e90829e9e6ae4511e91e437b35a3b8e7ea539931ab34c</td></tr>
<tr><td colspan=2><b>buildstarkinfo</b></td></tr>
<tr><td>zkevm.starkstruct.json</td><td>284b6ce275c637af4a0b4b10cd83a881c6f1b21e21ad7ea2276379ed8393b099</td></tr>
<tr><td>zkevm.starkinfo.json</td><td>f2462a5e85bd6cb8e5348ce77a647b6d9695897e427119ce0baef71e638b0f91</td></tr>
<tr><td colspan=2><b>buildconstanttree</b></td></tr>
<tr><td>zkevm.verkey.json</td><td>da2a98e3a30c5ec8e2782297c98897803eac663b97cc43bd4808789e2b330932</td></tr>
<tr><td>zkevm.consttree</td><td>66617503a2cc05c3ca05051d7ebb950c5b6f017eaf8315959ecbb5bc92eb770f</td></tr>
<tr><td colspan=2><b>gencircom</b></td></tr>
<tr><td>zkevm.verifier.circom</td><td>f33ffebda25aca8bae1a43853a9903a923d981f5014dc0bb195121a6a162da32</td></tr>
<tr><td colspan=2><b>compilecircom</b></td></tr>
<tr><td>zkevm.verifier.r1cs</td><td>c875b3684b4d61e7e5301c028c46414797865502a1d3688d388dc8ec6f96a6fe</td></tr>
<tr><td>zkevm.verifier.sym</td><td>ee4cd368c8c167cf7375bcfe437d048c1dd8c5e3088b247059b26f54f3568b9c</td></tr>
<tr><td colspan=2><b>c12a_setup</b></td></tr>
<tr><td>c12a.pil</td><td>d1aa48508d82fccf82d3aeb2447aa0d5a696125710a1a1203ceb84acac9b4ec5</td></tr>
<tr><td>c12a.const</td><td>ea0f88c3bdd7116c14138f78396f5a87c8fcffc6708f4016b547cd83eb49b80b</td></tr>
<tr><td>c12a.exec</td><td>30ebe05a0450a19e4534b81c09360776ae9384520f6f442d342e48f6428d7c13</td></tr>
<tr><td colspan=2><b>c12a_buildstarkinfo</b></td></tr>
<tr><td>c12a.starkstruct.json</td><td>920b777dc3d6998c99514761d35d04bc4d129e3799d6ab1d0400eab19988ac6f</td></tr>
<tr><td>c12a.starkinfo.json</td><td>9fc0fb3083069dc4a41501adf05423d9a44dd30e980847afcd5130435be96ea3</td></tr>
<tr><td colspan=2><b>c12a_buildconstanttree</b></td></tr>
<tr><td>c12a.verkey.json</td><td>32d300ee8d19c8fa7ea66f153aedc4e017791f5a3ed60d728b7c24ab23529743</td></tr>
<tr><td>c12a.consttree</td><td>8523301542c87b970e6e0f05d3ba91c521dfaf1e3cc30154455679966705e71c</td></tr>
<tr><td colspan=2><b>c12a_gencircom</b></td></tr>
<tr><td>c12a.verifier.circom</td><td>fa255fda3de38565e365045d8c85576f5420a0a6b1254ea8ce0498085eaf4990</td></tr>
<tr><td colspan=2><b>recursive1_gencircom</b></td></tr>
<tr><td>recursive1.circom</td><td>9e3c2a901a9340481bca1e2d5793e6893cc6e4ece4ccde1c593c1e413263c44b</td></tr>
<tr><td colspan=2><b>recursive1_compile</b></td></tr>
<tr><td>recursive1.r1cs</td><td>6212b555400157c9bebf48c10776e087032e352950fb30fd83001b3be1d2b0a8</td></tr>
<tr><td>recursive1.sym</td><td>90cea97ef99766a62c5e5c010c50cbf262c6bfe39f192bf1aeab0d0b2097c13f</td></tr>
<tr><td colspan=2><b>recursive1_setup</b></td></tr>
<tr><td>recursive1.pil</td><td>600aaf142766eb473fcc3b7171f6afa306e09faf37f77a6ac4214c8890e3a55d</td></tr>
<tr><td>recursive1.const</td><td>5567e53b906d5129d692f2656529758305d5b5140add9e967169894463b6b539</td></tr>
<tr><td>recursive1.exec</td><td>ad048f4119b4b1541092cd57aa4a255ae68bb530dfc2f1fe222567343fc8abe4</td></tr>
<tr><td colspan=2><b>recursive1_buildstarkinfo</b></td></tr>
<tr><td>recursive.starkstruct.json</td><td>7ae67d5411a2de84e9b50e8797270a054f116fdbed6f327acb9d93628ee7549c</td></tr>
<tr><td>recursive1.starkinfo.json</td><td>9e5433af9baf24e5570d780f58ef5b857c2ca5a84709489e7f322220af549cca</td></tr>
<tr><td colspan=2><b>recursive1_buildconstanttree</b></td></tr>
<tr><td>recursive1.verkey.json</td><td>acab2f616d0d25c65de4628feadfe49407a31c293b4f1d1f1087a1d2f0bf5412</td></tr>
<tr><td>recursive1.consttree</td><td>9a418145a27edf2cc3c40b578f5abf82da00ba6632f32afea7d6ad88085bb492</td></tr>
<tr><td colspan=2><b>recursive1_verifier_gencircom</b></td></tr>
<tr><td>recursive1.verifier.circom</td><td>40db564e271fb931992afa2d9a75fd35f37c851acf0170074aba7233fdcb4ffc</td></tr>
<tr><td colspan=2><b>recursive2_gencircom</b></td></tr>
<tr><td>recursive2.circom</td><td>b223861020d28e3db7017d5af0143e8c01c917414d5ff9c7fd184dadfd5d50a7</td></tr>
<tr><td colspan=2><b>recursive2_compile</b></td></tr>
<tr><td>recursive2.r1cs</td><td>46e3d53079476fed62af5a9f7838b52cddb33a4fc1ab9447763d534ae88b0084</td></tr>
<tr><td>recursive2.sym</td><td>b38319f2aa8dbc6cf4519fc5ea4bc07212d66177279bdbff331feeb150612d70</td></tr>
<tr><td colspan=2><b>recursive2_setup</b></td></tr>
<tr><td>recursive2.pil</td><td>600aaf142766eb473fcc3b7171f6afa306e09faf37f77a6ac4214c8890e3a55d</td></tr>
<tr><td>recursive2.const</td><td>ff9590f79b8d5540a117b9f6086df1cbededf5a1bb97d570696217c02868dee5</td></tr>
<tr><td>recursive2.exec</td><td>7f2479956334a00a61900491a267c50ac6953d3d3bda871a01d3471bbe4029d5</td></tr>
<tr><td colspan=2><b>recursive2_buildstarkinfo</b></td></tr>
<tr><td>recursive2.starkinfo.json</td><td>9e5433af9baf24e5570d780f58ef5b857c2ca5a84709489e7f322220af549cca</td></tr>
<tr><td colspan=2><b>recursive2_buildconstanttree</b></td></tr>
<tr><td>recursive2.verkey.json</td><td>3f11b10a807da2ae7fb36f5f6111c9f4855c84d43cf53dcb594028d7a93a6a90</td></tr>
<tr><td>recursive2.consttree</td><td>6dfbd47f9676f1b1b1f428015c6e698dd588a66edb0ec5fe6a09931a8a9fa49f</td></tr>
<tr><td colspan=2><b>recursive2_verifier_gencircom</b></td></tr>
<tr><td>recursive2.verifier.circom</td><td>40db564e271fb931992afa2d9a75fd35f37c851acf0170074aba7233fdcb4ffc</td></tr>
<tr><td colspan=2><b>recursivef_gencircom</b></td></tr>
<tr><td>recursivef.circom</td><td>af70e17e347042831270806d08b8473f8c27013e0edd9b3f1f91d27a8a6e9f26</td></tr>
<tr><td colspan=2><b>recursivef_compile</b></td></tr>
<tr><td>recursivef.r1cs</td><td>3cebbbf05717b393a29be0cdf241fab82e34bca4ae7940172da10fd5bac4bcb6</td></tr>
<tr><td>recursivef.sym</td><td>19bbc1b3f6835ccf0ce10741599039b8d7f5d8c0fe8a7ac53197c36c33ff66d4</td></tr>
<tr><td colspan=2><b>recursivef_setup</b></td></tr>
<tr><td>recursivef.pil</td><td>90285d359be25e81bbbf7f7713fceed9874730ae6d233b757dab884b5c88b643</td></tr>
<tr><td>recursivef.const</td><td>2a5286933a664c1736c6ee91b9da2eb694d923bacf86f3309913a6cbdf132096</td></tr>
<tr><td>recursivef.exec</td><td>8cf9b7ff7ca623cc50807a917ee30ca99de6692db89baa315d60e5d09462090b</td></tr>
<tr><td colspan=2><b>recursivef_buildstarkinfo</b></td></tr>
<tr><td>recursivef.starkstruct.json</td><td>5176f80126963cfac8f7956963aae3c17f4842382327a9e1de066e52bb058718</td></tr>
<tr><td>recursivef.starkinfo.json</td><td>30c96563c8476073759660db21c767726b2ad78aacea0c5007c17972a74a3a6d</td></tr>
<tr><td colspan=2><b>recursivef_buildconstanttree</b></td></tr>
<tr><td>recursivef.verkey.json</td><td>04a55ebcd79b27908a33a66569d3bf0ad7aeaff62fc92566f6a0fc0c3e94beea</td></tr>
<tr><td>recursivef.consttree</td><td>40dffd42ef14085954bf58ac2fac193799c7cde032380db826bfb1d601d9919a</td></tr>
<tr><td colspan=2><b>recursivef_verifier_gencircom</b></td></tr>
<tr><td>recursivef.verifier.circom</td><td>c2773fc4db2427b9e192fe4e29cc77cd83289155661efdcd6985c80863a7a685</td></tr>
<tr><td colspan=2><b>final_gencircom</b></td></tr>
<tr><td>final.circom</td><td>2c8261d66bef060b17a15829e30ea11b8e4659bea27aa92eb36dcbf18613c1dc</td></tr>
<tr><td colspan=2><b>final_compile</b></td></tr>
<tr><td>final.r1cs</td><td>5cc2a9a9842a136ea5fb079519338be1fc3830a726d0f99b3cec461ba0fab90c</td></tr>
<tr><td>final.sym</td><td>19fde910362aaf69622b33d432ad92b91409eb851fc8f1691e4255b6e364b868</td></tr>
<tr><td colspan=2><b>fflonk_setup</b></td></tr>
<tr><td>final.fflonk.zkey</td><td>ce55fe5c5a453583bac00b7c89344cf167a8354f0a115d52f3eb59434f78ffcc</td></tr>
<tr><td colspan=2><b>fflonk_evk</b></td></tr>
<tr><td>final.fflonk.verkey.json</td><td>ebe2a955e9fddcb57d50c65b505dea7b20ad2991010cea0b9368aa5a21336cbf</td></tr>
<tr><td>dependencies.txt</td><td>a75792a5c60069ffb6c61124c58850fb54390efa4fe895ba2f1dbce2d7018c24</td></tr>
<tr><td colspan=2><b>fflonk_solidity</b></td></tr>
<tr><td>final.fflonk.verifier.sol</td><td>43e64ada9b72b53740f9ddb5a2c0d30be47f92628593fae247b95c6999861703</td></tr>
</table>



