// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {PolygonZkEVM} from "contracts/outdated/PolygonZkEVM.sol";
import {PolygonRollupManagerNotUpgraded} from "contracts/newDeployments/PolygonRollupManagerNotUpgraded.sol";
import {PolygonZkEVMBridgeV2} from "contracts-ignored-originals/PolygonZkEVMBridgeV2.sol";
import {PolygonZkEVMGlobalExitRootV2} from "contracts/PolygonZkEVMGlobalExitRootV2.sol";
import {PolygonZkEVMDeployer} from "contracts/deployment/PolygonZkEVMDeployer.sol";
import {PolygonZkEVMTimelock} from "contracts/PolygonZkEVMTimelock.sol";

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IPolygonZkEVMBridge} from "contracts/interfaces/IPolygonZkEVMBridge.sol";
import {IPolygonZkEVMGlobalExitRootV2} from "contracts/interfaces/IPolygonZkEVMGlobalExitRootV2.sol";

contract DeployContracts is Script {
    using stdJson for string;

    address constant GAS_TOKEN_ADDR_MAINNET = address(0);
    uint256 constant NETWORK_ID_MAINNET = 0;
    uint256 constant GAS_TOKEN_NETWORK_MAINNET = 0;
    bytes constant GAS_TOKEN_METADATA = bytes("");

    // config parameters
    address admin;
    address emergencyCouncilAddress;
    address gasTokenAddress;
    address polTokenAddress;
    address timelockAdminAddress;
    address trustedAggregator;
    address zkEVMDeployerAddress;
    uint256 deployerPvtKey;
    uint256 gasTokenNetwork;
    uint256 minDelayTimelock;
    uint256 pendingStateTimeout;
    uint256 trustedAggregatorTimeout;
    bytes32 salt;

    address computedRollupManagerAddress;
    address computedGlobalExitRootManagerAddress;

    PolygonZkEVMDeployer zkevmDeployer;

    function run() public {
        loadConfig();
        _computeDeployAddresses();
        address proxyAdminAddr = _deployProxyAdmin();
        address bridgeImplementation = _deployBridgeImplementation();

        _deployTimelock(proxyAdminAddr, computedRollupManagerAddress);

        address bridgeProxy = _deployBridgeProxy(
            bridgeImplementation,
            computedGlobalExitRootManagerAddress,
            computedRollupManagerAddress,
            proxyAdminAddr
        );

        address globalExitRootManager = _deployGlobalExitRootManager(
            computedRollupManagerAddress,
            bridgeProxy
        );
        _deployRollupManager(globalExitRootManager, bridgeProxy);
    }

    function loadConfig() public {
        string memory inputPath = "script/inputs/deployParameters.json";
        console.log("Reading config from path: %s \n", inputPath);

        string memory input = vm.readFile(inputPath);

        admin = input.readAddress(".admin");
        emergencyCouncilAddress = input.readAddress(".emergencyCouncilAddress");
        gasTokenAddress = input.readAddress(".gasTokenAddress");
        polTokenAddress = input.readAddress(".polTokenAddress");
        timelockAdminAddress = input.readAddress(".timelockAdminAddress");
        trustedAggregator = input.readAddress(".trustedAggregator");
        zkEVMDeployerAddress = input.readAddress(".zkEVMDeployerAddress");
        deployerPvtKey = input.readUint(".deployerPvtKey");
        gasTokenNetwork = input.readUint(".gasTokenNetwork");
        minDelayTimelock = input.readUint(".minDelayTimelock");
        pendingStateTimeout = input.readUint(".pendingStateTimeout");
        trustedAggregatorTimeout = input.readUint(".trustedAggregatorTimeout");
        salt = input.readBytes32(".salt");

        zkevmDeployer = PolygonZkEVMDeployer(zkEVMDeployerAddress);

        console.log("Admin Address: %s", address(admin));
        console.log(
            "Emergency Council Address: %s",
            address(emergencyCouncilAddress)
        );
        console.log("Gas Token Address: %s", address(gasTokenAddress));
        console.log("Pol Token Address: %s", address(polTokenAddress));
        console.log(
            "Timelock Admin Address: %s",
            address(timelockAdminAddress)
        );
        console.log(
            "Trusted Aggregator Address: %s",
            address(trustedAggregator)
        );
        console.log(
            "ZkEVM Deployer Address: %s",
            address(zkEVMDeployerAddress)
        );
        console.log("Deployer Private Key: %s", deployerPvtKey);
        console.log("Gas Token Network: %s", gasTokenNetwork);
        console.log("Min Delay Timelock: %s", minDelayTimelock);
        console.log("Pending State Timeout: %s", pendingStateTimeout);
        console.log("Trusted Aggregator Timeout: %s", trustedAggregatorTimeout);
        console.log("Salt:");
        console.logBytes32(salt);
    }

    function _deployProxyAdmin() internal returns (address) {
        bytes memory bytecode = type(ProxyAdmin).creationCode;
        address proxyAdminAddr = vm.computeCreate2Address(
            salt,
            keccak256(bytecode),
            address(zkevmDeployer)
        );

        // check if there is already a ProxyAdmin deployed at the address
        if (proxyAdminAddr.code.length > 0) {
            console.log("\n----------------------\n");
            console.log(
                "ProxyAdmin already deployed at address: %s",
                proxyAdminAddr
            );
            return proxyAdminAddr;
        }

        // if not, deploy ProxyAdmin and transfer ownership to deployer
        bytes memory callData = abi.encodeWithSelector(
            ProxyAdmin(proxyAdminAddr).transferOwnership.selector,
            vm.addr(deployerPvtKey)
        );
        vm.startBroadcast(deployerPvtKey);
        zkevmDeployer.deployDeterministicAndCall(0, salt, bytecode, callData);
        vm.stopBroadcast();

        console.log("\n----------------------\n");
        console.log("ProxyAdmin deployed and ownership transferred!");
        console.log("Proxy Admin Address: %s", proxyAdminAddr);
        console.log(
            "Proxy Admin Owner Address: %s",
            ProxyAdmin(proxyAdminAddr).owner()
        );
        return proxyAdminAddr;
    }

    function _deployBridgeImplementation() internal returns (address) {
        bytes memory bytecode = type(PolygonZkEVMBridgeV2).creationCode;
        address bridgeAddress = zkevmDeployer.predictDeterministicAddress(
            salt,
            keccak256(bytecode)
        );

        // check if there is already a Bridge implementation deployed at the address
        if (bridgeAddress.code.length > 0) {
            console.log("\n----------------------\n");
            console.log(
                "Bridge implementation already deployed at address: %s",
                bridgeAddress
            );
            return bridgeAddress;
        }

        // deploy Bridge implementation deterministically
        vm.startBroadcast(deployerPvtKey);
        zkevmDeployer.deployDeterministic(0, salt, bytecode);
        vm.stopBroadcast();

        console.log("\n----------------------\n");
        console.log("Bridge implementation deployed!");
        console.log("Bridge Implementation Address: %s", bridgeAddress);
        return bridgeAddress;
    }

    function _deployTimelock(
        address proxyAdminAddr,
        address polygonRollupManagerAddr
    ) internal {
        vm.startBroadcast(deployerPvtKey);
        address[] memory adminAddresses = new address[](1);
        adminAddresses[0] = timelockAdminAddress;
        PolygonZkEVMTimelock timelock = new PolygonZkEVMTimelock(
            minDelayTimelock,
            adminAddresses,
            adminAddresses,
            timelockAdminAddress,
            PolygonZkEVM(polygonRollupManagerAddr)
        );
        ProxyAdmin(proxyAdminAddr).transferOwnership(address(timelock));
        vm.stopBroadcast();

        console.log("\n----------------------\n");
        console.log("Timelock deployed and ProxyAdmin ownership transferred!");
        console.log("Timelock Address: %s", address(timelock));
        console.log(
            "Proxy Admin Owner Address: %s",
            ProxyAdmin(proxyAdminAddr).owner()
        );
    }

    function _deployBridgeProxy(
        address bridgeImplementationAddr,
        address globalExitRootManagerAddr,
        address rollupManagerAddr,
        address proxyAdminAddr
    ) internal returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(TransparentUpgradeableProxy).creationCode,
            abi.encode(bridgeImplementationAddr, proxyAdminAddr, bytes(""))
        );
        address bridgeProxyAddress = zkevmDeployer.predictDeterministicAddress(
            salt,
            keccak256(bytecode)
        );

        // check if there is already a Bridge proxy deployed at the address
        if (bridgeProxyAddress.code.length > 0) {
            console.log("\n----------------------\n");
            console.log(
                "Bridge proxy already deployed at address: %s",
                bridgeProxyAddress
            );
            return bridgeProxyAddress;
        }

        bytes memory callData = abi.encodeWithSelector(
            PolygonZkEVMBridgeV2(bridgeProxyAddress).initialize.selector,
            NETWORK_ID_MAINNET,
            GAS_TOKEN_ADDR_MAINNET,
            GAS_TOKEN_NETWORK_MAINNET,
            globalExitRootManagerAddr,
            rollupManagerAddr,
            GAS_TOKEN_METADATA
        );

        vm.startBroadcast(deployerPvtKey);
        zkevmDeployer.deployDeterministicAndCall(0, salt, bytecode, callData);
        vm.stopBroadcast();

        console.log("\n----------------------\n");
        console.log("Bridge proxy deployed!");
        console.log("Bridge Proxy Address: %s", bridgeProxyAddress);
        return bridgeProxyAddress;
    }

    function _deployGlobalExitRootManager(
        address rollupManagerAddr,
        address bridgeAddr
    ) internal returns (address) {
        vm.startBroadcast(deployerPvtKey);
        PolygonZkEVMGlobalExitRootV2 globalExitRootManagerImpl = new PolygonZkEVMGlobalExitRootV2(
                rollupManagerAddr,
                bridgeAddr
            );
        address globalExitRootManagerProxy = _proxify(
            address(globalExitRootManagerImpl)
        );
        vm.stopBroadcast();

        console.log("\n----------------------\n");
        console.log("Global Exit Root Manager deployed!");
        console.log(
            "Global Exit Root Manager Address: %s",
            globalExitRootManagerProxy
        );
        return globalExitRootManagerProxy;
    }

    function _deployRollupManager(
        address globalExitRootManagerAddr,
        address bridgeAddr
    ) internal returns (address) {
        vm.startBroadcast(deployerPvtKey);
        PolygonRollupManagerNotUpgraded rollupManagerImpl = new PolygonRollupManagerNotUpgraded(
                IPolygonZkEVMGlobalExitRootV2(globalExitRootManagerAddr),
                IERC20Upgradeable(polTokenAddress),
                IPolygonZkEVMBridge(bridgeAddr)
            );
        address rollupManagerProxy = _proxify(address(rollupManagerImpl));
        vm.stopBroadcast();

        console.log("\n----------------------\n");
        console.log("Rollup Manager deployed!");
        console.log("Rollup Manager Address: %s", rollupManagerProxy);
        return rollupManagerProxy;
    }

    function _computeDeployAddresses() internal {
        uint256 nonceProxyGlobalExitRootManager = vm.getNonce(
            vm.addr(deployerPvtKey)
        ) + 6;
        uint256 nonceProxyRollupManager = nonceProxyGlobalExitRootManager + 2;

        computedGlobalExitRootManagerAddress = vm.computeCreateAddress(
            vm.addr(deployerPvtKey),
            nonceProxyGlobalExitRootManager
        );

        computedRollupManagerAddress = vm.computeCreateAddress(
            vm.addr(deployerPvtKey),
            nonceProxyRollupManager
        );
    }

    function _proxify(address logic) internal returns (address proxy) {
        TransparentUpgradeableProxy proxy_ = new TransparentUpgradeableProxy(
            logic,
            msg.sender,
            ""
        );
        return (address(proxy_));
    }
}
