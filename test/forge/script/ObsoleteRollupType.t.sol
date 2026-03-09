// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {ObsoleteRollupType} from "script/forge/obsolete-rollup-type/ObsoleteRollupType.s.sol";
import {AgglayerManager} from "contracts/AgglayerManager.sol";

/**
 * @notice Interface for TimelockController functions
 */
interface ITimelockController {
    function scheduleBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) external;

    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt
    ) external payable;
}

/**
 * @title ObsoleteRollupTypeTest
 * @notice Fork tests for the ObsoleteRollupType script
 * @dev Tests all combinations of modes (inclusion, exclusion, purge) and types (Multisig, Timelock)
 */
contract ObsoleteRollupTypeTest is Test {
    ObsoleteRollupType public script;

    // Mainnet addresses
    address constant MAINNET_AGGLAYER_MANAGER = 0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2;
    address constant MAINNET_MULTISEND_CALLONLY = 0x40A2aCCbd92BCA938b02010E17A5b8929b49130D;

    // Fork configuration
    uint256 mainnetFork;

    function setUp() public {
        // Create mainnet fork
        mainnetFork = vm.createSelectFork("ethereum", 23848426);

        // Deploy script
        script = new ObsoleteRollupType();
    }
    /**
     * @notice Helper function to build JSON input
     */

    function _buildJsonInput(
        string memory mode,
        string memory txType,
        uint256[] memory list,
        uint256 timelockDelay,
        bytes32 timelockSalt
    ) internal view returns (string memory) {
        string memory json = string(abi.encodePacked('{"', vm.toString(block.chainid), '":{'));

        json = string(abi.encodePacked(json, '"agglayerManager":"', vm.toString(MAINNET_AGGLAYER_MANAGER), '",'));

        json = string(abi.encodePacked(json, '"mode":"', mode, '",'));

        json = string(abi.encodePacked(json, '"type":"', txType, '",'));

        if (list.length > 0) {
            json = string(abi.encodePacked(json, '"list":['));
            for (uint256 i = 0; i < list.length; i++) {
                if (i > 0) {
                    json = string(abi.encodePacked(json, ","));
                }
                json = string(abi.encodePacked(json, vm.toString(list[i])));
            }
            json = string(abi.encodePacked(json, "],"));
        }

        if (keccak256(bytes(txType)) == keccak256(bytes("Timelock"))) {
            json = string(abi.encodePacked(json, '"timelockDelay":', vm.toString(timelockDelay), ","));

            json = string(abi.encodePacked(json, '"timelockSalt":"', vm.toString(timelockSalt), '",'));
        }

        json =
            string(abi.encodePacked(json, '"multiSendCallOnlyAddress":"', vm.toString(MAINNET_MULTISEND_CALLONLY), '"'));

        json = string(abi.encodePacked(json, "}}"));

        return json;
    }

    // ========================= INCLUSION MODE TESTS =========================

    function test_InclusionMode_Multisig_SingleRollupType() public {
        uint256[] memory list = new uint256[](1);
        list[0] = 1;

        string memory input = _buildJsonInput("inclusion", "Multisig", list, 0, bytes32(0));

        bytes[] memory result = script.run(input);

        assertEq(result.length, 1, "Should return 1 calldata");
        assertTrue(result[0].length > 0, "Calldata should not be empty");

        // Verify it's a simple obsoleteRollupType call
        bytes4 selector = bytes4(result[0]);
        assertEq(selector, AgglayerManager.obsoleteRollupType.selector, "Should be obsoleteRollupType selector");
    }

    function test_InclusionMode_Multisig_MultipleRollupTypes() public {
        uint256[] memory list = new uint256[](2);
        list[0] = 1;
        list[1] = 2;

        string memory input = _buildJsonInput("inclusion", "Multisig", list, 0, bytes32(0));

        bytes[] memory result = script.run(input);

        assertEq(result.length, 1, "Should return 1 calldata");
        assertTrue(result[0].length > 0, "Calldata should not be empty");

        // MultiSendCallOnly encoding should be longer than a simple call
        assertTrue(result[0].length > 100, "MultiSendCallOnly calldata should be substantial");
    }

    function test_InclusionMode_Timelock_SingleRollupType() public {
        uint256[] memory list = new uint256[](1);
        list[0] = 1;

        string memory input = _buildJsonInput("inclusion", "Timelock", list, 86400, bytes32(uint256(1)));

        bytes[] memory result = script.run(input);

        assertEq(result.length, 2, "Should return 2 calldatas (schedule + execute)");
        assertTrue(result[0].length > 0, "Schedule calldata should not be empty");
        assertTrue(result[1].length > 0, "Execute calldata should not be empty");

        // Verify selectors
        bytes4 scheduleSelector = bytes4(result[0]);
        bytes4 executeSelector = bytes4(result[1]);
        assertEq(scheduleSelector, ITimelockController.scheduleBatch.selector, "Should be scheduleBatch");
        assertEq(executeSelector, ITimelockController.executeBatch.selector, "Should be executeBatch");
    }

    function test_InclusionMode_Timelock_MultipleRollupTypes() public {
        uint256[] memory list = new uint256[](3);
        list[0] = 1;
        list[1] = 2;
        list[2] = 3;

        string memory input = _buildJsonInput("inclusion", "Timelock", list, 86400, bytes32(uint256(42)));

        bytes[] memory result = script.run(input);

        assertEq(result.length, 2, "Should return 2 calldatas (schedule + execute)");
        assertTrue(result[0].length > 0, "Schedule calldata should not be empty");
        assertTrue(result[1].length > 0, "Execute calldata should not be empty");
    }

    // ========================= EXCLUSION MODE TESTS =========================

    function test_ExclusionMode_Multisig() public {
        uint256[] memory list = new uint256[](1);
        list[0] = 1; // Exclude rollup type 1

        string memory input = _buildJsonInput("exclusion", "Multisig", list, 0, bytes32(0));

        bytes[] memory result = script.run(input);

        assertEq(result.length, 1, "Should return 1 calldata");
        assertTrue(result[0].length > 0, "Calldata should not be empty");
    }

    function test_ExclusionMode_Timelock() public {
        uint256[] memory list = new uint256[](2);
        list[0] = 1; // Exclude rollup type 1
        list[1] = 2; // Exclude rollup type 2

        string memory input = _buildJsonInput("exclusion", "Timelock", list, 172800, bytes32(uint256(99)));

        bytes[] memory result = script.run(input);

        assertEq(result.length, 2, "Should return 2 calldatas (schedule + execute)");
        assertTrue(result[0].length > 0, "Schedule calldata should not be empty");
        assertTrue(result[1].length > 0, "Execute calldata should not be empty");
    }

    // ========================= PURGE MODE TESTS =========================

    function test_PurgeMode_Multisig() public {
        uint256[] memory emptyList = new uint256[](0);

        string memory input = _buildJsonInput("purge", "Multisig", emptyList, 0, bytes32(0));

        bytes[] memory result = script.run(input);

        // Result might be empty if no unused types exist
        assertEq(result.length, 1, "Should return 1 calldata");
    }

    function test_PurgeMode_Timelock() public {
        uint256[] memory emptyList = new uint256[](0);

        string memory input = _buildJsonInput("purge", "Timelock", emptyList, 259200, bytes32(uint256(123)));

        bytes[] memory result = script.run(input);

        assertEq(result.length, 2, "Should return 2 calldatas (schedule + execute)");
    }

    // ========================= VALIDATION TESTS =========================

    function test_RevertWhen_InvalidMode() public {
        uint256[] memory list = new uint256[](1);
        list[0] = 1;

        string memory json = string(abi.encodePacked('{"', vm.toString(block.chainid), '":{'));

        json = string(abi.encodePacked(json, '"agglayerManager":"', vm.toString(MAINNET_AGGLAYER_MANAGER), '",'));

        json = string(abi.encodePacked(json, '"mode":"invalid",'));

        json = string(abi.encodePacked(json, '"type":"Multisig",'));

        json = string(abi.encodePacked(json, '"list":[1]'));

        json = string(abi.encodePacked(json, "}}"));

        vm.expectRevert("Invalid mode: must be inclusion, exclusion, or purge");
        script.run(json);
    }

    function test_RevertWhen_InvalidType() public {
        uint256[] memory list = new uint256[](1);
        list[0] = 1;

        string memory json = string(abi.encodePacked('{"', vm.toString(block.chainid), '":{'));

        json = string(abi.encodePacked(json, '"agglayerManager":"', vm.toString(MAINNET_AGGLAYER_MANAGER), '",'));

        json = string(abi.encodePacked(json, '"mode":"inclusion",'));

        json = string(abi.encodePacked(json, '"type":"Invalid",'));

        json = string(abi.encodePacked(json, '"list":[1]'));

        json = string(abi.encodePacked(json, "}}"));

        vm.expectRevert("Invalid type: must be Multisig or Timelock");
        script.run(json);
    }

    function test_RevertWhen_InclusionMode_EmptyList() public {
        uint256[] memory emptyList = new uint256[](0);

        string memory input = _buildJsonInput("inclusion", "Multisig", emptyList, 0, bytes32(0));

        vm.expectRevert("Inclusion mode requires a non-empty list");
        script.run(input);
    }

    function test_RevertWhen_ExclusionMode_EmptyList() public {
        uint256[] memory emptyList = new uint256[](0);

        string memory input = _buildJsonInput("exclusion", "Multisig", emptyList, 0, bytes32(0));

        vm.expectRevert("Exclusion mode requires a non-empty list");
        script.run(input);
    }

    // ========================= INTEGRATION TESTS =========================

    function test_Integration_FullWorkflow_InclusionMode_Multisig() public {
        // This test demonstrates the full workflow from generating calldata to verifying it
        uint256[] memory list = new uint256[](1);
        list[0] = 1;

        string memory input = _buildJsonInput("inclusion", "Multisig", list, 0, bytes32(0));

        // Generate calldata
        bytes[] memory result = script.run(input);

        // Verify structure
        assertEq(result.length, 1, "Should return 1 calldata");

        // Decode and verify parameters
        bytes4 selector = bytes4(result[0]);
        assertEq(selector, AgglayerManager.obsoleteRollupType.selector, "Should be obsoleteRollupType");

        // Extract rollup type ID from calldata
        uint32 rollupTypeID = abi.decode(sliceBytes(result[0], 4), (uint32));
        assertEq(rollupTypeID, 1, "Should obsolete rollup type 1");
    }

    function test_Integration_FullWorkflow_InclusionMode_Timelock() public {
        uint256[] memory list = new uint256[](2);
        list[0] = 1;
        list[1] = 2;

        string memory input = _buildJsonInput("inclusion", "Timelock", list, 86400, bytes32(uint256(1)));

        // Generate calldata
        bytes[] memory result = script.run(input);

        // Verify structure
        assertEq(result.length, 2, "Should return 2 calldatas");

        // Verify schedule calldata
        bytes4 scheduleSelector = bytes4(result[0]);
        assertEq(scheduleSelector, ITimelockController.scheduleBatch.selector, "Should be scheduleBatch");

        // Verify execute calldata
        bytes4 executeSelector = bytes4(result[1]);
        assertEq(executeSelector, ITimelockController.executeBatch.selector, "Should be executeBatch");
    }

    // ========================= HELPER FUNCTIONS =========================

    /**
     * @notice Helper function to slice bytes
     */
    function sliceBytes(bytes memory data, uint256 start) internal pure returns (bytes memory) {
        bytes memory result = new bytes(data.length - start);
        for (uint256 i = 0; i < result.length; i++) {
            result[i] = data[start + i];
        }
        return result;
    }
}
