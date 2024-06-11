// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

import "contracts/v2/mocks/PolygonRollupManagerMock.sol";
import "contracts/v2/PolygonZkEVMGlobalExitRootV2.sol";
import "contracts/interfaces/IPolygonZkEVMBridge.sol";
import "contracts/v2/PolygonZkEVMBridgeV2.sol";
import "contracts/mocks/ERC20PermitMock.sol";

import "contracts/mocks/VerifierRollupHelperMock.sol";
import "contracts/v2/consensus/zkEVM/PolygonZkEVMEtrog.sol";

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract PolygonRollupManagerTest is Test, IPolygonRollupManager {
    struct CreateNewRollupEvent {
        uint32 rollupID;
        CreateNewRollupEventData data;
    }

    struct CreateNewRollupEventData {
        uint32 rollupTypeID;
        address rollupAddress;
        uint64 chainID;
        address gasTokenAddress;
    }

    // todo change to PolygonRollupManager
    PolygonRollupManagerMock internal rollupManager;
    PolygonZkEVMGlobalExitRootV2 internal globalExitRoot;
    PolygonZkEVMBridgeV2 internal bridge;
    // todo change to IERC20Upgradeable
    ERC20PermitMock internal token;

    // todo change to IVerifierRollup
    VerifierRollupHelperMock internal verifier;
    PolygonZkEVMEtrog internal zkEvm;

    address internal trustedAggregator = makeAddr("trustedAggregator");
    address internal trustedSequencer = makeAddr("trustedAggregator");
    address internal admin = makeAddr("admin");
    address internal timelock = makeAddr("timelock");
    address internal emergencyCouncil = makeAddr("emergencyCouncil");

    // note mimics beforeEach "Deploy contract" from PolygonRollupManager.tests.ts
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
        zkEvm = new PolygonZkEVMEtrog(
            globalExitRoot,
            IERC20Upgradeable(address(token)),
            bridge,
            rollupManager
        );
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
        CreateNewRollupEvent memory createNewRollupEvent = _createNewRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.expectRevert(OnlyRollupAdmin.selector);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 0);
    }

    function testRevert_updateRollupByRollupAdmin_AllSequencedMustBeVerified()
        public
    {
        CreateNewRollupEvent memory createNewRollupEvent = _createNewRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.prank(address(rollupContract));
        rollupManager.onSequenceBatches(1, "");
        vm.expectRevert(AllSequencedMustBeVerified.selector);
        vm.prank(admin);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 0);
    }

    // note mimics it "should check full flow etrog" from PolygonRollupManager.tests.ts
    function _createNewRollup()
        internal
        returns (CreateNewRollupEvent memory createNewRollupEvent)
    {
        // ADD ROLLUP TYPE
        vm.prank(timelock);
        rollupManager.addNewRollupType(
            address(zkEvm),
            verifier,
            0,
            0,
            bytes32(uint256(1)),
            "zkEVM test"
        );

        // CREATE ROLLUP
        vm.recordLogs();
        vm.prank(admin);
        rollupManager.createNewRollup(
            1,
            1000,
            admin,
            trustedSequencer,
            address(0),
            "http://zkevm-json-rpc:8123",
            "zkEVM"
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();
        CreateNewRollupEventData memory createNewRollupEventData = abi.decode(
            logs[2].data,
            (CreateNewRollupEventData)
        );
        createNewRollupEvent = CreateNewRollupEvent(
            uint32(uint256(logs[2].topics[1])),
            createNewRollupEventData
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
