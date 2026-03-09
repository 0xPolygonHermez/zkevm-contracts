/* eslint-disable no-console */
import { ethers, config } from 'hardhat';
import { HttpNetworkConfig } from 'hardhat/types';

async function main() {
    const sourceNetwork = process.env.SOURCE_NETWORK;
    const txHash = process.env.TX_HASH;

    if (!sourceNetwork || !txHash) {
        console.error(
            'Usage: SOURCE_NETWORK=<network> TX_HASH=<hash> npx hardhat run tools/safeTools/replayTx/replayTx.ts --network <target_network>',
        );
        process.exit(1);
    }

    console.log('='.repeat(60));
    console.log('Replay Transaction Script');
    console.log('='.repeat(60));

    const sourceNetworkConfig = config.networks[sourceNetwork] as HttpNetworkConfig;
    if (!sourceNetworkConfig || !sourceNetworkConfig.url) {
        throw new Error(`Network "${sourceNetwork}" not found in hardhat.config.ts or has no URL`);
    }
    const sourceRpc = sourceNetworkConfig.url;
    console.log(`\nSource network: ${sourceNetwork} (${sourceRpc})`);

    const sourceProvider = new ethers.JsonRpcProvider(sourceRpc);

    // Get the original transaction
    console.log(`\nFetching tx from source: ${txHash}`);
    const tx = await sourceProvider.getTransaction(txHash);

    if (!tx) {
        throw new Error(`Transaction ${txHash} not found on source network`);
    }

    console.log('\n--- Original Transaction ---');
    console.log(`From: ${tx.from}`);
    console.log(`To: ${tx.to}`);
    console.log(`Value: ${tx.value}`);
    console.log(`Data: ${tx.data}`);

    // Get signer from target network
    let signer;
    if (process.env.DEPLOYER_PRIVATE_KEY) {
        signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, ethers.provider);
        console.log(`\n--- Target Network (private key) ---`);
    } else {
        [signer] = await ethers.getSigners();
        console.log(`\n--- Target Network (mnemonic) ---`);
    }
    console.log(`Sender: ${signer.address}`);

    // Replay the transaction
    console.log('\nSending transaction to target network...');
    const replayTx = await signer.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        gasLimit: tx.gasLimit,
    });

    console.log(`Tx hash: ${replayTx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await replayTx.wait();
    console.log(`\n✓ Transaction confirmed in block ${receipt?.blockNumber}`);
    console.log('='.repeat(60));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
