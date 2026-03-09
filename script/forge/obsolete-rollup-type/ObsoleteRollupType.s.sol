// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.28;

import {console, Script, stdJson} from "forge-std/Script.sol";
import {AgglayerManager} from "contracts/AgglayerManager.sol";

/**
 * @notice Interface for TimelockController functions needed for the script
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
 * @title ObsoleteRollupType
 * @notice Script to generate calldata for obsoleting rollup types in the AgglayerManager
 * @dev Supports three modes: inclusion, exclusion, and purge
 * @dev Supports two transaction types: Multisig and Timelock
 */
contract ObsoleteRollupType is Script {
    using stdJson for string;

    /// @notice Path to the input JSON configuration file
    string internal constant INPUT_JSON = "script/forge/obsolete-rollup-type/input.json";

    /// @notice Input string for testing purposes
    string internal input;

    /// @notice Flag to indicate if the input is a string (for testing) or read from file
    bool internal isStringInput;

    /// @notice The resolved JSON input (either from file or string)
    string internal inputJson;

    /// @notice The chain ID slug for JSON key access
    string internal chainIdSlug;

    /// @notice Instance of the AgglayerManager contract
    AgglayerManager internal agglayerManager;

    /// @notice Array of rollup type IDs to be obsoleted
    uint256[] internal rollupTypesToObsolete;

    /// @notice Array of rollup type IDs to skip (already obsolete)
    uint256[] internal rollupTypesToSkip;

    /// @notice Mode of operation: inclusion, exclusion, or purge
    string internal mode;

    /// @notice Transaction type: Multisig or Timelock
    string internal txType;

    /// @notice Timelock delay (only for Timelock type)
    uint256 internal timelockDelay;

    /// @notice Timelock salt (only for Timelock type)
    bytes32 internal timelockSalt;

    /// @notice MultiSendCallOnly address (optional, for reference)
    address internal multiSendCallOnlyAddress;

    /**
     * @notice Helper function to run the script with a string input which is helpful for testing
     * @param _input JSON string input
     */
    function run(string memory _input) public returns (bytes[] memory) {
        isStringInput = true;
        input = _input;
        return run();
    }

    /**
     * @notice Main execution function of the script
     */
    function run() public returns (bytes[] memory) {
        _loadConfig();
        _determineRollupTypesToObsolete();

        bytes[] memory result;

        if (keccak256(bytes(txType)) == keccak256(bytes("Timelock"))) {
            result = _generateTimelockCalldata();
        } else {
            result = _generateMultisigCalldata();
        }

        _logOutput(result);
        return result;
    }

    /**
     * @notice Loads configuration from the input JSON file based on the current chain ID
     */
    function _loadConfig() internal {
        // Set the input JSON source
        if (isStringInput) {
            inputJson = input;
        } else {
            inputJson = vm.readFile(INPUT_JSON);
        }

        // Set the chain ID slug for all subsequent JSON access
        chainIdSlug = string(abi.encodePacked('["', vm.toString(block.chainid), '"]'));

        address agglayerManager_ = inputJson.readAddress(string.concat(chainIdSlug, ".agglayerManager"));
        mode = inputJson.readString(string.concat(chainIdSlug, ".mode"));
        txType = inputJson.readString(string.concat(chainIdSlug, ".type"));

        require(agglayerManager_ != address(0), "AgglayerManager address is zero");
        require(
            keccak256(bytes(mode)) == keccak256(bytes("inclusion"))
                || keccak256(bytes(mode)) == keccak256(bytes("exclusion"))
                || keccak256(bytes(mode)) == keccak256(bytes("purge")),
            "Invalid mode: must be inclusion, exclusion, or purge"
        );
        require(
            keccak256(bytes(txType)) == keccak256(bytes("Multisig"))
                || keccak256(bytes(txType)) == keccak256(bytes("Timelock")),
            "Invalid type: must be Multisig or Timelock"
        );

        agglayerManager = AgglayerManager(agglayerManager_);

        // Load optional parameters
        if (keccak256(bytes(txType)) == keccak256(bytes("Timelock"))) {
            timelockDelay = inputJson.readUint(string.concat(chainIdSlug, ".timelockDelay"));
            timelockSalt = inputJson.readBytes32(string.concat(chainIdSlug, ".timelockSalt"));
        }

        if (keccak256(bytes(txType)) == keccak256(bytes("Multisig"))) {
            multiSendCallOnlyAddress = inputJson.readAddress(string.concat(chainIdSlug, ".multiSendCallOnlyAddress"));
        }

        console.log("\n========================= INPUT CONFIGURATION =========================");
        console.log("AgglayerManager: %s", address(agglayerManager));
        console.log("Mode: %s", mode);
        console.log("Type: %s", txType);
        if (keccak256(bytes(txType)) == keccak256(bytes("Timelock"))) {
            console.log("Timelock Delay: %s", timelockDelay);
            console.log("Timelock Salt: %s", vm.toString(timelockSalt));
        }
        if (multiSendCallOnlyAddress != address(0)) {
            console.log("MultiSendCallOnly Address: %s", multiSendCallOnlyAddress);
        }
    }

    /**
     * @notice Determines which rollup types to obsolete based on the mode
     */
    function _determineRollupTypesToObsolete() internal {
        uint256[] memory list = _readListSafe();

        if (keccak256(bytes(mode)) == keccak256(bytes("inclusion"))) {
            require(list.length > 0, "Inclusion mode requires a non-empty list");
            _processInclusionMode(list);
        } else if (keccak256(bytes(mode)) == keccak256(bytes("exclusion"))) {
            require(list.length > 0, "Exclusion mode requires a non-empty list");
            _processExclusionMode(list);
        } else {
            _processPurgeMode();
        }

        console.log("\n=========================== ROLLUP TYPES TO OBSOLETE ==========================");
        console.log("Total count: %s", rollupTypesToObsolete.length);
        for (uint256 i = 0; i < rollupTypesToObsolete.length; i++) {
            console.log("  [%s] Rollup Type ID: %s", i, rollupTypesToObsolete[i]);
        }
    }

    /**
     * @notice Safely read the list field from JSON, returning empty array if it doesn't exist
     */
    function _readListSafe() internal view returns (uint256[] memory) {
        try this.readListExternal(inputJson, chainIdSlug) returns (uint256[] memory list) {
            return list;
        } catch {
            return new uint256[](0);
        }
    }

    /**
     * @notice External function to read list (needed for try-catch)
     */
    function readListExternal(string memory json, string memory slug) external pure returns (uint256[] memory) {
        return json.readUintArray(string.concat(slug, ".list"));
    }

    /**
     * @notice Process inclusion mode: obsolete specified rollup types
     */
    function _processInclusionMode(uint256[] memory list) internal {
        console.log("\nProcessing INCLUSION mode: obsolete specified rollup types");

        // Check if the rollups in the list are already obsolete or not
        for (uint256 i = 0; i < list.length; i++) {
            (,,,, bool obsolete,,) = agglayerManager.rollupTypeMap(uint32(list[i]));
            if (obsolete) {
                console.log("Rollup type %s: Already obsolete (skipping)", list[i]);
                continue;
            } else {
                rollupTypesToObsolete.push(list[i]);
            }
        }
    }

    /**
     * @notice Process exclusion mode: obsolete all rollup types except specified ones
     */
    function _processExclusionMode(uint256[] memory list) internal {
        console.log("\nProcessing EXCLUSION mode: obsolete all rollup types except excluded ones");
        _filterRollupTypes(list, "In excluded list");
    }

    /**
     * @notice Process purge mode: obsolete all rollup types not used by any rollup
     */
    function _processPurgeMode() internal {
        console.log("\nProcessing PURGE mode: obsolete all rollup types not used by any rollup");

        // Get all rollups and their rollup type IDs
        uint32 rollupCount = agglayerManager.rollupCount();
        console.log("Total rollups count: %s", rollupCount);

        // Build array of used rollup types
        uint256[] memory usedRollupTypes = new uint256[](rollupCount);
        uint256 usedCount = 0;

        for (uint32 rollupID = 1; rollupID <= rollupCount; rollupID++) {
            try agglayerManager.rollupIDToRollupDataV2(rollupID) returns (
                AgglayerManager.RollupDataReturnV2 memory rollupData
            ) {
                uint32 rollupTypeID = uint32(rollupData.rollupTypeID);

                // Check if already in used list
                if (!_isInList(rollupTypeID, usedRollupTypes)) {
                    usedRollupTypes[usedCount] = rollupTypeID;
                    usedCount++;
                }
            } catch {
                console.log("  Rollup %s: Failed to fetch (skipping)", rollupID);
            }
        }

        console.log("Used rollup types count: %s", usedCount);

        // Create a properly sized array with only used types
        uint256[] memory usedTypes = new uint256[](usedCount);
        for (uint256 i = 0; i < usedCount; i++) {
            usedTypes[i] = usedRollupTypes[i];
        }

        // Filter rollup types, excluding used ones
        _filterRollupTypes(usedTypes, "In use by rollup(s)");
    }

    /**
     * @notice Generates calldata for Multisig transactions
     */
    function _generateMultisigCalldata() internal view returns (bytes[] memory) {
        bytes[] memory result = new bytes[](1);

        if (rollupTypesToObsolete.length == 1) {
            // Single transaction
            result[0] = abi.encodeCall(AgglayerManager.obsoleteRollupType, (uint32(rollupTypesToObsolete[0])));
        } else {
            // Multiple transactions - encode as MultiSendCallOnly
            result[0] = _encodeMultiSendCallOnly();
        }

        return result;
    }

    /**
     * @notice Encodes multiple transactions for MultiSendCallOnly
     * @dev Format: bytes transactions = {operation as uint8}:{to as address}:{value as uint256}:{dataLength as uint256}:{data as bytes}
     */
    function _encodeMultiSendCallOnly() internal view returns (bytes memory) {
        bytes memory transactions;

        for (uint256 i = 0; i < rollupTypesToObsolete.length; i++) {
            bytes memory data = abi.encodeCall(AgglayerManager.obsoleteRollupType, (uint32(rollupTypesToObsolete[i])));

            transactions = abi.encodePacked(
                transactions,
                uint8(0), // operation: 0 = call
                address(agglayerManager), // to
                uint256(0), // value
                uint256(data.length), // data length
                data // data
            );
        }

        return transactions;
    }

    /**
     * @notice Generates calldata for Timelock transactions
     */
    function _generateTimelockCalldata() internal view returns (bytes[] memory) {
        bytes[] memory result = new bytes[](2);

        address[] memory targets = new address[](rollupTypesToObsolete.length);
        uint256[] memory values = new uint256[](rollupTypesToObsolete.length);
        bytes[] memory payloads = new bytes[](rollupTypesToObsolete.length);

        for (uint256 i = 0; i < rollupTypesToObsolete.length; i++) {
            targets[i] = address(agglayerManager);
            values[i] = 0;
            payloads[i] = abi.encodeCall(AgglayerManager.obsoleteRollupType, (uint32(rollupTypesToObsolete[i])));
        }

        bytes32 predecessor = bytes32(0);

        // Schedule calldata
        result[0] = abi.encodeCall(
            ITimelockController.scheduleBatch, (targets, values, payloads, predecessor, timelockSalt, timelockDelay)
        );

        // Execute calldata
        result[1] =
            abi.encodeCall(ITimelockController.executeBatch, (targets, values, payloads, predecessor, timelockSalt));

        return result;
    }

    /**
     * @notice Logs the output calldata
     */
    function _logOutput(bytes[] memory result) internal view {
        console.log("\n========================= OUTPUT CALLDATA =========================");

        if (keccak256(bytes(txType)) == keccak256(bytes("Timelock"))) {
            console.log("\n--- SCHEDULE CALLDATA ---");
            console.log("%s", vm.toString(result[0]));
            console.log("\n--- EXECUTE CALLDATA ---");
            console.log("%s", vm.toString(result[1]));
        } else {
            if (rollupTypesToObsolete.length == 1) {
                console.log("\n--- SINGLE TRANSACTION CALLDATA ---");
                console.log("%s", vm.toString(result[0]));
            } else {
                console.log("\n--- MULTISENDCALLONLY CALLDATA ---");
                if (multiSendCallOnlyAddress != address(0)) {
                    console.log("MultiSendCallOnly Address: %s", multiSendCallOnlyAddress);
                }
                console.log("Transaction Count: %s", rollupTypesToObsolete.length);
                console.log("%s", vm.toString(result[0]));
            }
        }

        console.log("\n===================================================================\n");
    }

    /**
     * @notice Helper function to check if a rollup type ID is in a given list
     * @param rollupTypeID The rollup type ID to check
     * @param list The list of rollup type IDs to search in
     * @return true if the rollup type ID is in the list
     */
    function _isInList(uint32 rollupTypeID, uint256[] memory list) internal pure returns (bool) {
        for (uint256 i = 0; i < list.length; i++) {
            if (uint32(list[i]) == rollupTypeID) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Helper function to filter rollup types excluding those in the given list
     * @param excludeList List of rollup type IDs to exclude from obsoleting
     * @param skipMessage Message prefix for excluded items (e.g., "In excluded list" or "In use by rollup(s)")
     */
    function _filterRollupTypes(uint256[] memory excludeList, string memory skipMessage) internal {
        uint32 rollupTypeCount = agglayerManager.rollupTypeCount();
        console.log("Total rollup types count: %s", rollupTypeCount);

        for (uint32 i = 1; i <= rollupTypeCount; i++) {
            (,,,, bool obsolete,,) = agglayerManager.rollupTypeMap(i);

            bool isExcluded = _isInList(i, excludeList);

            if (obsolete) {
                console.log("  Rollup type %s: Already obsolete (skipping)", i);
            } else if (isExcluded) {
                console.log("  Rollup type %s: %s (skipping)", i, skipMessage);
            } else {
                console.log("  Rollup type %s: Will be obsoleted", i);
                rollupTypesToObsolete.push(i);
            }
        }
    }
}
