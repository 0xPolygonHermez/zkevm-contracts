const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');

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
    console.log('\n#######################');
    console.log('##### Deployment Proof of Efficiency #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('bridgeAddress:', bridgeContract.address);
    console.log('maticTokenAddress:', maticTokenContract.address);
    console.log('verifierMockAddress:', verifierMockContract.address);

    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiency');
    const proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
        bridgeContract.address,
        maticTokenContract.address,
        verifierMockContract.address,
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
