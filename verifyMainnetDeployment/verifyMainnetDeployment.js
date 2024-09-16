const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.env.HARDHAT_NETWORK = "hardhat";
const { ethers } = require("hardhat");
const { expect } = require('chai');

const deployMainnet = require("./mainnetDeployment.json");
const mainnetDeployParameters = require("./mainnetDeployParameters.json");

const pathFflonkVerifier = '../artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier.json';
const pathPolygonZkEVMDeployer = '../artifacts/contracts/deployment/PolygonZkEVMDeployer.sol/PolygonZkEVMDeployer.json';
const pathPolygonZkEVMBridge = '../artifacts/contracts/outdated/PolygonZkEVMBridge.sol/PolygonZkEVMBridge.json';
const pathTransparentProxyOZUpgradeDep = '../node_modules/@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
const pathProxyAdmin = '../artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';
const pathTransparentProxy = '../artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
const pathPolygonZkEVMTimelock = '../artifacts/contracts/outdated/PolygonZkEVMTimelock.sol/PolygonZkEVMTimelock.json';
const pathPolygonZkEVM = '../artifacts/contracts/outdated/PolygonZkEVM.sol/PolygonZkEVM.json';
const pathPolygonZkEVMGlobalExitRoot = '../artifacts/contracts/outdated/PolygonZkEVMGlobalExitRoot.sol/PolygonZkEVMGlobalExitRoot.json';

const FflonkVerifier = require(pathFflonkVerifier);
const PolygonZkEVMDeployer = require(pathPolygonZkEVMDeployer);
const PolygonZkEVMBridge = require(pathPolygonZkEVMBridge);
const TransparentProxyOZUpgradeDep = require(pathTransparentProxyOZUpgradeDep);
const ProxyAdmin = require(pathProxyAdmin);
const TransparentProxy = require(pathTransparentProxy);


const etherscanURL = "https://etherscan.io/address/"
async function main() {
    // First verify not immutable conracts
    const mainnetProvider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);

    // FflonkVerifier
    expect(await mainnetProvider.getCode(deployMainnet.fflonkVerifierAddress))
        .to.be.equal(FflonkVerifier.deployedBytecode);
    console.log("FflonkVerifier was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + deployMainnet.fflonkVerifierAddress)
    console.log("Path file: ", path.join(__dirname, pathFflonkVerifier));
    console.log();

    // PolygonZkEVMDeployer
    expect(await mainnetProvider.getCode(deployMainnet.polygonZkEVMDeployerAddress))
        .to.be.equal(PolygonZkEVMDeployer.deployedBytecode);
    console.log("PolygonZkEVMDeployer was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + deployMainnet.polygonZkEVMDeployerAddress)
    console.log("Path file: ", path.join(__dirname, pathPolygonZkEVMDeployer));
    console.log();

    // Bridge
    // Since this contract is a proxy, we will need to verify the implementation
    const polygonZkEVMBridgeImpl = await getImplementationAddress(deployMainnet.polygonZkEVMBridgeAddress, mainnetProvider)

    expect(await mainnetProvider.getCode(polygonZkEVMBridgeImpl))
        .to.be.equal(PolygonZkEVMBridge.deployedBytecode);
    console.log("PolygonZkEVMBridgeAddress implementation was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + polygonZkEVMBridgeImpl)
    console.log("Path file: ", path.join(__dirname, pathPolygonZkEVMBridge));
    console.log();

    // Check transparent Proxys
    expect(await mainnetProvider.getCode(deployMainnet.polygonZkEVMBridgeAddress))
        .to.be.equal(TransparentProxy.deployedBytecode);
    console.log("PolygonZkEVMBridgeAddress proxy was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + deployMainnet.polygonZkEVMBridgeAddress);
    console.log("Path file: ", path.join(__dirname, pathTransparentProxy));
    console.log();

    // The other 3 contracts are immutables, therefore we will deploy them locally and check the btyecode against the deployed one

    // PolygonZkEVMTimelock
    const PolygonZkEVMTimelockFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
    const timelockAddress = mainnetDeployParameters.timelockAddress; //not relevant to deployed bytecode
    const minDelayTimelock = mainnetDeployParameters.minDelayTimelock; //not relevant to deployed bytecode

    const PolygonZkEVMTimelock = await PolygonZkEVMTimelockFactory.deploy(
        minDelayTimelock,
        [timelockAddress],
        [timelockAddress],
        timelockAddress,
        deployMainnet.polygonZkEVMAddress,
    );
    PolygonZkEVMTimelock.deployed()

    const deployedBytecodePolygonZkEVMTimelock = await ethers.provider.getCode(PolygonZkEVMTimelock.address);
    expect(await mainnetProvider.getCode(deployMainnet.polygonZkEVMTimelockAddress))
        .to.be.equal(deployedBytecodePolygonZkEVMTimelock);
    console.log("Timelock was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + deployMainnet.polygonZkEVMTimelockAddress);
    console.log("Path file: ", path.join(__dirname, pathPolygonZkEVMTimelock));
    console.log();

    // polygonZkEVMGlobalExitRoot
    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
    const polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
        deployMainnet.polygonZkEVMAddress,
        deployMainnet.polygonZkEVMBridgeAddress
    );
    polygonZkEVMGlobalExitRoot.deployed()

    const deployedBytecodeGlobalExitRoot = await ethers.provider.getCode(polygonZkEVMGlobalExitRoot.address);
    const polygonZkEVMGlobalImpl = await getImplementationAddress(deployMainnet.polygonZkEVMGlobalExitRootAddress, mainnetProvider)

    expect(await mainnetProvider.getCode(polygonZkEVMGlobalImpl))
        .to.be.equal(deployedBytecodeGlobalExitRoot);
    console.log("PolygonZkEVMGlobalExitRoot implementation was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + polygonZkEVMGlobalImpl);
    console.log("Path file: ", path.join(__dirname, pathPolygonZkEVMGlobalExitRoot));
    console.log();

    // Check transparent Proxys
    expect(await mainnetProvider.getCode(deployMainnet.polygonZkEVMGlobalExitRootAddress))
        .to.be.equal(TransparentProxyOZUpgradeDep.deployedBytecode);
    console.log("PolygonZkEVMGlobalExitRoot proxy was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + deployMainnet.polygonZkEVMGlobalExitRootAddress);
    console.log("Path file: ", path.join(__dirname, pathTransparentProxyOZUpgradeDep));
    console.log();

    // PolygonZkEVM
    const mainnetChainID = mainnetDeployParameters.chainID;
    const mainnetForkID = mainnetDeployParameters.forkID;
    const maticAddress = mainnetDeployParameters.maticTokenAddress;

    const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVM');
    const polygonZkEVMContract = await PolygonZkEVMFactory.deploy(
        deployMainnet.polygonZkEVMGlobalExitRootAddress,
        maticAddress,
        deployMainnet.fflonkVerifierAddress,
        deployMainnet.polygonZkEVMBridgeAddress,
        mainnetChainID,
        mainnetForkID,
    );
    polygonZkEVMContract.deployed()

    const deployedBytecodePolygonZkEVM = await ethers.provider.getCode(polygonZkEVMContract.address);
    const polygonZkEVMImpl = await getImplementationAddress(deployMainnet.polygonZkEVMAddress, mainnetProvider)

    expect(await mainnetProvider.getCode(polygonZkEVMImpl))
        .to.be.equal(deployedBytecodePolygonZkEVM);
    console.log("PolygonZkEVMAddress implementation was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + polygonZkEVMImpl);
    console.log("Path file: ", path.join(__dirname, pathPolygonZkEVM));
    console.log();
    
    // Check transparent Proxys
    expect(await mainnetProvider.getCode(deployMainnet.polygonZkEVMAddress))
        .to.be.equal(TransparentProxyOZUpgradeDep.deployedBytecode);
    console.log("PolygonZkEVMAddress proxy was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + deployMainnet.polygonZkEVMAddress);
    console.log("Path file: ", path.join(__dirname, pathTransparentProxyOZUpgradeDep));
    console.log();

    // Check proxy Admin
    const polygonZkEVMBridgeAdmin = await getProxyAdminAddress(deployMainnet.polygonZkEVMBridgeAddress, mainnetProvider);
    const polygonZkEVMAdmin = await getProxyAdminAddress(deployMainnet.polygonZkEVMAddress, mainnetProvider);
    const polygonZkEVMGlobalExitRootAdmin = await getProxyAdminAddress(deployMainnet.polygonZkEVMGlobalExitRootAddress, mainnetProvider);

    expect(polygonZkEVMBridgeAdmin).to.be.equal(polygonZkEVMAdmin);
    expect(polygonZkEVMAdmin).to.be.equal(polygonZkEVMGlobalExitRootAdmin);
    expect(await mainnetProvider.getCode(polygonZkEVMAdmin))
        .to.be.equal(ProxyAdmin.deployedBytecode);
    console.log("ProxyAdmin proxy was correctly verified")
    console.log("Etherscan URL: ", etherscanURL + polygonZkEVMAdmin);
    console.log("Path file: ", path.join(__dirname, pathProxyAdmin));
    console.log();

    // Assert genesis is the same as the provided in the document
    let mainnetPolygonZkVEM = (await ethers.getContractFactory('PolygonZkEVM', mainnetProvider)).attach(deployMainnet.polygonZkEVMAddress);
    mainnetPolygonZkVEM = mainnetPolygonZkVEM.connect(mainnetProvider);
    expect(await mainnetPolygonZkVEM.batchNumToStateRoot(0)).to.be.equal(deployMainnet.genesisRoot);
    console.log("Genesis root was correctly verified:",deployMainnet.genesisRoot)

}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

//     bytes32 internal constant _ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
//     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function getImplementationAddress(proxyAddress, provider) {
    const implementationAddress = await provider.getStorageAt(proxyAddress, implSlot);
    return `0x${implementationAddress.slice(2 + (32 * 2 - 40))}`
}

async function getProxyAdminAddress(proxyAddress, provider) {
    const adminAddress = await provider.getStorageAt(proxyAddress, adminSlot);
    return `0x${adminAddress.slice(2 + (32 * 2 - 40))}`
}
