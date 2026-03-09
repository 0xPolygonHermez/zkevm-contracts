// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";

// Main contracts
import {AggchainECDSAMultisig} from "contracts/aggchains/AggchainECDSAMultisig.sol";
import {AggchainFEP} from "contracts/aggchains/AggchainFEP.sol";
import {AgglayerBridge} from "contracts/AgglayerBridge.sol";
import {AgglayerGateway} from "contracts/AgglayerGateway.sol";
import {AgglayerGER} from "contracts/AgglayerGER.sol";
import {AgglayerManager} from "contracts/AgglayerManager.sol";

// Interfaces
import {IAgglayerBridge} from "contracts/interfaces/IAgglayerBridge.sol";
import {IAgglayerGateway} from "contracts/interfaces/IAgglayerGateway.sol";
import {IAgglayerGER} from "contracts/interfaces/IAgglayerGER.sol";
import {IPolygonZkEVMBridge} from "contracts/interfaces/IPolygonZkEVMBridge.sol";

// OpenZeppelin contracts
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable4/token/ERC20/IERC20Upgradeable.sol";
import {ProxyAdmin} from "@openzeppelin/contracts5/proxy/transparent/ProxyAdmin.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts5/proxy/transparent/TransparentUpgradeableProxy.sol";

// Libraries
import {Constants} from "test/forge/utils/Constants.sol";

/**
 * @title BaseTest
 * @dev Base contract for foundry tests. Contains setUp function and deployment utilities.
 */
// @remind This is a provisional setup to facilitate testing. Actual deployment and testing methods may differ depending on the type of tests being conducted.
abstract contract BaseTest is Test {
    string internal constant POLYGON_ZKEVM_DEPLOYER_ARTIFACT_PATH =
        "artifacts/contracts/deployment/PolygonZkEVMDeployer.sol/PolygonZkEVMDeployer.json";
    string internal constant AGGLAYER_TIMELOCK_ARTIFACT_PATH =
        "artifacts/contracts/AgglayerTimelock.sol/AgglayerTimelock.json";

    address internal deployer;
    address internal timelock;
    ProxyAdmin internal proxyAdmin;

    // ===== Main protocol contracts (as proxies) =====
    AgglayerBridge internal agglayerBridge;
    AgglayerGateway internal agglayerGateway;
    AgglayerGER internal agglayerGER;
    AgglayerManager internal agglayerManager;

    // ===== Implementation contracts =====
    AggchainECDSAMultisig internal aggchainECDSAImpl;
    AggchainFEP internal aggchainFEPImpl;
    AgglayerBridge internal agglayerBridgeImpl;
    AgglayerGateway internal agglayerGatewayImpl;
    AgglayerGER internal agglayerGERImpl;
    AgglayerManager internal agglayerManagerImpl;

    // ===== Test accounts =====
    address internal owner = makeAddr("owner");
    address internal polygonZkEVM = makeAddr("polygonZkEVM");
    address internal timelockProposer = makeAddr("timelockProposer");
    address internal timelockExecutor = makeAddr("timelockExecutor");

    /**
     * @dev setUp function called before each test
     * Deploys core infrastructure contracts that are used by the deployment system
     *
     * IMPORTANT: This mirrors the actual production deployment pattern where:
     * 1. PolygonZkEVMDeployer is deployed first (via keyless deployment)
     * 2. AgglayerTimelock is deployed directly (not via deployer)
     * 3. Some contracts (ProxyAdmin, AgglayerBridge) are deployed via deployer's create2
     * 4. Main protocol contracts (AgglayerManager, AgglayerGER, AgglayerGateway) are deployed
     *    via OpenZeppelin upgradeable proxies with timelock as admin
     * 5. Timelock gets ownership of ProxyAdmin for governance
     */
    function setUp() public virtual {
        // 1. Deploy PolygonZkEVMDeployer bytecode from Hardhat artifacts
        deployer = deployCode(POLYGON_ZKEVM_DEPLOYER_ARTIFACT_PATH, abi.encode(owner));

        // 2. Etch AgglayerTimelock bytecode from Hardhat artifacts
        address[] memory proposers = new address[](1);
        address[] memory executors = new address[](1);
        proposers[0] = timelockProposer;
        executors[0] = timelockExecutor;

        // Deploy AgglayerTimelock with deployCode and constructor args
        timelock = deployCode(
            AGGLAYER_TIMELOCK_ARTIFACT_PATH,
            abi.encode(Constants.TIMELOCK_MIN_DELAY, proposers, executors, owner, owner)
        );

        // @todo Interdependencies setup (e.g. set rollup manager address in AgglayerGER)
        // @todo Setup mocks for more complex deployments
        deployAgglayerBridge();
        deployAgglayerGER();
        deployAgglayerGateway();
        deployAgglayerManager();
        deployAggchainFEP();
        deployAggchainECDSA();
    }

    /**
     * @dev Deploy contracts using create2 (via PolygonZkEVMDeployer) - mirrors production deployment
     * These contracts are deployed deterministically using the deployer contract with CREATE2
     *
     * In production, these are:
     * 1. ProxyAdmin - deployed via create2Deployment()
     * 2. AgglayerBridge Implementation - deployed via create2Deployment()
     * 3. AgglayerBridge Proxy (TransparentUpgradeableProxy) - deployed via create2Deployment()
     */
    function deployAgglayerBridge() public {
        // === PROXYADMIN DEPLOYMENT (CREATE2) ===
        bytes memory proxyAdminBytecode = abi.encodePacked(type(ProxyAdmin).creationCode, abi.encode(owner));

        vm.prank(owner);
        (bool ok,) = deployer.call(
            abi.encodeWithSignature(
                "deployDeterministic(uint256,bytes32,bytes)", 0, Constants.DEFAULT_SALT, proxyAdminBytecode
            )
        );
        require(ok, "ProxyAdmin deployment failed");

        bytes memory result;
        vm.prank(owner);
        (ok, result) = deployer.call(
            abi.encodeWithSignature(
                "predictDeterministicAddress(bytes32,bytes32)", Constants.DEFAULT_SALT, keccak256(proxyAdminBytecode)
            )
        );
        require(ok, "ProxyAdmin address prediction failed");
        proxyAdmin = ProxyAdmin(abi.decode(result, (address)));
        vm.prank(owner);
        proxyAdmin.transferOwnership(timelock);

        // === AGGLAYERBRIDGE IMPLEMENTATION DEPLOYMENT (CREATE2) ===
        bytes memory agglayerBridgeImplBytecode = abi.encodePacked(type(AgglayerBridge).creationCode);

        vm.prank(owner);
        (ok,) = deployer.call(
            abi.encodeWithSignature(
                "deployDeterministic(uint256,bytes32,bytes)", 0, Constants.DEFAULT_SALT, agglayerBridgeImplBytecode
            )
        );
        require(ok, "Bridge impl deployment failed");

        vm.prank(owner);
        (ok, result) = deployer.call(
            abi.encodeWithSignature(
                "predictDeterministicAddress(bytes32,bytes32)",
                Constants.DEFAULT_SALT,
                keccak256(agglayerBridgeImplBytecode)
            )
        );
        require(ok, "Bridge impl address prediction failed");
        agglayerBridgeImpl = AgglayerBridge(abi.decode(result, (address)));

        // === AGGLAYERBRIDGE PROXY DEPLOYMENT (CREATE2) ===
        bytes memory agglayerBridgeProxyBytecode = abi.encodePacked(
            type(TransparentUpgradeableProxy).creationCode,
            abi.encode(address(agglayerBridgeImpl), address(proxyAdmin), "")
        );

        vm.prank(owner);
        (ok,) = deployer.call(
            abi.encodeWithSignature(
                "deployDeterministic(uint256,bytes32,bytes)", 0, Constants.DEFAULT_SALT, agglayerBridgeProxyBytecode
            )
        );
        require(ok, "Bridge proxy deployment failed");

        vm.prank(owner);
        (ok, result) = deployer.call(
            abi.encodeWithSignature(
                "predictDeterministicAddress(bytes32,bytes32)",
                Constants.DEFAULT_SALT,
                keccak256(agglayerBridgeProxyBytecode)
            )
        );
        require(ok, "Bridge proxy address prediction failed");
        agglayerBridge = AgglayerBridge(abi.decode(result, (address)));
    }

    /**
     * @dev Deploy AgglayerGER contract via OpenZeppelin upgradeable proxy
     * This mirrors the actual production deployment pattern with proper proxy
     */
    function deployAgglayerGER() public returns (AgglayerGER) {
        // === AGGLAYERGER IMPLEMENTATION DEPLOYMENT ===
        agglayerGERImpl = new AgglayerGER(Constants.ROLLUP_MANAGER_ADDRESS, address(agglayerBridge));

        // === AGGLAYERGER PROXY DEPLOYMENT ===
        bytes memory initData = abi.encodeCall(AgglayerGER.initialize, ());
        agglayerGER = AgglayerGER(_proxify(address(agglayerGERImpl), address(proxyAdmin), initData));

        return agglayerGER;
    }

    /**
     * @dev Deploy AgglayerGateway contract via OpenZeppelin upgradeable proxy
     * This mirrors the actual production deployment pattern with proper proxy and admin roles
     */
    function deployAgglayerGateway() public returns (AgglayerGateway) {
        // === AGGLAYERGATEWAY IMPLEMENTATION DEPLOYMENT ===
        agglayerGatewayImpl = new AgglayerGateway();

        // === AGGLAYERGATEWAY PROXY DEPLOYMENT ===
        // @todo Add proper initialization data
        bytes memory initData = "";
        agglayerGateway = AgglayerGateway(_proxify(address(agglayerGatewayImpl), address(proxyAdmin), initData));

        return agglayerGateway;
    }

    /**
     * @dev Deploy AgglayerManager contract via OpenZeppelin upgradeable proxy
     * This mirrors the actual production deployment pattern with proper proxy and admin roles
     */
    function deployAgglayerManager() public returns (AgglayerManager) {
        // === AGGLAYERMANAGER IMPLEMENTATION DEPLOYMENT ===
        // @todo Update constructor args according to actual deployment
        agglayerManagerImpl = new AgglayerManager(
            IAgglayerGER(Constants.GER_MANAGER_ADDRESS),
            IERC20Upgradeable(Constants.POL_TOKEN_ADDRESS),
            IPolygonZkEVMBridge(Constants.BRIDGE_ADDRESS),
            IAgglayerGateway(Constants.AGGLAYER_GATEWAY_ADDRESS)
        );

        // === AGGLAYERMANAGER PROXY DEPLOYMENT ===
        bytes memory initData = abi.encodeCall(AgglayerManager.initialize, ());
        agglayerManager = AgglayerManager(_proxify(address(agglayerManagerImpl), address(proxyAdmin), initData));

        return agglayerManager;
    }

    /**
     * @dev Deploy AggchainFEP implementation contract
     * @return The deployed AggchainFEP contract
     */
    function deployAggchainFEP() public returns (AggchainFEP) {
        // === AGGCHAINFEP IMPLEMENTATION DEPLOYMENT ===
        vm.prank(owner);
        aggchainFEPImpl = new AggchainFEP(
            IAgglayerGER(Constants.GER_MANAGER_ADDRESS),
            IERC20Upgradeable(Constants.POL_TOKEN_ADDRESS),
            IAgglayerBridge(Constants.BRIDGE_ADDRESS),
            AgglayerManager(Constants.ROLLUP_MANAGER_ADDRESS),
            IAgglayerGateway(Constants.AGGLAYER_GATEWAY_ADDRESS)
        );
        return aggchainFEPImpl;
    }

    /**
     * @dev Deploy AggchainECDSAMultisig implementation contract
     * @return The deployed AggchainECDSAMultisig contract
     */
    function deployAggchainECDSA() public returns (AggchainECDSAMultisig) {
        // === AGGCHAINECDSAMULTISIG IMPLEMENTATION DEPLOYMENT ===
        vm.prank(owner);
        aggchainECDSAImpl = new AggchainECDSAMultisig(
            IAgglayerGER(Constants.GER_MANAGER_ADDRESS),
            IERC20Upgradeable(Constants.POL_TOKEN_ADDRESS),
            IAgglayerBridge(Constants.BRIDGE_ADDRESS),
            AgglayerManager(Constants.ROLLUP_MANAGER_ADDRESS),
            IAgglayerGateway(Constants.AGGLAYER_GATEWAY_ADDRESS)
        );
        return aggchainECDSAImpl;
    }

    /// @notice Create and deploy a proxy contract
    /// @param _implementation The implementation contract address
    /// @param _admin The proxy admin address
    /// @param _data The initialization data
    /// @return The deployed proxy address
    function _proxify(address _implementation, address _admin, bytes memory _data) internal returns (address) {
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(_implementation, _admin, _data);
        return address(proxy);
    }
}
