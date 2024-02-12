import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-dependency-compiler";

import {HardhatUserConfig} from "hardhat/config";

const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";

/*
 * You need to export an object to set up your config
 * Go to https://hardhat.org/config/ to learn more
 */

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const config: HardhatUserConfig = {
    dependencyCompiler: {
        paths: [
            "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol",
            "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
            "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
        ], // ,
        // keep: true
    },
    solidity: {
        compilers: [
            {
                version: "0.8.17",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
            {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: "shanghai",
                },
            },
            {
                version: "0.6.11",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
            {
                version: "0.5.12",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
            {
                version: "0.5.16",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
        ],
        overrides: {
            "contracts/v2/PolygonRollupManager.sol": {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 500,
                    },
                    evmVersion: "shanghai",
                }, // try yul optimizer
            },
            "contracts/v2/PolygonZkEVMBridgeV2.sol": {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999,
                    },
                    evmVersion: "shanghai",
                },
            },
            "contracts/v2/newDeployments/PolygonRollupManagerNotUpgraded.sol": {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 500,
                    },
                    evmVersion: "shanghai",
                }, // try yul optimizer
            },
            "contracts/v2/mocks/PolygonRollupManagerMock.sol": {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 10,
                    },
                    evmVersion: "shanghai",
                }, // try yul optimizer
            },
            // Should have the same optimizations than the RollupManager to verify
            "contracts/v2/lib/PolygonTransparentProxy.sol": {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 500,
                    },
                    evmVersion: "shanghai",
                }, // try yul optimizer
            },
            "contracts/v2/utils/ClaimCompressor.sol": {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: "shanghai",
                    //viaIR: true,
                },
            },
        },
    },
    networks: {
        mainnet: {
            url: process.env.MAINNET_PROVIDER
                ? process.env.MAINNET_PROVIDER
                : `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        ropsten: {
            url: process.env.ROPSTEN_PROVIDER
                ? process.env.ROPSTEN_PROVIDER
                : `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        goerli: {
            url: process.env.GOERLI_PROVIDER
                ? process.env.GOERLI_PROVIDER
                : `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        rinkeby: {
            url: process.env.RINKEBY_PROVIDER
                ? process.env.RINKEBY_PROVIDER
                : `https://rinkeby.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        sepolia: {
            url: process.env.SEPOLIA_PROVIDER
                ? process.env.SEPOLIA_PROVIDER
                : `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        hardhat: {
            initialDate: "0",
            allowUnlimitedContractSize: true,
            initialBaseFeePerGas: 0,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        polygonZKEVMTestnet: {
            url: "https://rpc.cardona.zkevm-rpc.com",
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        polygonZKEVMMainnet: {
            url: "https://zkevm-rpc.com",
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        zkevmDevnet: {
            url: "http://123:123:123:123:123",
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
    },
    gasReporter: {
        enabled: !!process.env.REPORT_GAS,
        outputFile: process.env.REPORT_GAS_FILE ? "./gas_report.md" : undefined,
        noColors: !!process.env.REPORT_GAS_FILE,
    },
    etherscan: {
        apiKey: {
            polygonZKEVMTestnet: `${process.env.ETHERSCAN_ZKEVM_API_KEY}`,
            polygonZKEVMMainnet: `${process.env.ETHERSCAN_ZKEVM_API_KEY}`,
            goerli: `${process.env.ETHERSCAN_API_KEY}`,
            sepolia: `${process.env.ETHERSCAN_API_KEY}`,
            mainnet: `${process.env.ETHERSCAN_API_KEY}`,
            zkevmDevnet: `${process.env.ETHERSCAN_API_KEY}`,
        },
        customChains: [
            {
                network: "polygonZKEVMMainnet",
                chainId: 1101,
                urls: {
                    apiURL: "https://api-zkevm.polygonscan.com/api",
                    browserURL: "https://zkevm.polygonscan.com/",
                },
            },
            {
                network: "polygonZKEVMTestnet",
                chainId: 2442,
                urls: {
                    apiURL: "https://explorer-ui.cardona.zkevm-rpc.com/api",
                    browserURL: "https://explorer-ui.cardona.zkevm-rpc.com",
                },
            },
            {
                network: "zkevmDevnet",
                chainId: 123,
                urls: {
                    apiURL: "http://123:123:123:123:123/api",
                    browserURL: "http://123:123:123:123:123",
                },
            },
        ],
    },
};

export default config;
