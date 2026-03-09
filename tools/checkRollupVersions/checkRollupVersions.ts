/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, no-restricted-syntax, no-continue */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-promise-executor-return */
import * as dotenv from 'dotenv';
import path = require('path');
import fs = require('fs');
import { ethers, network } from 'hardhat';
import { AgglayerManager } from '../../typechain-types';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const NETWORK_CONFIG: Record<string, { agglayerManagerAddress: string; bridgeAddress: string; outputFile: string }> = {
    mainnet: {
        agglayerManagerAddress: '0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2',
        bridgeAddress: '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe',
        outputFile: 'rollupVersions.json',
    },
    sepolia: {
        agglayerManagerAddress: '0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff',
        bridgeAddress: '0x528e26b25a34a4A5d0dbDa1d57D318153d2ED582',
        outputFile: 'rollupVersionsCardona.json',
    },
};

const networkConfig = NETWORK_CONFIG[network.name];
if (!networkConfig) {
    throw new Error(
        `Unsupported network: ${network.name}. Supported networks: ${Object.keys(NETWORK_CONFIG).join(', ')}`,
    );
}

const AGGLAYER_MANAGER_ADDRESS = networkConfig.agglayerManagerAddress;
const BRIDGE_ADDRESS = networkConfig.bridgeAddress;

// ABI for AggchainBase functions
const AGGCHAIN_BASE_ABI = [
    'function networkName() external view returns (string memory)',
    'function trustedSequencerURL() external view returns (string memory)',
];

// ABI for bridge version checking
const BRIDGE_ABI = [
    'function version() external pure returns (string memory)',
    'function claimedGlobalIndexHashChain() external view returns (bytes32)',
    // Try to read constants (if they have getters)
    'function BRIDGE_VERSION() external pure returns (string memory)',
    'function BRIDGE_SOVEREIGN_VERSION() external pure returns (string memory)',
];

interface RollupInfo {
    rollupID: number;
    name: string;
    providerStatus: string;
    providerURL: string;
    version: string;
    bridgeVersion: string;
    bridgeSovereignVersion: string;
    implementationBytecodeHash?: string;
}

async function checkProvider(url: string): Promise<{ works: boolean; provider?: any }> {
    let provider: any;
    // Suppress console errors temporarily
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    try {
        // Suppress ethers.js network detection errors
        console.error = () => {};
        console.warn = () => {};

        // Use staticNetwork option to prevent Hardhat from trying to detect network
        provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });

        // Set a timeout to prevent hanging (10 seconds)
        await Promise.race([
            provider.getBlockNumber(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Provider timeout')), 10000)),
        ]);

        // Restore console
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;

        return { works: true, provider };
    } catch (error) {
        // Restore console
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;

        // Clean up provider if it was created
        if (provider) {
            try {
                provider.destroy();
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        return { works: false };
    }
}

async function getBridgeVersion(
    bridgeContract: any,
): Promise<{ bridgeVersion: string; bridgeSovereignVersion: string; version: string }> {
    let bridgeVersion = 'N/A';
    let bridgeSovereignVersion = 'N/A';
    let version = 'Unknown';

    try {
        // First, check if claimedGlobalIndexHashChain exists
        try {
            await bridgeContract.claimedGlobalIndexHashChain();
        } catch (e) {
            // Doesn't exist - likely v4.0.0-fork.7 (etrog)
            // Double check that BRIDGE_VERSION and BRIDGE_SOVEREIGN_VERSION don't work
            let bridgeVersionExists = false;
            let bridgeSovereignVersionExists = false;

            try {
                const bridgeVer = await bridgeContract.BRIDGE_VERSION();
                if (bridgeVer) {
                    bridgeVersionExists = true;
                    bridgeVersion = bridgeVer;
                }
            } catch (e2) {
                // BRIDGE_VERSION doesn't exist - expected for etrog
                bridgeVersion = 'N/A';
            }

            try {
                const bridgeSovVer = await bridgeContract.BRIDGE_SOVEREIGN_VERSION();
                if (bridgeSovVer) {
                    bridgeSovereignVersionExists = true;
                    bridgeSovereignVersion = bridgeSovVer;
                }
            } catch (e3) {
                // BRIDGE_SOVEREIGN_VERSION doesn't exist - expected for etrog
                bridgeSovereignVersion = 'N/A';
            }

            // If neither constant works, it's pure etrog
            if (!bridgeVersionExists && !bridgeSovereignVersionExists) {
                version = 'etrog';
            } else {
                // If one of them works, it's etrog???? (unexpected)
                version = 'etrog????';
            }

            return { bridgeVersion, bridgeSovereignVersion, version };
        }

        // Has claimedGlobalIndexHashChain, so it's v10.0.0+
        // Try to call version() function (available in v12.0+)
        try {
            const versionStr = await bridgeContract.version();
            if (versionStr) {
                // version() exists, so it's v12.0+
                // version() returns either BRIDGE_VERSION or BRIDGE_SOVEREIGN_VERSION depending on contract type
                // Try to determine which one it is and set both accordingly

                // Check if it's a sovereign bridge (has BRIDGE_SOVEREIGN_VERSION pattern)
                if (versionStr.includes('v1.0.0') || versionStr.includes('v1.1.0') || versionStr.includes('v1.2.0')) {
                    // v12.0+: version() returns BRIDGE_SOVEREIGN_VERSION for sovereign bridges
                    bridgeSovereignVersion = versionStr;
                    // Try to infer BRIDGE_VERSION based on version pattern
                    if (versionStr === 'v1.0.0') {
                        bridgeVersion = 'v1.0.0'; // v12.0
                        version = 'v12.0';
                    } else if (versionStr === 'v1.1.0') {
                        bridgeVersion = 'v1.1.0'; // v12.1
                        version = 'v12.1';
                    } else if (versionStr === 'v1.2.0') {
                        bridgeVersion = 'v1.1.0'; // v12.2
                        version = 'v12.2';
                    } else {
                        bridgeVersion = versionStr;
                        version = `v12.0+ (${versionStr})`;
                    }
                } else if (
                    versionStr.includes('al-v0.3.0') ||
                    versionStr.includes('al-v0.3.1') ||
                    versionStr.includes('v10.1.2')
                ) {
                    // Older versions with version() - this shouldn't happen based on user's description
                    // But handle it anyway
                    bridgeVersion = versionStr;
                    bridgeSovereignVersion = versionStr;
                    version = 'v10.0.0 RC8 - v11.x';
                } else {
                    // Default: assume it's BRIDGE_VERSION
                    bridgeVersion = versionStr;
                    bridgeSovereignVersion = 'N/A';
                    version = `v12.0+ (${versionStr})`;
                }
            }
        } catch (e) {
            // version() doesn't exist, so it's v10.0.0 to v11.x
            // Try to read constants directly (they might be public)
            try {
                bridgeVersion = await bridgeContract.BRIDGE_VERSION();
            } catch (e2) {
                bridgeVersion = 'N/A';
            }
            try {
                bridgeSovereignVersion = await bridgeContract.BRIDGE_SOVEREIGN_VERSION();
            } catch (e2) {
                bridgeSovereignVersion = 'N/A';
            }

            // Determine version based on constants if we got them
            if (bridgeVersion !== 'N/A' && bridgeSovereignVersion !== 'N/A') {
                if (bridgeVersion === 'al-v0.3.0' && bridgeSovereignVersion === 'al-v0.3.0') {
                    version = 'v10.0.0 RC8';
                } else if (bridgeVersion === 'al-v0.3.1' && bridgeSovereignVersion === 'v10.1.2') {
                    version = 'v11';
                } else {
                    version = 'v10.0.0 - v11.x';
                }
            } else if (bridgeVersion !== 'N/A' || bridgeSovereignVersion !== 'N/A') {
                // Only one constant is available
                version = 'v10.0.0 - v11.x';
            } else {
                version = 'v10.0.0 - v11.x (has claimedGlobalIndexHashChain, no version())';
            }
        }
    } catch (error) {
        console.error(`Error checking bridge version: ${error}`);
    }

    return { bridgeVersion, bridgeSovereignVersion, version };
}

async function getImplementationAddress(provider: any, proxyAddress: string): Promise<string> {
    // Read from EIP-1967 implementation slot using the custom provider
    const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

    let implementationSlot: string;
    if (typeof provider.getStorage === 'function') {
        // ethers v6
        implementationSlot = await provider.getStorage(proxyAddress, IMPLEMENTATION_SLOT);
    } else {
        // ethers v5 or alternative
        implementationSlot = await provider.getStorageAt(proxyAddress, IMPLEMENTATION_SLOT);
    }

    // Extract address from storage slot (last 20 bytes = 40 hex chars)
    const slotHex = implementationSlot.startsWith('0x') ? implementationSlot.slice(2) : implementationSlot;
    const addressHex = slotHex.slice(-40); // Last 40 hex chars = 20 bytes
    const implementationAddress = ethers.getAddress(`0x${addressHex}`);
    return implementationAddress;
}

async function getBridgeBytecode(provider: any, bridgeAddress: string): Promise<string> {
    try {
        // First get the implementation address from the proxy
        const implementationAddress = await getImplementationAddress(provider, bridgeAddress);
        if (!implementationAddress || implementationAddress === ethers.ZeroAddress) {
            throw new Error(`Could not get implementation address for bridge ${bridgeAddress}`);
        }
        // Get bytecode from the implementation address, not the proxy
        const bytecode = await provider.getCode(implementationAddress);
        return bytecode;
    } catch (error) {
        console.error(`Error getting bytecode for bridge ${bridgeAddress}: ${error}`);
        return '';
    }
}

function getBytecodeHash(bytecode: string): string {
    if (!bytecode || bytecode === '0x' || bytecode === '') {
        return '';
    }
    return ethers.keccak256(bytecode);
}

async function main() {
    const RollupManagerFactory = await ethers.getContractFactory('AgglayerManager');

    const rollupManager = (await RollupManagerFactory.attach(AGGLAYER_MANAGER_ADDRESS)) as AgglayerManager;

    // Get total number of rollups
    const rollupCount = await rollupManager.rollupCount();
    console.log(`Found ${rollupCount} rollup(s)\n`);

    const results: RollupInfo[] = [];
    console.log('Checking all rollups (parallelized)...\n');

    const rollupPromises = [];
    for (let rollupID = 1; rollupID <= rollupCount; rollupID++) {
        rollupPromises.push(
            (async () => {
                try {
                    // Get rollup data
                    const rollupData = await rollupManager.rollupIDToRollupData(rollupID);
                    const rollupContractAddress = rollupData.rollupContract;

                    if (rollupContractAddress === ethers.ZeroAddress) {
                        return {
                            rollupID,
                            name: 'No contract address',
                            providerStatus: 'N/A',
                            providerURL: 'N/A',
                            version: 'N/A',
                            bridgeVersion: 'N/A',
                            bridgeSovereignVersion: 'N/A',
                            provider: null,
                        };
                    }

                    // Attach to rollup contract as AggchainBase
                    const rollupContract = new ethers.Contract(
                        rollupContractAddress,
                        AGGCHAIN_BASE_ABI,
                        ethers.provider,
                    );

                    // Get network name
                    let networkName = 'Unknown';
                    try {
                        networkName = await rollupContract.networkName();
                    } catch (error) {
                        // Ignore error, keep default
                    }

                    // Get trusted sequencer URL
                    let trustedSequencerURL = '';
                    try {
                        trustedSequencerURL = await rollupContract.trustedSequencerURL();
                    } catch (error) {
                        // Ignore error, keep default
                    }

                    // Check if provider works
                    let providerWorks = false;
                    let rollupProvider: any = null;
                    if (trustedSequencerURL) {
                        const providerCheck = await checkProvider(trustedSequencerURL);
                        providerWorks = providerCheck.works;
                        rollupProvider = providerCheck.provider;
                    }

                    let version = 'Unknown';
                    let bridgeVersion = 'N/A';
                    let bridgeSovereignVersion = 'N/A';
                    let implementationBytecodeHashValue: string | undefined;

                    if (!providerWorks || !rollupProvider) {
                        version = 'Provider does not work';
                    } else {
                        // Provider works, check bridge version on the rollup's network
                        const bridgeContract = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, rollupProvider);

                        const bridgeVersions = await getBridgeVersion(bridgeContract);
                        version = bridgeVersions.version;
                        bridgeVersion = bridgeVersions.bridgeVersion;
                        bridgeSovereignVersion = bridgeVersions.bridgeSovereignVersion;

                        // Get bytecode for all versions
                        try {
                            const currentBytecode = await getBridgeBytecode(rollupProvider, BRIDGE_ADDRESS);
                            if (currentBytecode) {
                                const currentHash = getBytecodeHash(currentBytecode);
                                implementationBytecodeHashValue = currentHash;
                            }
                        } catch (error) {
                            // Error getting bytecode, keep undefined
                        }
                    }

                    const rollupInfo: RollupInfo & { provider?: any } = {
                        rollupID,
                        name: networkName,
                        providerStatus: providerWorks ? 'Works' : 'Does not work',
                        providerURL: trustedSequencerURL || 'N/A',
                        version,
                        bridgeVersion,
                        bridgeSovereignVersion,
                        implementationBytecodeHash: implementationBytecodeHashValue,
                        provider: rollupProvider,
                    };

                    return rollupInfo;
                } catch (error) {
                    return {
                        rollupID,
                        name: 'Error',
                        providerStatus: 'Error',
                        providerURL: 'Error',
                        version: 'Error',
                        bridgeVersion: 'Error',
                        bridgeSovereignVersion: 'Error',
                        implementationBytecodeHash: undefined,
                        provider: null,
                    };
                }
            })(),
        );
    }

    // Wait for all promises
    const rollupResults = await Promise.all(rollupPromises);

    // Determine reference bytecode hashes for each version (first rollup with each version)
    const versionBytecodeHashes: { [version: string]: string } = {};
    for (const rollupInfo of rollupResults) {
        if (rollupInfo.version && rollupInfo.implementationBytecodeHash && !versionBytecodeHashes[rollupInfo.version]) {
            versionBytecodeHashes[rollupInfo.version] = rollupInfo.implementationBytecodeHash;
            console.log(
                `Found reference bytecode for version "${rollupInfo.version}" at rollup ${rollupInfo.rollupID}, hash: ${rollupInfo.implementationBytecodeHash}\n`,
            );
        }
    }

    // Process results
    for (const rollupInfo of rollupResults) {
        const { provider, ...info } = rollupInfo;
        results.push(info);

        console.log(`Rollup ${info.rollupID}:`);
        console.log(`  Name: ${info.name}`);
        console.log(`  Provider: ${info.providerStatus}`);
        console.log(`  Version: ${info.version}`);
        console.log(`  Bridge Version: ${info.bridgeVersion}`);
        console.log(`  Bridge Sovereign Version: ${info.bridgeSovereignVersion}\n`);

        // Clean up provider
        if (provider) {
            try {
                provider.destroy();
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }

    // Sort results by rollupID
    results.sort((a, b) => a.rollupID - b.rollupID);

    // Print summary table
    console.log('\n=== SUMMARY TABLE ===\n');
    console.log(
        'Rollup ID | Name | Provider Status | Provider URL | Version | Bridge Version | Bridge Sovereign Version',
    );
    console.log(
        '----------|------|-----------------|--------------|---------|----------------|--------------------------',
    );

    for (const result of results) {
        const name = result.name.length > 20 ? `${result.name.substring(0, 17)}...` : result.name;
        const providerURL =
            result.providerURL.length > 30 ? `${result.providerURL.substring(0, 27)}...` : result.providerURL;
        console.log(
            `${result.rollupID.toString().padEnd(9)} | ${name.padEnd(20)} | ${result.providerStatus.padEnd(15)} | ${providerURL.padEnd(30)} | ${result.version.padEnd(7)} | ${result.bridgeVersion.padEnd(14)} | ${result.bridgeSovereignVersion.padEnd(24)}`,
        );
    }

    // Analyze bytecode hashes by version to find matches
    console.log('\n=== BYTECODE HASH ANALYSIS BY VERSION ===\n');

    // Group results by version
    const versionGroups: { [version: string]: RollupInfo[] } = {};
    for (const result of results) {
        if (result.version && result.implementationBytecodeHash) {
            if (!versionGroups[result.version]) {
                versionGroups[result.version] = [];
            }
            versionGroups[result.version].push(result);
        }
    }

    // Build analysis data structure for JSON output
    const versionAnalysis: Array<{
        version: string;
        totalRollups: number;
        hashGroups: Array<{
            hash: string;
            rollupIDs: number[];
            names: string[];
            count: number;
        }>;
        allShareSameBytecode: boolean;
        warning?: string;
    }> = [];

    for (const [version, group] of Object.entries(versionGroups)) {
        if (group.length === 0) continue;

        console.log(`\nVersion: ${version}`);
        console.log(`Found ${group.length} rollup(s) with this version:\n`);

        // Group by bytecode hash within this version
        const hashGroups: { [hash: string]: RollupInfo[] } = {};
        for (const result of group) {
            const hash = result.implementationBytecodeHash!;
            if (!hashGroups[hash]) {
                hashGroups[hash] = [];
            }
            hashGroups[hash].push(result);
        }

        const hashGroupArray: Array<{
            hash: string;
            rollupIDs: number[];
            names: string[];
            count: number;
        }> = [];

        for (const [hash, hashGroup] of Object.entries(hashGroups)) {
            const rollupIDs = hashGroup.map((r) => r.rollupID);
            const names = hashGroup.map((r) => r.name);
            console.log(`  Hash: ${hash.substring(0, 20)}...`);
            console.log(`    Rollup IDs: ${rollupIDs.join(', ')}`);
            console.log(`    Names: ${names.join(', ')}`);
            console.log(`    Count: ${hashGroup.length} rollup(s)`);

            hashGroupArray.push({
                hash,
                rollupIDs,
                names,
                count: hashGroup.length,
            });

            if (hashGroup.length < group.length) {
                console.log(`    ⚠️  WARNING: Not all ${version} rollups share the same bytecode!`);
            }
        }

        const allShareSameBytecode = hashGroupArray.length === 1;
        const analysisEntry: {
            version: string;
            totalRollups: number;
            hashGroups: Array<{
                hash: string;
                rollupIDs: number[];
                names: string[];
                count: number;
            }>;
            allShareSameBytecode: boolean;
            warning?: string;
        } = {
            version,
            totalRollups: group.length,
            hashGroups: hashGroupArray,
            allShareSameBytecode,
        };

        if (!allShareSameBytecode) {
            analysisEntry.warning = `Not all ${version} rollups share the same bytecode!`;
        }

        versionAnalysis.push(analysisEntry);
    }

    // Write results to JSON file
    const outputPath = path.join(__dirname, `./${networkConfig.outputFile}`);
    const outputData = {
        rollups: results,
        versionAnalysis,
    };
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\nResults written to: ${outputPath}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
