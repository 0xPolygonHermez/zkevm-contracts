// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

import {PolygonRollupManager} from "contracts/PolygonRollupManager.sol";

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IPolygonValidium} from "contracts/interfaces/IPolygonValidium.sol";
import {IPolygonZkEVMBridgeV2Extended} from "contracts/interfaces/IPolygonZkEVMBridgeV2Extended.sol";
import {IPolygonZkEVMBridgeV2} from "contracts/interfaces/IPolygonZkEVMBridgeV2.sol";

import {ERC20PermitMockDeployer} from "script/deployers/ERC20PermitMockDeployer.s.sol";
import {PolygonDataCommitteeDeployer} from "script/deployers/PolygonDataCommitteeDeployer.s.sol";
import {PolygonRollupManagerEmptyMockDeployer} from "script/deployers/PolygonRollupManagerEmptyMockDeployer.s.sol";
import {PolygonZkEVMGlobalExitRootV2Deployer} from "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

import "@openzeppelin/contracts/utils/Strings.sol";
import "script/deployers/PolygonValidiumEtrogDeployer.s.sol";

contract PolygonValidiumEtrogTest is
    Test,
    ERC20PermitMockDeployer,
    PolygonDataCommitteeDeployer,
    PolygonRollupManagerEmptyMockDeployer,
    PolygonValidiumEtrogDeployer,
    PolygonZkEVMGlobalExitRootV2Deployer
{
    address admin = makeAddr("admin");
    address destinationAddress = makeAddr("destinationAddress");
    address proxyAdminOwner = makeAddr("proxyAdminOwner");
    address polTokenOwner = makeAddr("polTokenOwner");
    address trustedSequencer = makeAddr("trustedSequencer");
    address trustedAggregator = makeAddr("trustedAggregator");

    IPolygonZkEVMBridgeV2Extended polygonZkEVMBridge;
    IERC20Upgradeable pol;
    PolygonRollupManager polygonRollupManager;

    string constant tokenName = "Polygon";
    string constant tokenSymbol = "POL";
    uint256 constant tokenInitialBalance = 20_000_000 ether;

    string constant networkName = "zkevm";
    string constant sequencerURL = "http://zkevm-json-rpc:8123";

    uint256 constant tokenTransferAmount = 10 ether;

    uint256 public constant TIMESTAMP_RANGE = 36;

    bytes tokenMetaData = abi.encode(tokenName, tokenSymbol, tokenDecimals);

    uint64 constant FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days
    uint64 constant SIGNATURE_BYTES = 32 + 32 + 1;
    uint64 constant EFFECTIVE_PERCENTAGE_BYTES = 1;
    uint64 internal constant MAX_VERIFY_BATCHES = 1000;
    uint64 internal constant HALT_AGGREGATION_TIMEOUT = 1 weeks;

    uint32 networkIDMainnet = 0;
    uint32 networkIDRollup = 1;
    uint32 l1InfoRootIndex = 1;

    uint8 constant tokenDecimals = 18;
    uint8 constant LEAF_TYPE_MESSAGE = 1;
    bytes l2TxData = "0x123456";

    struct CommitteeMember {
        address addr;
        uint256 privateKey;
    }

    event SequenceBatches(uint64 indexed numBatch, bytes32 l1InfoRoot);
    event ForceBatch(
        uint64 indexed forceBatchNum,
        bytes32 lastGlobalExitRoot,
        address sequencer,
        bytes transactions
    );
    event SequenceForceBatches(uint64 indexed numBatch);
    event InitialSequenceBatches(
        bytes transactions,
        bytes32 lastGlobalExitRoot,
        address sequencer
    );
    event VerifyBatches(
        uint64 indexed numBatch,
        bytes32 stateRoot,
        address indexed aggregator
    );
    event RollbackBatches(
        uint64 indexed targetBatch,
        bytes32 accInputHashToRollback
    );
    event SetDataAvailabilityProtocol(address newDataAvailabilityProtocol);
    event SwitchSequenceWithDataAvailability();
    event SetTrustedSequencer(address newTrustedSequencer);
    event SetTrustedSequencerURL(string newTrustedSequencerURL);
    event SetForceBatchTimeout(uint64 newforceBatchTimeout);
    event SetForceBatchAddress(address newForceBatchAddress);
    event TransferAdminRole(address newPendingAdmin);
    event AcceptAdminRole(address newAdmin);
    event CommitteeUpdated(bytes32 committeeHash);

    function setUp() public {
        pol = IERC20Upgradeable(
            deployERC20PermitMockImplementation(
                tokenName,
                tokenSymbol,
                polTokenOwner,
                tokenInitialBalance
            )
        );

        IPolygonZkEVMBridgeV2Extended polygonZkEVMBridgeImplementation = IPolygonZkEVMBridgeV2Extended(
                _preDeployPolygonZkEVMBridgeV2()
            );
        polygonZkEVMBridge = IPolygonZkEVMBridgeV2Extended(
            _proxify(address(polygonZkEVMBridgeImplementation))
        );

        polygonRollupManager = PolygonRollupManager(
            deployPolygonRollupManagerEmptyMockImplementation()
        );

        deployPolygonZkEVMGlobalExitRootV2Transparent(
            proxyAdminOwner,
            address(polygonRollupManager),
            address(polygonZkEVMBridge)
        );

        polygonZkEVMBridge.initialize(
            networkIDMainnet,
            address(0),
            0,
            polygonZkEVMGlobalExitRootV2,
            address(polygonRollupManager),
            bytes("")
        );

        vm.prank(polTokenOwner);
        pol.transfer(trustedSequencer, 1_000 ether);

        polygonValidiumEtrog = PolygonValidiumEtrog(
            deployPolygonValidiumEtrogImplementation(
                polygonZkEVMGlobalExitRootV2,
                pol,
                IPolygonZkEVMBridgeV2(address(polygonZkEVMBridge)),
                polygonRollupManager
            )
        );

        deployPolygonDataCommitteeTransparent(proxyAdminOwner);
    }

    function testRevert_initialize_onlyRollupManager() public {
        vm.expectRevert(IPolygonZkEVMVEtrogErrors.OnlyRollupManager.selector);
        _initializePolygonValidiumEtrog();
    }

    function test_initialize() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        assertEq(polygonValidiumEtrog.admin(), admin);
        assertEq(polygonValidiumEtrog.trustedSequencer(), trustedSequencer);
        assertEq(polygonValidiumEtrog.trustedSequencerURL(), sequencerURL);
        assertEq(polygonValidiumEtrog.networkName(), networkName);
        assertEq(polygonValidiumEtrog.forceBatchTimeout(), FORCE_BATCH_TIMEOUT);
    }

    function testRevert_initialize_alreadyInitialized() public {
        vm.startPrank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        vm.expectRevert("Initializable: contract is already initialized");
        _initializePolygonValidiumEtrog();
        vm.stopPrank();
    }

    function testRevert_adminFunctions() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        bytes4 selector = IPolygonZkEVMErrors.OnlyAdmin.selector;

        vm.expectRevert(selector);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        vm.expectRevert(selector);
        polygonValidiumEtrog.setDataAvailabilityProtocol(polygonDataCommittee);

        vm.expectRevert(selector);
        polygonValidiumEtrog.setForceBatchTimeout(1);

        vm.expectRevert(selector);
        polygonValidiumEtrog.setTrustedSequencer(address(0));

        vm.expectRevert(selector);
        polygonValidiumEtrog.setTrustedSequencerURL("");

        vm.expectRevert(selector);
        polygonValidiumEtrog.transferAdminRole(address(0));

        vm.expectRevert(selector);
        polygonValidiumEtrog.setForceBatchAddress(address(0));

        vm.expectRevert(IPolygonZkEVMErrors.OnlyPendingAdmin.selector);
        polygonValidiumEtrog.acceptAdminRole();
    }

    function test_adminFunctions() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        vm.startPrank(admin);

        vm.expectEmit();
        emit SwitchSequenceWithDataAvailability();
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);
        assertEq(
            polygonValidiumEtrog.isSequenceWithDataAvailabilityAllowed(),
            true
        );

        vm.expectEmit();
        emit SetDataAvailabilityProtocol(address(polygonDataCommittee));
        polygonValidiumEtrog.setDataAvailabilityProtocol(polygonDataCommittee);
        assertEq(
            address(polygonValidiumEtrog.dataAvailabilityProtocol()),
            address(polygonDataCommittee)
        );

        vm.expectEmit();
        emit SetForceBatchTimeout(0);
        polygonValidiumEtrog.setForceBatchTimeout(0);
        assertEq(polygonValidiumEtrog.forceBatchTimeout(), 0);

        vm.expectEmit();
        emit SetTrustedSequencer(makeAddr("newTrustedSequencer"));
        polygonValidiumEtrog.setTrustedSequencer(
            makeAddr("newTrustedSequencer")
        );
        assertEq(
            polygonValidiumEtrog.trustedSequencer(),
            makeAddr("newTrustedSequencer")
        );

        vm.expectEmit();
        emit SetTrustedSequencerURL("http://zkevm-json-rpc:8145");
        polygonValidiumEtrog.setTrustedSequencerURL(
            "http://zkevm-json-rpc:8145"
        );
        assertEq(
            polygonValidiumEtrog.trustedSequencerURL(),
            "http://zkevm-json-rpc:8145"
        );

        vm.expectEmit();
        emit SetForceBatchAddress(makeAddr("newForceBatchAddress"));
        polygonValidiumEtrog.setForceBatchAddress(
            makeAddr("newForceBatchAddress")
        );
        assertEq(
            polygonValidiumEtrog.forceBatchAddress(),
            makeAddr("newForceBatchAddress")
        );

        address newAdmin = makeAddr("newAdmin");

        vm.expectEmit();
        emit TransferAdminRole(newAdmin);
        polygonValidiumEtrog.transferAdminRole(newAdmin);
        assertEq(polygonValidiumEtrog.pendingAdmin(), newAdmin);

        vm.stopPrank();

        vm.prank(newAdmin);
        vm.expectEmit();
        emit AcceptAdminRole(makeAddr("newAdmin"));
        polygonValidiumEtrog.acceptAdminRole();
        assertEq(polygonValidiumEtrog.admin(), newAdmin);
    }

    function testRevert_setForceBatch() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        bytes4 forceBatchNotAllowedSelector = IPolygonZkEVMErrors
            .ForceBatchNotAllowed
            .selector;

        vm.expectRevert(forceBatchNotAllowedSelector);
        polygonValidiumEtrog.forceBatch(bytes(""), 0);

        vm.expectRevert(forceBatchNotAllowedSelector);
        polygonValidiumEtrog.sequenceForceBatches(
            new PolygonRollupBaseEtrog.BatchData[](0)
        );

        vm.startPrank(admin);

        polygonValidiumEtrog.setForceBatchAddress(address(0));

        vm.expectRevert(
            IPolygonZkEVMVEtrogErrors.ForceBatchesDecentralized.selector
        );
        polygonValidiumEtrog.setForceBatchAddress(address(0));

        vm.stopPrank();
    }

    function testRevert_setForceBatchTimeout_invalidRangeForceBatchTimeout()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.startPrank(admin);
        vm.expectRevert(
            IPolygonZkEVMErrors.InvalidRangeForceBatchTimeout.selector
        );
        polygonValidiumEtrog.setForceBatchTimeout(HALT_AGGREGATION_TIMEOUT + 1);

        vm.expectRevert(
            IPolygonZkEVMErrors.InvalidRangeForceBatchTimeout.selector
        );
        polygonValidiumEtrog.setForceBatchTimeout(HALT_AGGREGATION_TIMEOUT);
        vm.stopPrank();
    }

    function testRevert_generateInitializeTransaction_hugeTokenMetadataNotSupported()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        bytes memory hugeTokenMetaData = new bytes(1_000_000); // huge data

        vm.expectRevert(
            IPolygonZkEVMVEtrogErrors.HugeTokenMetadataNotSupported.selector
        );
        polygonValidiumEtrog.generateInitializeTransaction(
            networkIDRollup,
            address(0),
            networkIDMainnet,
            hugeTokenMetaData
        );
    }

    function test_generateInitializeTransaction() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        uint64 timestamp = uint64(block.timestamp);
        bytes32 blockParentHash = blockhash(block.number - 1);
        bytes memory initialTx = polygonValidiumEtrog
            .generateInitializeTransaction(
                networkIDRollup,
                address(0),
                networkIDMainnet,
                bytes("")
            );

        bytes32 initExpectedAccInputHash = _calculateAccInputHash(
            bytes32(0),
            keccak256(initialTx),
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            timestamp,
            trustedSequencer,
            blockParentHash
        );
        assertEq(
            polygonValidiumEtrog.lastAccInputHash(),
            initExpectedAccInputHash
        );
    }

    function testRevert_sequenceBatches_sequenceWithDataAvailabilityNotAllowed()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);

        vm.expectRevert(
            IPolygonValidium.SequenceWithDataAvailabilityNotAllowed.selector
        );
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator
        );
    }

    function testRevert_sequenceBatches_onlyTrustedSequencer() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);

        vm.expectRevert(IPolygonZkEVMErrors.OnlyTrustedSequencer.selector);
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator
        );
    }

    function testRevert_sequenceBatches_sequenceZeroBatches() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](0); // Empty batchData

        vm.prank(trustedSequencer);
        vm.expectRevert(IPolygonZkEVMErrors.SequenceZeroBatches.selector);
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator
        );
    }

    function testRevert_sequenceBatches_exceedMaxVerifyBatches() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](
                MAX_VERIFY_BATCHES + 1
            ); // Exceed max verify batches

        vm.prank(trustedSequencer);
        vm.expectRevert(IPolygonZkEVMErrors.ExceedMaxVerifyBatches.selector);
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator
        );
    }

    function testRevert_sequenceBatches_maxTimestampSequenceInvalid() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);

        vm.prank(trustedSequencer);
        vm.expectRevert(
            IPolygonZkEVMVEtrogErrors.MaxTimestampSequenceInvalid.selector
        );
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp + TIMESTAMP_RANGE + 1), // Exceed max timestamp
            bytes32(0),
            trustedAggregator
        );
    }

    function testRevert_sequenceBatches_l1InfoRootIndexInvalid() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);

        vm.prank(trustedSequencer);
        vm.expectRevert(
            IPolygonZkEVMVEtrogErrors.L1InfoRootIndexInvalid.selector
        );
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            10, // Invalid l1InfoRootIndex
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator
        );
    }

    function testRevert_sequenceBatches_forcedDataDoesNotMatch() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);
        batchData[0] = PolygonRollupBaseEtrog.BatchData(
            l2TxData,
            bytes32(0),
            uint64(block.timestamp + 10), // forcedBatch timestamp provided but PolygonRollupBaseEtrog.forcedBatch mapping is empty
            bytes32(0)
        );

        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            tokenMetaData
        );

        bytes32 expectedAccInputHash = _calculateAccInputHash(
            polygonValidiumEtrog.lastAccInputHash(),
            keccak256(l2TxData),
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            uint64(block.timestamp + 10),
            trustedSequencer,
            bytes32(0)
        );

        vm.prank(trustedSequencer);
        vm.expectRevert(IPolygonZkEVMErrors.ForcedDataDoesNotMatch.selector);
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp + 10),
            expectedAccInputHash,
            trustedAggregator
        );
    }

    function testRevert_sequenceBatches_transactionsLengthAboveMax() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        bytes memory hugeData = new bytes(1_000_000); // huge data

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);
        batchData[0] = PolygonRollupBaseEtrog.BatchData(
            hugeData,
            bytes32(0),
            0,
            bytes32(0)
        );

        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            tokenMetaData
        );

        bytes32 expectedAccInputHash = _calculateAccInputHash(
            polygonValidiumEtrog.lastAccInputHash(),
            keccak256(hugeData),
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            uint64(block.timestamp + 10),
            trustedSequencer,
            bytes32(0)
        );

        vm.prank(trustedSequencer);
        vm.expectRevert(
            IPolygonZkEVMErrors.TransactionsLengthAboveMax.selector
        );
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp + 10),
            expectedAccInputHash,
            trustedAggregator
        );
    }

    function test_sequenceBatches() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);
        batchData[0] = PolygonRollupBaseEtrog.BatchData(
            l2TxData,
            bytes32(0),
            0,
            bytes32(0)
        );

        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            tokenMetaData
        );

        uint256 currentTime = block.timestamp;
        bytes32 l1InfoRootHash = polygonZkEVMGlobalExitRootV2.l1InfoRootMap(
            l1InfoRootIndex
        );
        bytes32 expectedAccInputHash = _calculateAccInputHash(
            polygonValidiumEtrog.lastAccInputHash(),
            keccak256(l2TxData),
            l1InfoRootHash,
            uint64(currentTime),
            trustedSequencer,
            bytes32(0)
        );

        vm.startPrank(trustedSequencer);
        pol.approve(address(polygonValidiumEtrog), 100);

        vm.expectEmit();
        emit SequenceBatches(2, l1InfoRootHash);
        polygonValidiumEtrog.sequenceBatches(
            batchData,
            l1InfoRootIndex,
            uint64(currentTime),
            expectedAccInputHash,
            trustedSequencer
        );
        vm.stopPrank();
    }

    function testRevert_forceBatch_forceBatchNotAllowed() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.expectRevert(IPolygonZkEVMErrors.ForceBatchNotAllowed.selector);
        polygonValidiumEtrog.forceBatch(bytes(""), 0);
    }

    function testRevert_forceBatch_forceBatchesNotAllowedOnEmergencyState()
        public
    {
        vm.startPrank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        polygonRollupManager.activateEmergencyState();
        vm.stopPrank();

        vm.prank(admin);
        vm.expectRevert(
            IPolygonZkEVMVEtrogErrors
                .ForceBatchesNotAllowedOnEmergencyState
                .selector
        );
        polygonValidiumEtrog.forceBatch(bytes(""), 0);
    }

    function testRevert_forceBatch_notEnoughPOLAmount() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        vm.expectRevert(IPolygonZkEVMVEtrogErrors.NotEnoughPOLAmount.selector);
        polygonValidiumEtrog.forceBatch(bytes(""), 0);
    }

    function testRevert_forceBatch_transactionsLengthAboveMax() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        bytes memory hugeData = new bytes(1_000_000); // huge data

        vm.prank(admin);
        vm.expectRevert(
            IPolygonZkEVMErrors.TransactionsLengthAboveMax.selector
        );
        polygonValidiumEtrog.forceBatch(hugeData, tokenTransferAmount);
    }

    function test_forceBatch() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        uint64 lastForcedBatch = 1;

        vm.prank(polTokenOwner);
        pol.transfer(admin, 1_000);

        vm.startPrank(admin);
        pol.approve(address(polygonValidiumEtrog), tokenTransferAmount);

        vm.expectEmit();
        emit ForceBatch(
            lastForcedBatch,
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            admin,
            l2TxData
        );
        polygonValidiumEtrog.forceBatch(l2TxData, tokenTransferAmount);
        vm.stopPrank();

        assertEq(
            polygonValidiumEtrog.calculatePolPerForceBatch(),
            polygonRollupManager.getForcedBatchFee()
        );
    }

    function test_forceBatch_sendFromContract() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        SendData sendData = new SendData();
        vm.prank(polTokenOwner);
        pol.transfer(address(sendData), 1_000);

        bytes memory approveData = abi.encodeWithSelector(
            pol.approve.selector,
            address(polygonValidiumEtrog),
            tokenTransferAmount
        );
        sendData.sendData(address(pol), approveData);

        vm.expectEmit();
        emit SetForceBatchAddress(address(sendData));
        vm.prank(admin);
        polygonValidiumEtrog.setForceBatchAddress(address(sendData));

        uint64 lastForcedBatch = polygonValidiumEtrog.lastForceBatch() + 1; // checks increment
        bytes32 globalExitRoot = polygonZkEVMGlobalExitRootV2
            .getLastGlobalExitRoot();

        bytes memory forceBatchData = abi.encodeWithSelector(
            polygonValidiumEtrog.forceBatch.selector,
            l2TxData,
            tokenTransferAmount
        );
        vm.expectEmit();
        emit ForceBatch(
            lastForcedBatch,
            globalExitRoot,
            address(sendData),
            l2TxData
        );
        sendData.sendData(address(polygonValidiumEtrog), forceBatchData);

        assertEq(
            polygonValidiumEtrog.calculatePolPerForceBatch(),
            polygonRollupManager.getForcedBatchFee()
        );
    }

    function testRevert_sequenceForceBatches_haltTimeoutNotExpiredAfterEmergencyState()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);

        vm.prank(admin);
        vm.expectRevert(
            IPolygonZkEVMVEtrogErrors
                .HaltTimeoutNotExpiredAfterEmergencyState
                .selector
        );
        polygonValidiumEtrog.sequenceForceBatches(batchData);
    }

    function testRevert_sequenceForceBatches_sequenceZeroBatches() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        skip(1 weeks);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](0); // Empty batchData

        vm.prank(admin);
        vm.expectRevert(IPolygonZkEVMErrors.SequenceZeroBatches.selector);
        polygonValidiumEtrog.sequenceForceBatches(batchData);
    }

    function testRevert_sequenceForceBatches_exceedMaxVerifyBatches() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        skip(1 weeks);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](
                MAX_VERIFY_BATCHES + 1
            ); // Exceed max verify batches

        vm.prank(admin);
        vm.expectRevert(IPolygonZkEVMErrors.ExceedMaxVerifyBatches.selector);
        polygonValidiumEtrog.sequenceForceBatches(batchData);
    }

    function testRevert_sequenceForceBatches_forceBatchesOverflow() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        skip(1 weeks);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchData = new PolygonRollupBaseEtrog.BatchData[](1);

        vm.prank(admin);
        vm.expectRevert(IPolygonZkEVMErrors.ForceBatchesOverflow.selector);
        polygonValidiumEtrog.sequenceForceBatches(batchData);
    }

    function testRevert_sequenceForceBatches_forcedDataDoesNotMatch() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        skip(1 weeks);

        vm.prank(polTokenOwner);
        pol.transfer(admin, 1_000);

        vm.startPrank(admin);
        pol.approve(address(polygonValidiumEtrog), 100);
        polygonValidiumEtrog.forceBatch(l2TxData, tokenTransferAmount);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchDataArray = new PolygonRollupBaseEtrog.BatchData[](1);
        batchDataArray[0] = PolygonRollupBaseEtrog.BatchData(
            bytes(""),
            bytes32("Random"),
            1000,
            bytes32(0)
        );

        vm.expectRevert(IPolygonZkEVMErrors.ForcedDataDoesNotMatch.selector);
        polygonValidiumEtrog.sequenceForceBatches(batchDataArray);
        vm.stopPrank();
    }

    function testRevert_sequenceForceBatches_forceBatchTimeoutNotExpired()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        skip(1 weeks);

        vm.prank(polTokenOwner);
        pol.transfer(admin, 1_000);

        bytes32 lastGlobalExitRoot = polygonZkEVMGlobalExitRootV2
            .getLastGlobalExitRoot();

        vm.startPrank(admin);
        pol.approve(address(polygonValidiumEtrog), 100);
        polygonValidiumEtrog.forceBatch(l2TxData, tokenTransferAmount);

        uint64 currentTime = uint64(block.timestamp);
        bytes32 parentHash = blockhash(block.number - 1);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchDataArray = new PolygonRollupBaseEtrog.BatchData[](1);
        batchDataArray[0] = PolygonRollupBaseEtrog.BatchData(
            l2TxData,
            lastGlobalExitRoot,
            currentTime,
            parentHash
        );

        vm.expectRevert(
            IPolygonZkEVMErrors.ForceBatchTimeoutNotExpired.selector
        );
        polygonValidiumEtrog.sequenceForceBatches(batchDataArray);
        vm.stopPrank();
    }

    function test_sequenceForceBatches() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();
        skip(1 weeks);

        vm.prank(polTokenOwner);
        pol.transfer(admin, 1_000);

        bytes32 lastGlobalExitRoot = polygonZkEVMGlobalExitRootV2
            .getLastGlobalExitRoot();

        vm.startPrank(admin);
        pol.approve(address(polygonValidiumEtrog), 100);
        polygonValidiumEtrog.forceBatch(l2TxData, tokenTransferAmount);

        uint64 currentTime = uint64(block.timestamp);
        bytes32 parentHash = blockhash(block.number - 1);

        PolygonRollupBaseEtrog.BatchData[]
            memory batchDataArray = new PolygonRollupBaseEtrog.BatchData[](1);
        batchDataArray[0] = PolygonRollupBaseEtrog.BatchData(
            l2TxData,
            lastGlobalExitRoot,
            currentTime,
            parentHash
        );

        skip(FORCE_BATCH_TIMEOUT);
        uint64 expectedBatchNum = polygonValidiumEtrog.lastForceBatch() + 1;
        bytes32 lastAccInputHash = polygonValidiumEtrog.lastAccInputHash();

        vm.expectEmit();
        emit SequenceForceBatches(expectedBatchNum);
        polygonValidiumEtrog.sequenceForceBatches(batchDataArray);

        bytes32 expectedAccInputHash = _calculateAccInputHash(
            lastAccInputHash,
            keccak256(l2TxData),
            lastGlobalExitRoot,
            currentTime,
            admin,
            parentHash
        );
        assertEq(polygonValidiumEtrog.lastAccInputHash(), expectedAccInputHash);
        vm.stopPrank();
    }

    function testRevert_onVerifyBatches_onlyRollupManager() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.expectRevert(IPolygonZkEVMVEtrogErrors.OnlyRollupManager.selector);
        polygonValidiumEtrog.onVerifyBatches(0, bytes32(0), trustedAggregator);
    }

    function testRevert_switchSequenceWithDataAvailability_switchToSameValue()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        vm.expectRevert(IPolygonValidium.SwitchToSameValue.selector);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(false);
    }

    function testRevert_sequenceBatchesValidium_onlyTrustedSequencer() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        PolygonValidiumEtrog.ValidiumBatchData[]
            memory batchData = new PolygonValidiumEtrog.ValidiumBatchData[](1);

        vm.expectRevert(IPolygonZkEVMErrors.OnlyTrustedSequencer.selector);
        polygonValidiumEtrog.sequenceBatchesValidium(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator,
            bytes("")
        );
    }

    function testRevert_sequenceBatchesValidium_sequenceZeroBatches() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonValidiumEtrog.ValidiumBatchData[]
            memory batchData = new PolygonValidiumEtrog.ValidiumBatchData[](0); // Empty batchData

        vm.prank(trustedSequencer);
        vm.expectRevert(IPolygonZkEVMErrors.SequenceZeroBatches.selector);
        polygonValidiumEtrog.sequenceBatchesValidium(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator,
            bytes("")
        );
    }

    function testRevert_sequenceBatchesValidium_exceedMaxVerifyBatches()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonValidiumEtrog.ValidiumBatchData[]
            memory batchData = new PolygonValidiumEtrog.ValidiumBatchData[](
                MAX_VERIFY_BATCHES + 1
            ); // Exceed max verify batches

        vm.prank(trustedSequencer);
        vm.expectRevert(IPolygonZkEVMErrors.ExceedMaxVerifyBatches.selector);
        polygonValidiumEtrog.sequenceBatchesValidium(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator,
            bytes("")
        );
    }

    function testRevert_sequenceBatchesValidium_maxTimestampSequenceInvalid()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonValidiumEtrog.ValidiumBatchData[]
            memory batchData = new PolygonValidiumEtrog.ValidiumBatchData[](1);

        vm.prank(trustedSequencer);
        vm.expectRevert(
            IPolygonZkEVMVEtrogErrors.MaxTimestampSequenceInvalid.selector
        );
        polygonValidiumEtrog.sequenceBatchesValidium(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp + TIMESTAMP_RANGE + 1), // Exceed max timestamp
            bytes32(0),
            trustedAggregator,
            bytes("")
        );
    }

    function testRevert_sequenceBatchesValidium_l1InfoRootIndexInvalid()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonValidiumEtrog.ValidiumBatchData[]
            memory batchData = new PolygonValidiumEtrog.ValidiumBatchData[](1);

        vm.prank(trustedSequencer);
        vm.expectRevert(
            IPolygonZkEVMVEtrogErrors.L1InfoRootIndexInvalid.selector
        );
        polygonValidiumEtrog.sequenceBatchesValidium(
            batchData,
            10, // Invalid l1InfoRootIndex
            uint64(block.timestamp),
            bytes32(0),
            trustedAggregator,
            bytes("")
        );
    }

    function testRevert_sequenceBatchesValidium_forcedDataDoesNotMatch()
        public
    {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.prank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);

        PolygonValidiumEtrog.ValidiumBatchData[]
            memory batchData = new PolygonValidiumEtrog.ValidiumBatchData[](1);
        batchData[0] = PolygonValidiumEtrog.ValidiumBatchData(
            keccak256(l2TxData),
            bytes32(0),
            uint64(block.timestamp + 10), // forcedBatch timestamp provided but PolygonRollupBaseEtrog.forcedBatch mapping is empty
            bytes32(0)
        );

        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            tokenMetaData
        );

        bytes32 expectedAccInputHash = _calculateAccInputHash(
            polygonValidiumEtrog.lastAccInputHash(),
            keccak256(l2TxData),
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            uint64(block.timestamp + 10),
            trustedSequencer,
            bytes32(0)
        );

        vm.prank(trustedSequencer);
        vm.expectRevert(IPolygonZkEVMErrors.ForcedDataDoesNotMatch.selector);
        polygonValidiumEtrog.sequenceBatchesValidium(
            batchData,
            l1InfoRootIndex,
            uint64(block.timestamp + 10),
            expectedAccInputHash,
            trustedAggregator,
            bytes("")
        );
    }

    function testRevert_sequenceBatchesValidium() public {
        vm.prank(address(polygonRollupManager));
        _initializePolygonValidiumEtrog();

        vm.startPrank(admin);
        polygonValidiumEtrog.switchSequenceWithDataAvailability(true);
        polygonValidiumEtrog.setDataAvailabilityProtocol(polygonDataCommittee);
        vm.stopPrank();

        PolygonValidiumEtrog.ValidiumBatchData[]
            memory batchData = new PolygonValidiumEtrog.ValidiumBatchData[](1);
        batchData[0] = PolygonValidiumEtrog.ValidiumBatchData(
            keccak256(l2TxData),
            bytes32(0),
            0,
            bytes32(0)
        );

        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            tokenMetaData
        );

        uint64 currentTime = uint64(block.timestamp);

        uint256 numberOfCommitteeMembers = 3;
        (
            CommitteeMember[] memory committeeMembers,
            bytes memory committeeMemberAddrBytes,
            string[] memory committeeMemberUrls
        ) = _generateCommitteeMembers(numberOfCommitteeMembers);

        bytes32 expectedAccInputHash = _calculateAccInputHash(
            polygonValidiumEtrog.lastAccInputHash(),
            keccak256(l2TxData),
            polygonZkEVMGlobalExitRootV2.getRoot(),
            currentTime,
            trustedSequencer,
            bytes32(0)
        );

        bytes memory aggrSig = _signAndGetAggregatedSig(
            committeeMembers,
            expectedAccInputHash
        );

        address committeeOwner = polygonDataCommittee.owner();
        vm.expectEmit();
        emit CommitteeUpdated(keccak256(committeeMemberAddrBytes));
        vm.prank(committeeOwner);
        polygonDataCommittee.setupCommittee(
            numberOfCommitteeMembers,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );

        bytes memory dataAvailabilityMessage = abi.encodePacked(
            aggrSig,
            committeeMemberAddrBytes
        );

        vm.startPrank(trustedSequencer);
        pol.approve(address(polygonValidiumEtrog), 100);
        polygonValidiumEtrog.sequenceBatchesValidium(
            batchData,
            l1InfoRootIndex,
            currentTime,
            expectedAccInputHash,
            trustedSequencer,
            dataAvailabilityMessage
        );
        vm.stopPrank();
        assertEq(polygonValidiumEtrog.lastAccInputHash(), expectedAccInputHash);
    }

    function _initializePolygonValidiumEtrog() internal {
        polygonValidiumEtrog.initialize(
            admin,
            trustedSequencer,
            networkIDRollup,
            address(0),
            sequencerURL,
            networkName
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

    function _calculateAccInputHash(
        bytes32 oldAccInputHash,
        bytes32 batchHashData,
        bytes32 globalExitRoot,
        uint64 timestamp,
        address sequencerAddress,
        bytes32 forcedBlockHash
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    oldAccInputHash,
                    batchHashData,
                    globalExitRoot,
                    timestamp,
                    sequencerAddress,
                    forcedBlockHash
                )
            );
    }

    function _generateCommitteeMembers(
        uint256 numOfMembers
    )
        internal
        returns (CommitteeMember[] memory, bytes memory, string[] memory)
    {
        CommitteeMember[] memory committeeMembers = new CommitteeMember[](
            numOfMembers
        );
        bytes memory committeeMemberAddrBytes = new bytes(0);
        string[] memory committeeMemberUrls = new string[](
            committeeMembers.length
        );
        for (uint256 i = 0; i < numOfMembers; i++) {
            Account memory memberAccount = makeAccount(
                string.concat("committeeMember", Strings.toString(i))
            );
            committeeMembers[i] = CommitteeMember(
                memberAccount.addr,
                memberAccount.key
            );
        }

        committeeMembers = _sortMembersByIncrementingAddresses(
            committeeMembers
        );

        for (uint256 i = 0; i < committeeMembers.length; i++) {
            committeeMemberAddrBytes = abi.encodePacked(
                committeeMemberAddrBytes,
                committeeMembers[i].addr
            );
            committeeMemberUrls[i] = string.concat(
                "http://committeeMember",
                Strings.toString(i),
                ".com"
            );
        }

        return (
            committeeMembers,
            committeeMemberAddrBytes,
            committeeMemberUrls
        );
    }

    function _sortMembersByIncrementingAddresses(
        CommitteeMember[] memory committeeMembers
    ) internal pure returns (CommitteeMember[] memory) {
        uint256 n = committeeMembers.length;
        bool swapped;

        do {
            swapped = false;
            for (uint256 i = 0; i < n - 1; i++) {
                if (committeeMembers[i].addr > committeeMembers[i + 1].addr) {
                    CommitteeMember memory temp = committeeMembers[i];
                    committeeMembers[i] = committeeMembers[i + 1];
                    committeeMembers[i + 1] = temp;

                    swapped = true;
                }
            }
            n--;
        } while (swapped);

        return committeeMembers;
    }

    function _signAndGetAggregatedSig(
        CommitteeMember[] memory committeeMembers,
        bytes32 inputHash
    ) internal pure returns (bytes memory) {
        bytes memory aggrSig = bytes("");
        for (uint256 i = 0; i < committeeMembers.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(
                committeeMembers[i].privateKey,
                inputHash
            );
            bytes memory signature = abi.encodePacked(r, s, v);
            aggrSig = abi.encodePacked(aggrSig, signature);
        }
        return aggrSig;
    }
}

contract SendData {
    function sendData(address destination, bytes memory data) public {
        (bool success, ) = destination.call(data);
        require(success, "SendData: failed to send data");
    }
}
