// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

import "contracts/mocks/PolygonRollupManagerMock.sol";
import "contracts/PolygonZkEVMGlobalExitRootV2.sol";
import "contracts/interfaces/IPolygonZkEVMBridge.sol";
import "contracts/interfaces/IPolygonZkEVMBridgeV2Extended.sol";
import "contracts/interfaces/IPolygonZkEVMBridgeV2.sol";
import "contracts/mocks/ERC20PermitMock.sol";

import "contracts/mocks/VerifierRollupHelperMock.sol";
import "contracts/consensus/zkEVM/PolygonZkEVMEtrog.sol";

import {PolygonZkEVMBridgeV2Deployer} from "script/deployers/PolygonZkEVMBridgeV2Deployer.s.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

// note extends PolygonRollupManager.tests.ts
contract PolygonRollupManagerTest is
    Test,
    IPolygonRollupManager,
    PolygonZkEVMBridgeV2Deployer
{
    error OnlyNotEmergencyState();

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

    mapping(string functionName => mapping(string snapshotName => uint256 snapshotId))
        private snapshot;

    // todo change to PolygonRollupManager
    PolygonRollupManagerMock internal rollupManager;
    PolygonZkEVMGlobalExitRootV2 internal globalExitRoot;
    IPolygonZkEVMBridgeV2Extended internal bridge;
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
    address internal beneficiary = makeAddr("beneficiary");

    event UpdateRollup(
        uint32 indexed rollupID,
        uint32 newRollupTypeID,
        uint64 lastVerifiedBatchBeforeUpgrade
    );

    // note mimics beforeEach "Deploy contract"
    function setUp() public {
        // BRIDGE
        bridge = IPolygonZkEVMBridgeV2Extended(
            _preDeployPolygonZkEVMBridgeV2()
        );
        bridge = IPolygonZkEVMBridgeV2Extended(_proxify(address(bridge)));

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
            // todo change to IPolygonZkEVMBridgeV2Extended
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
            IPolygonZkEVMBridgeV2(address(bridge)),
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
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.expectRevert(OnlyRollupAdmin.selector);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 0);
    }

    function testRevert_updateRollupByRollupAdmin_AllSequencedMustBeVerified()
        public
    {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.prank(address(rollupContract));
        rollupManager.onSequenceBatches(1, "");
        vm.expectRevert(AllSequencedMustBeVerified.selector);
        vm.prank(admin);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 0);
    }

    function testRevert_updateRollupByRollupAdmin_UpdateToOldRollupTypeID()
        public
    {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.expectRevert(UpdateToOldRollupTypeID.selector);
        vm.prank(admin);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 1);
    }

    function testRevert_updateRollupByRollupAdmin_RollupTypeDoesNotExist_NonZero()
        public
    {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        uint32 invalidNewRollupTypeID = rollupManager.rollupTypeCount() + 1;
        vm.expectRevert(RollupTypeDoesNotExist.selector);
        vm.prank(admin);
        rollupManager.updateRollupByRollupAdmin(
            rollupContract,
            invalidNewRollupTypeID
        );
    }

    function testRevert_updateRollupByRollupAdmin_RollupMustExist() public {
        _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                makeAddr("not rollup")
            );
        vm.mockCall(
            address(rollupContract),
            abi.encodePacked(IPolygonRollupBase.admin.selector),
            abi.encode(address(this))
        );
        vm.expectRevert(RollupMustExist.selector);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 1);
    }

    function testRevert_updateRollupByRollupAdmin_RollupTypeObsolete() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        _addSecondRollupType(zkEvm, verifier, 1);
        vm.prank(admin);
        rollupManager.obsoleteRollupType(2);
        vm.expectRevert(RollupTypeObsolete.selector);
        vm.prank(admin);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 2);
    }

    function testRevert_updateRollupByRollupAdmin_UpdateNotCompatible() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        _addSecondRollupType(zkEvm, verifier, 2);
        vm.expectRevert(UpdateNotCompatible.selector);
        vm.prank(admin);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 2);
    }

    // @note didn't hit CannotUpdateWithUnconsolidatedPendingState from updateRollupByRollupAdmin

    function test_updateRollupByRollupAdmin() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        PolygonZkEVMEtrog zkEvm2 = new PolygonZkEVMEtrog(
            globalExitRoot,
            IERC20Upgradeable(address(token)),
            IPolygonZkEVMBridgeV2(address(bridge)),
            rollupManager
        );
        VerifierRollupHelperMock verifier2 = new VerifierRollupHelperMock();
        _addSecondRollupType(zkEvm2, verifier2, 1);
        vm.expectCall(
            address(rollupContract),
            abi.encodeCall(
                rollupContract.upgradeToAndCall,
                (address(zkEvm2), "")
            )
        );
        vm.expectEmit();
        emit UpdateRollup(createNewRollupEvent.rollupID, 2, 1);
        vm.prank(admin);
        rollupManager.updateRollupByRollupAdmin(rollupContract, 2);
        (
            ,
            ,
            IVerifierRollup verifier_,
            uint64 forkID,
            ,
            ,
            ,
            ,
            ,
            ,
            uint64 lastVerifiedBatchBeforeUpgrade,
            uint64 rollupTypeID
        ) = rollupManager.rollupIDToRollupData(createNewRollupEvent.rollupID);
        assertEq(address(verifier_), address(verifier2));
        assertEq(forkID, 2);
        assertEq(rollupTypeID, 1);
        assertEq(lastVerifiedBatchBeforeUpgrade, 2);
    }

    function testRevert_updateRollup_RollupTypeDoesNotExist_Zero() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.expectRevert(RollupTypeDoesNotExist.selector);
        vm.prank(timelock);
        rollupManager.updateRollup(rollupContract, 0, "");
    }

    function testRevert_updateRollup_RollupTypeDoesNotExist_NonZero() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        uint32 invalidNewRollupTypeID = rollupManager.rollupTypeCount() + 1;
        vm.expectRevert(RollupTypeDoesNotExist.selector);
        vm.prank(timelock);
        rollupManager.updateRollup(rollupContract, invalidNewRollupTypeID, "");
    }

    function testRevert_updateRollup_RollupMustExist() public {
        _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                makeAddr("not rollup")
            );
        vm.mockCall(
            address(rollupContract),
            abi.encodePacked(IPolygonRollupBase.admin.selector),
            abi.encode(address(this))
        );
        vm.expectRevert(RollupMustExist.selector);
        vm.prank(timelock);
        rollupManager.updateRollup(rollupContract, 1, "");
    }

    function testRevert_updateRollup_UpdateToSameRollupTypeID() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.expectRevert(UpdateToSameRollupTypeID.selector);
        vm.prank(timelock);
        rollupManager.updateRollup(
            rollupContract,
            createNewRollupEvent.data.rollupTypeID,
            ""
        );
    }

    function testRevert_updateRollup_RollupTypeObsolete() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        _addSecondRollupType(zkEvm, verifier, 1);
        vm.prank(admin);
        rollupManager.obsoleteRollupType(2);
        vm.expectRevert(RollupTypeObsolete.selector);
        vm.prank(timelock);
        rollupManager.updateRollup(rollupContract, 2, "");
    }

    function testRevert_updateRollup_UpdateNotCompatible() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        _addSecondRollupType(zkEvm, verifier, 2);
        vm.expectRevert(UpdateNotCompatible.selector);
        vm.prank(timelock);
        rollupManager.updateRollup(rollupContract, 2, "");
    }

    function test_updateRollup_CannotUpdateWithUnconsolidatedPendingState()
        public
    {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        vm.revertTo(
            snapshot["_createRollup"]["before verifyBatchesTrustedAggregator"]
        );
        vm.warp(99999999);
        bytes32[24] memory proof;
        rollupManager.verifyBatches(
            1,
            0,
            0,
            1,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        _addSecondRollupType(zkEvm, verifier, 1);
        vm.expectRevert(CannotUpdateWithUnconsolidatedPendingState.selector);
        vm.prank(timelock);
        rollupManager.updateRollup(rollupContract, 2, "");
    }

    function test_updateRollup() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        PolygonZkEVMEtrog zkEvm2 = new PolygonZkEVMEtrog(
            globalExitRoot,
            IERC20Upgradeable(address(token)),
            IPolygonZkEVMBridgeV2(address(bridge)),
            rollupManager
        );
        VerifierRollupHelperMock verifier2 = new VerifierRollupHelperMock();
        _addSecondRollupType(zkEvm2, verifier2, 1);
        bytes memory data = abi.encodePacked(
            zkEvm2.calculatePolPerForceBatch.selector
        );
        vm.expectCall(
            address(rollupContract),
            abi.encodeCall(
                rollupContract.upgradeToAndCall,
                (address(zkEvm2), data)
            )
        );
        vm.expectEmit();
        emit UpdateRollup(createNewRollupEvent.rollupID, 2, 1);
        vm.prank(timelock);
        rollupManager.updateRollup(rollupContract, 2, data);
        (
            ,
            ,
            IVerifierRollup verifier_,
            uint64 forkID,
            ,
            ,
            ,
            ,
            ,
            ,
            uint64 lastVerifiedBatchBeforeUpgrade,
            uint64 rollupTypeID
        ) = rollupManager.rollupIDToRollupData(createNewRollupEvent.rollupID);
        assertEq(address(verifier_), address(verifier2));
        assertEq(forkID, 2);
        assertEq(rollupTypeID, 1);
        assertEq(lastVerifiedBatchBeforeUpgrade, 2);
    }

    function testRevert_rollbackBatches_RollupMustExist() public {
        IPolygonRollupBase rollupContract = IPolygonRollupBase(
            makeAddr("not rollup")
        );
        vm.mockCall(
            address(rollupContract),
            abi.encodePacked(IPolygonRollupBase.admin.selector),
            abi.encode(address(this))
        );
        vm.expectRevert(RollupMustExist.selector);
        rollupManager.rollbackBatches(rollupContract, 0);
    }

    function testRevert_rollbackBatches_RollbackBatchIsNotEndOfSequence()
        public
    {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        IPolygonRollupBase rollupContract = IPolygonRollupBase(
            createNewRollupEvent.data.rollupAddress
        );
        vm.prank(address(rollupContract));
        rollupManager.onSequenceBatches(2, "");
        vm.expectRevert(RollbackBatchIsNotEndOfSequence.selector);
        vm.prank(timelock);
        rollupManager.rollbackBatches(rollupContract, 2);
    }

    function testRevert_onSequenceBatches_OnlyNotEmergencyState() public {
        vm.prank(emergencyCouncil);
        rollupManager.activateEmergencyState();
        vm.expectRevert(OnlyNotEmergencyState.selector);
        rollupManager.onSequenceBatches(0, "");
    }

    // @todo verifyBatches

    function test_verifyBatchesTrustedAggregator_CleansState() public {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        vm.revertTo(
            snapshot["_createRollup"]["before verifyBatchesTrustedAggregator"]
        );
        vm.warp(99999999);
        bytes32[24] memory proof;
        rollupManager.verifyBatches(
            1,
            0,
            0,
            1,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.prank(address(rollupContract));
        rollupManager.onSequenceBatches(1, hex"01");
        vm.prank(address(rollupContract));
        rollupManager.onSequenceBatches(1, hex"01");
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            uint64 lastPendingState,
            uint64 lastPendingStateConsolidated,
            ,
            ,

        ) = rollupManager.rollupIDToRollupData(createNewRollupEvent.rollupID);
        assertTrue(lastPendingState != 0 || lastPendingStateConsolidated != 0);
        vm.prank(trustedAggregator);
        rollupManager.verifyBatchesTrustedAggregator(
            1,
            0,
            0,
            2,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            lastPendingState,
            lastPendingStateConsolidated,
            ,
            ,

        ) = rollupManager.rollupIDToRollupData(createNewRollupEvent.rollupID);
        assertEq(lastPendingState, 0);
        assertEq(lastPendingStateConsolidated, 0);
    }

    function testRevert_verifyBatchesTrustedAggregator_InitBatchMustMatchCurrentForkID()
        public
    {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        PolygonZkEVMEtrog zkEvm2 = new PolygonZkEVMEtrog(
            globalExitRoot,
            IERC20Upgradeable(address(token)),
            IPolygonZkEVMBridgeV2(address(bridge)),
            rollupManager
        );
        VerifierRollupHelperMock verifier2 = new VerifierRollupHelperMock();
        _addSecondRollupType(zkEvm2, verifier2, 1);
        bytes memory data = abi.encodePacked(
            zkEvm2.calculatePolPerForceBatch.selector
        );
        vm.prank(timelock);
        rollupManager.updateRollup(rollupContract, 2, data);
        rollupManager.rollupIDToRollupData(createNewRollupEvent.rollupID);
        bytes32[24] memory proof;
        vm.expectRevert(InitBatchMustMatchCurrentForkID.selector);
        vm.prank(trustedAggregator);
        rollupManager.verifyBatchesTrustedAggregator(
            1,
            0,
            0,
            1,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
    }

    function testRevert_verifyBatchesTrustedAggregator_PendingStateDoesNotExist()
        public
    {
        _createRollup();
        vm.revertTo(
            snapshot["_createRollup"]["before verifyBatchesTrustedAggregator"]
        );
        bytes32[24] memory proof;
        vm.expectRevert(PendingStateDoesNotExist.selector);
        vm.prank(trustedAggregator);
        rollupManager.verifyBatchesTrustedAggregator(
            1,
            1,
            0,
            1,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
    }

    function testRevert_verifyBatchesTrustedAggregator_InitNumBatchDoesNotMatchPendingState()
        public
    {
        CreateNewRollupEvent memory createNewRollupEvent = _createRollup();
        vm.revertTo(
            snapshot["_createRollup"]["before verifyBatchesTrustedAggregator"]
        );
        vm.warp(99999999);
        bytes32[24] memory proof;
        rollupManager.verifyBatches(
            1,
            0,
            0,
            1,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
        ITransparentUpgradeableProxy rollupContract = ITransparentUpgradeableProxy(
                createNewRollupEvent.data.rollupAddress
            );
        vm.prank(address(rollupContract));
        rollupManager.onSequenceBatches(1, hex"01");
        vm.prank(address(rollupContract));
        rollupManager.onSequenceBatches(1, hex"01");
        rollupManager.rollupIDToRollupData(createNewRollupEvent.rollupID);
        vm.expectRevert(InitNumBatchDoesNotMatchPendingState.selector);
        vm.prank(trustedAggregator);
        rollupManager.verifyBatchesTrustedAggregator(
            1,
            1,
            0,
            1,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
    }

    function testRevert_verifyBatchesTrustedAggregator_OldStateRootDoesNotExist()
        public
    {
        _createRollup();
        bytes32[24] memory proof;
        vm.expectRevert(OldStateRootDoesNotExist.selector);
        vm.prank(trustedAggregator);
        rollupManager.verifyBatchesTrustedAggregator(
            1,
            0,
            999999999,
            1,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
    }

    function testRevert_activateEmergencyState_HaltTimeoutNotExpired() public {
        _createRollup();
        vm.expectRevert(HaltTimeoutNotExpired.selector);
        rollupManager.activateEmergencyState();
    }

    // note mimics it "should check full flow etrog"
    function _createRollup()
        internal
        returns (CreateNewRollupEvent memory createNewRollupEvent)
    {
        // ADD ROLLUP TYPE
        vm.prank(timelock);
        rollupManager.addNewRollupType(
            address(zkEvm),
            verifier,
            1,
            1,
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

        snapshot["_createRollup"]["before verifyBatchesTrustedAggregator"] = vm
            .snapshot();

        // VERIFY BATCH
        bytes32[24] memory proof;
        vm.prank(trustedAggregator);
        rollupManager.verifyBatchesTrustedAggregator(
            1,
            0,
            0,
            1,
            0xbc02d42b4cf5e49efd5b4d51ff4d4f4981128a48d603e2f73be9338a4fb09fb4,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            beneficiary,
            proof
        );
    }

    function _addSecondRollupType(
        PolygonZkEVMEtrog zkEvm_,
        VerifierRollupHelperMock verifier_,
        uint8 rollupCompatibilityID
    ) internal {
        vm.prank(timelock);
        rollupManager.addNewRollupType(
            address(zkEvm_),
            verifier_,
            2,
            rollupCompatibilityID,
            bytes32(uint256(2)),
            "zkEVM test 2"
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

    function _preDeployPolygonZkEVMBridgeV2()
        internal
        returns (address implementation)
    {
        string[] memory exe = new string[](5);
        exe[0] = "forge";
        exe[1] = "inspect";
        exe[2] = "PolygonZkEVMBridgeV2";
        exe[3] = "bytecode";
        exe[
            4
        ] = "--contracts=contracts-ignored-originals/PolygonZkEVMBridgeV2.sol";

        bytes memory creationCode = vm.ffi(exe);
        implementation = makeAddr("PolygonZkEVMBridgeV2");

        vm.etch(implementation, creationCode);
        (bool success, bytes memory runtimeBytecode) = implementation.call("");
        require(success, "Failed to predeploy PolygonZkEVMBridgeV2");
        vm.etch(implementation, runtimeBytecode);
    }
}
