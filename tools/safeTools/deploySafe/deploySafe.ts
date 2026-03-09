/* eslint-disable no-console, no-restricted-syntax, no-await-in-loop, prefer-destructuring */
/**
 * Deploy Gnosis Safe Multisig on Multiple Networks
 *
 * This script deploys a Gnosis Safe (v1.3.0) multisig wallet to one or more networks.
 * Using the same salt nonce and owners will result in the same Safe address across all networks
 * (deterministic deployment via CREATE2).
 *
 * ==================== USAGE ====================
 *
 * 1. Configure the script (see CONFIGURATION section below):
 *    - Set NETWORKS: array of network names from hardhat.config.ts
 *    - Set OWNERS: array of owner addresses for the Safe
 *    - Set THRESHOLD: number of signatures required to execute transactions
 *    - Set SALT_NONCE: use same value across networks for same address
 *
 * 2. Run the script:
 *    npx hardhat run tools/safeTools/deploySafe/deploySafe.ts
 *
 * ==================== ENVIRONMENT ====================
 *
 * The script looks for credentials in this order:
 *   1. DEPLOYER_PRIVATE_KEY env var
 *   2. Mnemonic from network config or MNEMONIC env var
 *   3. Private keys array from network config
 *
 * Example:
 *   npx hardhat run tools/safeTools/deploySafe/deploySafe.ts
 *
 * ==================== DETERMINISTIC ADDRESSES ====================
 *
 * To get the same Safe address on multiple networks:
 *   - Use the same OWNERS array (same addresses, same order)
 *   - Use the same THRESHOLD
 *   - Use the same SALT_NONCE
 *   - Deploy from any account (deployer address doesn't affect Safe address)
 *
 * ==================== CONTRACT ADDRESSES ====================
 *
 * The script uses the canonical Gnosis Safe v1.3.0 factory addresses which are
 * deployed at the same address on most EVM chains. If deploying to a chain where
 * these aren't available, you'll need to update the addresses below.
 */
import { ethers, config } from 'hardhat';
import { HttpNetworkConfig } from 'hardhat/types';

// ============== CONFIGURATION ==============
// Networks from hardhat.config.ts (add or remove networks as needed)
const NETWORKS = ['sepolia', 'zkevmDevnet'];

// Safe Proxy Factory (same address on all networks)
const PROXY_FACTORY_ADDRESS = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';

// Safe Singleton (GnosisSafe 1.3.0 - same address on all networks)
const SAFE_SINGLETON_ADDRESS = '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552';

// Fallback Handler (CompatibilityFallbackHandler 1.3.0 - optional, set to ZeroAddress if not needed)
const FALLBACK_HANDLER_ADDRESS = '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4';

// Safe configuration
const OWNERS = [''];

const THRESHOLD = 1; // Number of signatures required

// Salt nonce for deterministic address (same salt = same address on both networks)
const SALT_NONCE = 0;
// ============================================

// ABI for the contracts
const PROXY_FACTORY_ABI = [
    'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) public returns (address proxy)',
    'event ProxyCreation(address proxy, address singleton)',
];

const SAFE_ABI = [
    'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
];

const SAFE_ADDRESSES = [PROXY_FACTORY_ADDRESS, SAFE_SINGLETON_ADDRESS, FALLBACK_HANDLER_ADDRESS];

async function assertContractsExist(provider: any, networkName: string): Promise<void> {
    const codes = await Promise.all(SAFE_ADDRESSES.map((a) => provider.getCode(a)));
    const missing = SAFE_ADDRESSES.filter((_, i) => !codes[i] || codes[i] === '0x' || codes[i] === '0x0');
    if (missing.length > 0)
        throw new Error(`[${networkName}] Not all Safe contracts deployed. Missing: ${missing.join(', ')}`);
}

async function deploySafe(networkName: string, signer: any): Promise<string> {
    console.log(`\n--- Deploying Safe on ${networkName} ---`);
    console.log(`Deployer: ${await signer.getAddress()}`);

    await assertContractsExist(signer.provider, networkName);

    // Create contract instances
    const proxyFactory = new ethers.Contract(PROXY_FACTORY_ADDRESS, PROXY_FACTORY_ABI, signer);
    const safeInterface = new ethers.Interface(SAFE_ABI);

    // Encode the setup call (initializer)
    const initializer = safeInterface.encodeFunctionData('setup', [
        OWNERS, // _owners
        THRESHOLD, // _threshold
        ethers.ZeroAddress, // to (no delegate call)
        '0x', // data (no delegate call)
        FALLBACK_HANDLER_ADDRESS, // fallbackHandler
        ethers.ZeroAddress, // paymentToken (ETH)
        0, // payment
        ethers.ZeroAddress, // paymentReceiver
    ]);

    console.log(`Owners: ${OWNERS.join(', ')}`);
    console.log(`Threshold: ${THRESHOLD}`);
    console.log(`Salt nonce: ${SALT_NONCE}`);

    // Deploy the Safe
    console.log('\nSending createProxyWithNonce transaction...');
    const tx = await proxyFactory.createProxyWithNonce(SAFE_SINGLETON_ADDRESS, initializer, SALT_NONCE);

    console.log(`Tx hash: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();

    // Get the deployed Safe address from the event
    const proxyCreationEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('ProxyCreation(address,address)'),
    );

    let safeAddress: string;
    if (proxyCreationEvent) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address', 'address'], proxyCreationEvent.data);
        safeAddress = decoded[0];
    } else {
        // Fallback: calculate the address
        safeAddress = 'Could not decode from event';
    }

    console.log(`\n✓ Safe deployed at: ${safeAddress}`);
    console.log(`  Block: ${receipt.blockNumber}`);

    return safeAddress;
}

function getWalletForNetwork(networkConfig: HttpNetworkConfig, provider: any) {
    // Try private key from env first
    if (process.env.DEPLOYER_PRIVATE_KEY) {
        return new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    }

    // Try mnemonic from network config or env
    const accounts = networkConfig.accounts as any;
    const mnemonic = accounts?.mnemonic || process.env.MNEMONIC;
    if (mnemonic) {
        return ethers.Wallet.fromPhrase(mnemonic).connect(provider);
    }

    // Try array of private keys
    if (Array.isArray(accounts) && accounts.length > 0) {
        return new ethers.Wallet(accounts[0], provider);
    }

    throw new Error('No private key or mnemonic found. Set DEPLOYER_PRIVATE_KEY or MNEMONIC env var.');
}

async function main() {
    console.log('='.repeat(60));
    console.log('Deploy Safe on Multiple Networks');
    console.log('='.repeat(60));

    // Validate configuration
    if (OWNERS.length === 0 || OWNERS.some((o) => o === '0x...')) {
        throw new Error('Please configure OWNERS array with valid addresses');
    }
    if (THRESHOLD < 1 || THRESHOLD > OWNERS.length) {
        throw new Error(`Threshold must be between 1 and ${OWNERS.length}`);
    }

    // Validate networks
    if (NETWORKS.length === 0) {
        throw new Error('Please configure at least one network in NETWORKS array');
    }

    // Deploy on each network
    const deployedAddresses: { network: string; address: string }[] = [];

    for (let i = 0; i < NETWORKS.length; i++) {
        const networkName = NETWORKS[i];
        const networkConfig = config.networks[networkName] as HttpNetworkConfig;

        if (!networkConfig?.url) {
            throw new Error(`Network "${networkName}" not found in hardhat.config.ts or has no URL`);
        }

        const provider = new ethers.JsonRpcProvider(networkConfig.url);
        const wallet = getWalletForNetwork(networkConfig, provider);

        if (i > 0) {
            console.log(`\n${'='.repeat(60)}`);
        }

        const safeAddress = await deploySafe(networkName, wallet);
        deployedAddresses.push({ network: networkName, address: safeAddress });
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('DEPLOYMENT SUMMARY');
    console.log('='.repeat(60));

    for (const { network, address } of deployedAddresses) {
        console.log(`${network}: ${address}`);
    }

    // Check if all addresses match (only if more than one network)
    if (deployedAddresses.length > 1) {
        const firstAddress = deployedAddresses[0].address.toLowerCase();
        const allMatch = deployedAddresses.every((d) => d.address.toLowerCase() === firstAddress);
        console.log(`Addresses match: ${allMatch ? '✓ YES' : '✗ NO'}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
