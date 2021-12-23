const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
const { Scalar } = require('ffjavascript');

const pathOutputJson = path.join(__dirname, './deploy_output.json');
const { expect } = require('chai');

async function main() {
    const deployer = (await ethers.getSigners())[0];

    /*
        Deployment MATIC
    */
    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
    const maticTokenContract = await maticTokenFactory.deploy(
        maticTokenName,
        maticTokenSymbol,
        deployer.address,
        maticTokenInitialBalance,
    );
    await maticTokenContract.deployed();

    /*
        Deployment Mock verifier
    */
    const VerifierRollupHelperFactory = await ethers.getContractFactory(
        'VerifierRollupHelperMock',
    );
    const verifierMockContract = await VerifierRollupHelperFactory.deploy();

    /*
        Deployment Bridge Mock
    */
    const precalculatePoEAddress = await ethers.utils.getContractAddress(
        { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
    );
    const BridgeFactory = await ethers.getContractFactory('Bridge');
    const bridgeContract = await BridgeFactory.deploy(precalculatePoEAddress);
    await bridgeContract.deployed();

    /*
        Deploy proof of efficiency
    */

    /* "genesis": [
    *    {
    *      "address": "0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D",
    *      "pvtKey": "0x28b2b0318721be8c8339199172cd7cc8f5e273800a35616ec893083a4b32c02e",
    *      "balance": "100000000000000000000",
    *      "nonce": "0"
    *    },
    *    {
    *      "address": "0x4d5Cf5032B2a844602278b01199ED191A86c93ff",
    *      "pvtKey": "0x4d27a600dce8c29b7bd080e29a26972377dbb04d7a27d919adbb602bf13cfd23",
    *      "balance": "200000000000000000000",
    *      "nonce": "0"
    *    }
    *  ] 
    */
    const genesisRoot = `0x${Scalar.e("4091651772388093439828475955668620102367778455436412389529460210592290187513").toString(16).padStart(64, '0')}`;

    console.log('\n#######################');
    console.log('##### Deployment Proof of Efficiency #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('bridgeAddress:', bridgeContract.address);
    console.log('maticTokenAddress:', maticTokenContract.address);
    console.log('verifierMockAddress:', verifierMockContract.address);
    console.log('genesisRoot:', genesisRoot);

    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiency');
    const proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
        bridgeContract.address,
        maticTokenContract.address,
        verifierMockContract.address,
        genesisRoot
    );
    await proofOfEfficiencyContract.deployed();
    expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);

    console.log('#######################\n');
    console.log('Proof of Efficiecny deployed to:', proofOfEfficiencyContract.address);

    console.log('\n#######################');
    console.log('#####    Checks    #####');
    console.log('#######################');
    console.log('bridgeAddress:', await proofOfEfficiencyContract.bridge());
    console.log('maticTokenAddress:', await proofOfEfficiencyContract.matic());
    console.log('verifierMockAddress:', await proofOfEfficiencyContract.rollupVerifier());
    console.log('genesiRoot:', await proofOfEfficiencyContract.currentStateRoot());

    // calculate address and private Keys:
    DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";
    const menmonic = process.env.MNEMONIC || DEFAULT_MNEMONIC
    const defaultAccountsJson = 20;
    const accountsArray = [];
    for (let i = 0; i < defaultAccountsJson; i++) {
        const path = `m/44'/60'/0'/0/${i}`
        const wallet = ethers.Wallet.fromMnemonic(menmonic, path);
        accountsArray.push({
            address: wallet.address,
            pvtKey: wallet.privateKey
        });
    }

    const outputJson = {
        proofOfEfficiencyAddress: proofOfEfficiencyContract.address,
        bridgeAddress: bridgeContract.address,
        maticTokenAddress: maticTokenContract.address,
        verifierMockAddress: verifierMockContract.address,
        deployerAddress: deployer.address,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    // Test
    expect(await proofOfEfficiencyContract.matic()).to.equal(maticTokenContract.address);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
