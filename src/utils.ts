/* eslint-disable no-restricted-syntax */
/* eslint-disable no-inner-declarations */
/* eslint-disable no-console */
import { ethers, upgrades } from 'hardhat';
import { execSync } from 'child_process';

/**
 * Adjusts the multiplier gas and/or the maxFeePer gas of the provider depending on the parameters values and returns the adjusted provider
 * @param {Object} parameters The input  parameters of the script
 * @returns {Object} The adjusted provider or `ethers.provider` if no parameters applied
 * @param {Object} connectedEthers current ethers instance connected to a network
 */
export function getProviderAdjustingMultiplierGas(parameters, connectedEthers) {
    const currentProvider = connectedEthers.provider;
    if (parameters.multiplierGas || parameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            if (parameters.maxPriorityFeePerGas && parameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${parameters.maxPriorityFeePerGas} gwei, MaxFee${parameters.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(parameters.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(parameters.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', parameters.multiplierGas);
                // Save the original getFeeData function to avoid infinite recursion
                const originalGetFeeData = currentProvider.getFeeData.bind(currentProvider);
                async function overrideFeeData() {
                    const feedata = await originalGetFeeData();
                    return new connectedEthers.FeeData(
                        null,
                        (feedata.maxFeePerGas * BigInt(parameters.multiplierGas)) / BigInt(1000),
                        (feedata.maxPriorityFeePerGas * BigInt(parameters.multiplierGas)) / BigInt(1000),
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }
    return currentProvider;
}

/**
 * Resolves a deployer given the parameters and the current provider
 * @param {Object} currentProvider The current provider
 * @param {Object} parameters Json OBject with the script parameters
 * @param {Object} connectedEthers current ethers instance connected to a network
 * @returns The resolved deployer
 */
export async function getDeployerFromParameters(currentProvider, parameters, connectedEthers) {
    let deployer;
    if (process.env.DEPLOYER_PRIVATE_KEY) {
        deployer = new connectedEthers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = connectedEthers.HDNodeWallet.fromMnemonic(
            connectedEthers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else if (parameters.deployerPvtKey) {
        deployer = new connectedEthers.Wallet(parameters.deployerPvtKey, currentProvider);
    } else {
        [deployer] = await connectedEthers.getSigners();
    }
    return deployer;
}
/**
 * Check if all params are present in the expectedParams
 * @param {Object} objParams - object with parameters
 * @param {Array} expectedParams - array of expected parameters in string (supports dot notation for nested objects)
 * @param {Boolean} checkAddresses - check if the parameter is a correct address in case has Address string in param name
 */
export function checkParams(objParams, expectedParams, checkAddresses = false) {
    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of expectedParams) {
        let value;
        let actualParameterName = parameterName;

        // Support dot notation for nested objects (e.g., 'network.chainID')
        if (parameterName.includes('.')) {
            const keys = parameterName.split('.');
            value = objParams;
            for (const key of keys) {
                value = value?.[key];
                if (value === undefined || value === '') {
                    throw new Error(`Missing parameter: ${parameterName}`);
                }
            }
            // For address checking, use the last part of the dot notation
            actualParameterName = keys[keys.length - 1];
        } else {
            // Backward compatibility: direct parameter access
            value = objParams[parameterName];
            if (value === undefined || value === '') {
                throw new Error(`Missing parameter: ${parameterName}`);
            }
        }

        if (checkAddresses) {
            // Check addresses - support both direct parameter names and nested parameter names
            if (actualParameterName.includes('Address') && !ethers.isAddress(value)) {
                throw new Error(`Invalid parameter address: ${parameterName}`);
            }
        }
    }
}

/**
 * Convert a value into in its hexadecimal string representation with 32 bytes padding
 * @param {Number | BigInt} _value - value to encode
 * @returns {String} encoded value in hexadecimal string
 */
export function valueToStorageBytes(_value) {
    return ethers.toBeHex(_value, 32);
}

/**
 * Scan all SSTORE opcodes in a trace
 * Does not take into account revert operations neither depth
 * @param {Object} trace
 * @returns {Object} - storage writes: {"key": "value"}
 */
export function getStorageWrites(trace) {
    const writes = trace.structLogs
        .filter((log) => log.op === 'SSTORE')
        .map((log) => {
            const [newValue, slot] = log.stack.slice(-2);
            return { newValue, slot };
        });

    // print all storage writes in an object fashion style
    const writeObject = {};
    writes.forEach((write) => {
        writeObject[`0x${write.slot}`] = `0x${write.newValue}`;
    });

    return writeObject;
}

/**
 * Get the owner of the proxy admin of a proxy contract
 * @param {String} proxyAddress - address of the proxy contract
 * @returns {String} - address of the owner of the proxy admin of the proxy
 */
export async function getOwnerOfProxyAdminFromProxy(proxyAddress) {
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
    const proxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
    const ownerAddress = await proxyAdmin.owner();
    return ownerAddress;
}

/**
 * Get all SLOAD and SSTORE in a trace
 * @param {Object} trace
 * @returns {Object} - storage read and writes: {"key": "value"}
 */
export function getStorageReadWrites(trace) {
    return trace.structLogs[trace.structLogs.length - 1].storage;
}

/**
 * Retrieves the current Git commit hash, repository URL and tag
 * @param {Boolean} criticalTooling - (optional) if true, throws an error if no tag
 * @returns An object containing the commit hash and repository URL, or null if an error occurs
 */
export function getGitInfo(criticalTooling = false): { commit: string; repo: string; tag: string } {
    try {
        // Get the latest commit hash
        const commit = execSync('git rev-parse HEAD').toString().trim();

        // Get the repository URL
        const repo = execSync('git config --get remote.origin.url').toString().trim();

        // Get tag if available
        const tag = execSync('git tag --points-at HEAD').toString().trim();

        if (criticalTooling && !tag) {
            throw new Error(
                'Error: This tool is critical. There is no tag associated with the version being used. It must be executed from a tag.',
            );
        }

        return { commit, repo, tag };
    } catch (error) {
        throw new Error(`getGitInfo: ${error}`);
    }
}

/**
 * Calculates the global exit root for a given mainnet exit root and rollup exit root
 * @param {String} mainnetExitRoot - the mainnet exit root
 * @param {String} rollupExitRoot - the rollup exit root
 * @returns {String} the global exit root
 */
export function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

/**
 * Calculates the global exit root leaf for a given global exit root, last block hash and timestamp
 * @param {String} newGlobalExitRoot - the new global exit root
 * @param {String} lastBlockHash - the last block hash
 * @param {Number} timestamp - the timestamp
 * @returns {String} the global exit root leaf
 */
export function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'uint64'],
        [newGlobalExitRoot, lastBlockHash, timestamp],
    );
}

/**
 * Compute accumulateInputHash = Keccak256(oldAccInputHash, batchHashData, l1InfoTreeRoot, timestamp, seqAddress)
 * @param {String} oldAccInputHash - old accumulateInputHash
 * @param {String} batchHashData - Batch hash data
 * @param {String} l1InfoTreeRoot - L1 info tree root
 * @param {Number} timestamp - Block timestamp
 * @param {String} sequencerAddress - Sequencer address
 * @param {String} forcedBlockHash - Forced block hash
 * @returns {String} - accumulateInputHash in hex encoding
 */
export function calculateAccInputHashetrog(
    oldAccInputHash: any,
    batchHashData: any,
    l1InfoTreeRoot: any,
    timestamp: any,
    sequencerAddress: any,
    forcedBlockHash: any,
) {
    const hashKeccak = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'uint64', 'address', 'bytes32'],
        [oldAccInputHash, batchHashData, l1InfoTreeRoot, timestamp, sequencerAddress, forcedBlockHash],
    );

    return hashKeccak;
}

/**
 * Computes the global index for a given index local and index rollup
 * @param {Number} indexLocal - the index local
 * @param {Number} indexRollup - the index rollup
 * @param {Boolean} isMainnet - whether the index is for the mainnet
 * @returns {BigInt} the global index
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

export function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    }
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
}
