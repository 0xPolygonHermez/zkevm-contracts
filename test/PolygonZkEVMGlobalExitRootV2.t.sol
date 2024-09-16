// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "test/util/TestHelpers.sol";

import {ZkEVMCommon} from "test/util/ZkEVMCommon.sol";

import "contracts/interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";

import "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract PolygonZkEVMGlobalExitRootV2Test is
    Test,
    TestHelpers,
    ZkEVMCommon,
    PolygonZkEVMGlobalExitRootV2Deployer
{
    address rollupManager = makeAddr("rollupManager");
    address polygonZkEVMBridge = makeAddr("polygonZkEVMBridge");
    address polygonZkEVMGlobalExitRootV2ProxyOwner =
        makeAddr("polygonZkEVMGlobalExitRootV2ProxyOwner");

    event UpdateL1InfoTree(
        bytes32 indexed mainnetExitRoot,
        bytes32 indexed rollupExitRoot
    );

    event UpdateL1InfoTreeV2(
        bytes32 currentL1InfoRoot,
        uint32 indexed leafCount,
        uint256 blockhash,
        uint64 minTimestamp
    );

    function setUp() public {
        deployPolygonZkEVMGlobalExitRootV2Transparent(
            polygonZkEVMGlobalExitRootV2ProxyOwner,
            rollupManager,
            polygonZkEVMBridge
        );
    }

    function test_initialize() public view {
        assertEq(polygonZkEVMGlobalExitRootV2.rollupManager(), rollupManager);
        assertEq(
            polygonZkEVMGlobalExitRootV2.bridgeAddress(),
            polygonZkEVMBridge
        );
        bytes32 zeroHash = bytes32(0);
        assertEq(polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(), zeroHash);
        assertEq(polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(), zeroHash);
    }

    function testRevert_initialize_reinitialize() public {
        vm.expectRevert("Initializable: contract is already initialized");
        polygonZkEVMGlobalExitRootV2.initialize();
    }

    function testRevert_updateExitRoot_onlyAllowedContracts() public {
        bytes32 newRoot = keccak256(abi.encode("newRoot"));
        vm.expectRevert(
            IBasePolygonZkEVMGlobalExitRoot.OnlyAllowedContracts.selector
        );
        polygonZkEVMGlobalExitRootV2.updateExitRoot(newRoot);
    }

    function test_updateExitRoot_asBridge() public {
        bytes32 newRootBridge = keccak256(abi.encode("newRootBridge"));

        vm.recordLogs();

        vm.prank(polygonZkEVMBridge);
        polygonZkEVMGlobalExitRootV2.updateExitRoot(newRootBridge);
        bytes32 currentL1InfoRoot = polygonZkEVMGlobalExitRootV2.getRoot();
        uint256 leafCount = polygonZkEVMGlobalExitRootV2.depositCount();

        Vm.Log[] memory entries = vm.getRecordedLogs();
        assertEq(entries.length, 2);

        assertEq(entries[0].topics.length, 3);
        assertEq(entries[0].topics[0], UpdateL1InfoTree.selector);
        assertEq(entries[0].topics[1], newRootBridge);
        assertEq(entries[0].topics[2], bytes32(0));

        assertEq(entries[1].topics.length, 2);
        assertEq(entries[1].topics[0], UpdateL1InfoTreeV2.selector);
        assertEq(entries[1].topics[1], bytes32(leafCount));
        (
            bytes32 eventCurrentL1InfoRoot,
            uint256 eventBlockhash,
            uint64 eventminTimestamp
        ) = abi.decode(entries[1].data, (bytes32, uint256, uint64));
        assertEq(eventCurrentL1InfoRoot, currentL1InfoRoot);
        assertEq(eventBlockhash, uint256(blockhash(block.number - 1)));
        assertEq(eventminTimestamp, uint64(block.timestamp));

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            newRootBridge
        );
        assertEq(polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(), bytes32(0));

        bytes32 expectedGlobalExitRoot = calculateGlobalExitRoot(
            newRootBridge,
            bytes32(0)
        );
        assertEq(
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            expectedGlobalExitRoot
        );
    }

    function test_updateExitRoot_asRollupManager() public {
        bytes32 newRootRollup = keccak256(abi.encode("newRootRollup"));

        vm.recordLogs();

        vm.prank(rollupManager);
        polygonZkEVMGlobalExitRootV2.updateExitRoot(newRootRollup);
        bytes32 currentL1InfoRoot = polygonZkEVMGlobalExitRootV2.getRoot();
        uint256 leafCount = polygonZkEVMGlobalExitRootV2.depositCount();

        Vm.Log[] memory entries = vm.getRecordedLogs();
        assertEq(entries.length, 2);
        assertEq(entries[0].topics.length, 3);
        assertEq(entries[0].topics[0], UpdateL1InfoTree.selector);
        assertEq(entries[0].topics[1], bytes32(0));
        assertEq(entries[0].topics[2], newRootRollup);

        assertEq(entries[1].topics.length, 2);
        assertEq(entries[1].topics[0], UpdateL1InfoTreeV2.selector);
        assertEq(entries[1].topics[1], bytes32(leafCount));
        (
            bytes32 eventCurrentL1InfoRoot,
            uint256 eventBlockhash,
            uint64 eventminTimestamp
        ) = abi.decode(entries[1].data, (bytes32, uint256, uint64));
        assertEq(eventCurrentL1InfoRoot, currentL1InfoRoot);
        assertEq(eventBlockhash, uint256(blockhash(block.number - 1)));
        assertEq(eventminTimestamp, uint64(block.timestamp));
        
        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            bytes32(0)
        );
        assertEq(
            polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
            newRootRollup
        );

        bytes32 expectedGlobalExitRoot = calculateGlobalExitRoot(
            bytes32(0),
            newRootRollup
        );
        assertEq(
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            expectedGlobalExitRoot
        );
    }

    function calculateGlobalExitRoot(
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(mainnetExitRoot, rollupExitRoot));
    }
}
