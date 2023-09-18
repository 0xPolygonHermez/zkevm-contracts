const { ethers } = require("hardhat");

async function main() {
    const provider = ethers.getDefaultProvider(process.env.L1_URL); // set goerli RPC node
    const privateKey = process.env.SEQUENCER_PRIVATE_KEY; // From wallet.txt Trusted sequencer
    const wallet = new ethers.Wallet(privateKey, provider);

    const maticTokenFactory = await ethers.getContractFactory(
        "ERC20PermitMock",
        provider
    );
    maticTokenContract = maticTokenFactory.attach(process.env.MATIC_TOKEN_ADDRESS); // From ~/zkevm/zkevm-contract/deployments/goerly_***/deploy_output.json maticTokenAddress
    maticTokenContractWallet = maticTokenContract.connect(wallet);
    await maticTokenContractWallet.approve(process.env.POLYGON_ZKEVM_ADDRESS, ethers.utils.parseEther("100.0")); // From ~/zkevm/zkevm-contract/deployments/goerly_***/deploy_output.json polygonZkEVMAddress
    
    const provider2 = ethers.getDefaultProvider(process.env.L1_URL); // set goerli RPC node
    const privateKey2 = process.env.AGGREGATOR_PRIVATE_KEY; // From wallet.txt Trusted sequencer
    const wallet2 = new ethers.Wallet(privateKey2, provider2);

    const maticTokenFactory2 = await ethers.getContractFactory(
        "ERC20PermitMock",
        provider2
    );
    maticTokenContract2 = maticTokenFactory2.attach(process.env.MATIC_TOKEN_ADDRESS); // From ~/zkevm/zkevm-contract/deployments/goerly_***/deploy_output.json maticTokenAddress
    maticTokenContractWallet2 = maticTokenContract2.connect(wallet2);
    await maticTokenContractWallet2.approve(process.env.POLYGON_ZKEVM_ADDRESS, ethers.utils.parseEther("100.0")); // From ~/zkevm/zkevm-contract/deployments/goerly_***/deploy_output.json polygonZkEVMAddress
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
