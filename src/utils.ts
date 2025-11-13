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
    let currentProvider = connectedEthers.provider;
    if (parameters.multiplierGas || parameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            );
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
                async function overrideFeeData() {
                    const feedata = await connectedEthers.provider.getFeeData();
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
 * @param {Array} expectedParams - array of expected parameters in string
 * @param {Boolean} checkAddresses - check if the parameter is a correct address in case has Address string in param name
 */
export function checkParams(objParams, expectedParams, checkAddresses = false) {
    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of expectedParams) {
        if (objParams[parameterName] === undefined || objParams[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }

        if (checkAddresses) {
            // Check addresses
            if (parameterName.includes('Address') && !ethers.isAddress(objParams[parameterName])) {
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
 * Retrieves the current Git commit hash and repository URL
 * @returns An object containing the commit hash and repository URL, or null if an error occurs
 */
export function getGitInfo(): { commit: string; repo: string } | null {
    try {
        // Get the latest commit hash
        const commit = execSync('git rev-parse HEAD').toString().trim();

        // Get the repository URL
        const repo = execSync('git config --get remote.origin.url').toString().trim();

        return { commit, repo };
    } catch (error) {
        throw new Error(`getGitInfo: ${error}`);
    }
}
