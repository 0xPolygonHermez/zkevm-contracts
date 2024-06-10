// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

import "contracts/v2/mocks/PolygonRollupManagerMock.sol";
import "contracts/v2/PolygonZkEVMGlobalExitRootV2.sol";
import "contracts/interfaces/IPolygonZkEVMBridge.sol";
import "contracts/v2/PolygonZkEVMBridgeV2.sol";
import "contracts/mocks/ERC20PermitMock.sol";

import "contracts/mocks/VerifierRollupHelperMock.sol";

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract PolygonRollupManagerTest is Test, IPolygonRollupManager {
    // todo change to PolygonRollupManager
    PolygonRollupManagerMock internal rollupManager;
    PolygonZkEVMGlobalExitRootV2 internal globalExitRoot;
    PolygonZkEVMBridgeV2 internal bridge;
    // todo change to IERC20Upgradeable
    ERC20PermitMock internal token;

    // todo change to IVerifierRollup
    VerifierRollupHelperMock internal verifier;

    address internal trustedAggregator = makeAddr("trustedAggregator");
    address internal admin = makeAddr("admin");
    address internal timelock = makeAddr("timelock");
    address internal emergencyCouncil = makeAddr("emergencyCouncil");

    // note mimics beforeEach from PolygonRollupManager.tests.ts
    function setUp() public {
        // BRIDGE
        bridge = new PolygonZkEVMBridgeV2();
        bridge = PolygonZkEVMBridgeV2(_proxify(address(bridge)));

        // GLOBAL EXIT ROOT
        address rollupManagerAddr = vm.computeCreateAddress(
            address(this),
            vm.getNonce(address(this)) + 4
        );
        globalExitRoot = new PolygonZkEVMGlobalExitRootV2(
            rollupManagerAddr,
            address(bridge)
        );
        globalExitRoot = PolygonZkEVMGlobalExitRootV2(
            _proxify(address(globalExitRoot))
        );

        // ROLLUP MANAGER
        token = new ERC20PermitMock(
            "Polygon Ecosystem Token",
            "POL",
            address(this),
            20000000 ether
        );
        rollupManager = new PolygonRollupManagerMock(
            globalExitRoot,
            IERC20Upgradeable(address(token)),
            // todo change to PolygonZkEVMBridgeV2
            IPolygonZkEVMBridge(address(bridge))
        );
        rollupManager = PolygonRollupManagerMock(
            _proxify(address(rollupManager))
        );
        require(
            address(rollupManager) == rollupManagerAddr,
            "Unexpected rollupManager address. Check nonce."
        );

        // OTHER
        verifier = new VerifierRollupHelperMock();

        // INITIALIZATION
        bridge.initialize(
            0,
            address(0),
            0,
            globalExitRoot,
            address(rollupManager),
            ""
        );
        rollupManager.initializeMock(
            trustedAggregator,
            100,
            100,
            admin,
            timelock,
            emergencyCouncil
        );
    }

    function testRevert_updateRollupByRollupAdmin_OnlyRollupAdmin() public {
        address rollupContractAddr;
        vm.mockCall(
            rollupContractAddr,
            abi.encodePacked(IPolygonRollupBase.admin.selector),
            abi.encode(makeAddr("not msg.sender"))
        );
        vm.expectRevert(OnlyRollupAdmin.selector);
        rollupManager.updateRollupByRollupAdmin(
            ITransparentUpgradeableProxy(rollupContractAddr),
            0
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
