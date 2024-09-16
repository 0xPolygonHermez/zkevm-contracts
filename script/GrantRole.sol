// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

import {PolygonZkEVMTimelock} from "contracts/PolygonZkEVMTimelock.sol";

contract GrantRole is Script {
    using stdJson for string;

    string role;
    address accountToGrantRole;
    address polygonRollupManager;
    uint256 timelockDelay;
    PolygonZkEVMTimelock polygonZkEVMTimelock;

    bytes32 roleHash;

    bytes32[10] internal roles = [
        keccak256("ADD_ROLLUP_TYPE_ROLE"),
        keccak256("OBSOLETE_ROLLUP_TYPE_ROLE"),
        keccak256("CREATE_ROLLUP_ROLE"),
        keccak256("ADD_EXISTING_ROLLUP_ROLE"),
        keccak256("UPDATE_ROLLUP_ROLE"),
        keccak256("TRUSTED_AGGREGATOR_ROLE"),
        keccak256("TRUSTED_AGGREGATOR_ROLE_ADMIN"),
        keccak256("SET_FEE_ROLE"),
        keccak256("STOP_EMERGENCY_ROLE"),
        keccak256("EMERGENCY_COUNCIL_ROLE")
    ];

    function run() public {
        readInput();
        (
            bytes memory scheduleBatchPayload,
            bytes memory executeBatchPayload,
            bytes32 payloadId
        ) = makePayload(roleHash);

        console.log("\n----------------------\n");

        console.log("Expected ID: %s", vm.toString(payloadId));

        console.log("\n----------------------\n");

        console.log("Schedule payload:");
        console.logBytes(scheduleBatchPayload);

        console.log("\n----------------------\n");

        console.log("Execute payload:");
        console.logBytes(executeBatchPayload);
    }

    function readInput() public {
        string memory inputPath = "script/inputs/grantRole.json";
        console.log("Reading inputs from: %s \n", inputPath);

        string memory input = vm.readFile(inputPath);

        role = input.readString(".roleName");
        accountToGrantRole = input.readAddress(".accountToGrantRole");
        polygonRollupManager = input.readAddress(
            ".polygonRollupManagerAddress"
        );
        timelockDelay = input.readUint(".timelockDelay");
        polygonZkEVMTimelock = PolygonZkEVMTimelock(
            payable(input.readAddress(".polygonZkEVMTimelockAddress"))
        );

        _verifyRole(role);
        console.log("Role name:", role);
        console.log("Account to grant role to:", accountToGrantRole);
        console.log("PolygonRollupManager Address:", polygonRollupManager);
        console.log("Timelock delay:", timelockDelay);
        console.log(
            "PolygonZkEVMTimelock Address:",
            address(polygonZkEVMTimelock)
        );
    }

    function makePayload(
        bytes32 _roleHash
    )
        public
        view
        returns (
            bytes memory scheduleBatchPayload,
            bytes memory executeBatchPayload,
            bytes32 payloadId
        )
    {
        bytes memory payload = abi.encodeCall(
            polygonZkEVMTimelock.grantRole,
            (_roleHash, accountToGrantRole)
        );

        scheduleBatchPayload = abi.encodeCall(
            polygonZkEVMTimelock.schedule,
            (polygonRollupManager, 0, payload, "", "", timelockDelay)
        );

        executeBatchPayload = abi.encodeCall(
            polygonZkEVMTimelock.execute,
            (polygonRollupManager, 0, payload, "", "")
        );

        // TODO: check why the polygonZkEVMTimelock.hashOperation() function is not working
        // Error: script failed: <empty revert data>
        payloadId = keccak256(
            abi.encode(polygonRollupManager, 0, payload, "", "")
        );
    }

    function _verifyRole(string memory roleInput) internal {
        bool isValidRole = false;
        roleHash = keccak256(abi.encodePacked(roleInput));
        for (uint256 i = 0; i < roles.length; i++) {
            if (roleHash == roles[i]) {
                isValidRole = true;
                break;
            }
        }
        require(isValidRole, "Unsupported role name provided");
    }
}
