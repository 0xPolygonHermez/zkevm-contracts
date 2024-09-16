// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import {PolygonRollupManagerNotUpgraded} from "contracts/newDeployments/PolygonRollupManagerNotUpgraded.sol";
import {PolygonZkEVMBridgeV2} from "contracts-ignored-originals/PolygonZkEVMBridgeV2.sol";
import {PolygonZkEVMGlobalExitRootV2} from "contracts/PolygonZkEVMGlobalExitRootV2.sol";
import {PolygonZkEVMDeployer} from "contracts/deployment/PolygonZkEVMDeployer.sol";
import {PolygonZkEVMTimelock} from "contracts/PolygonZkEVMTimelock.sol";

contract CreateGenesis is Script {
    using stdJson for string;

    struct ContractInfo {
        string name;
        address addr;
    }

    struct Slot {
        bytes32 slot;
        bytes32 value;
    }

    string constant OUTPUT_DIR = "script/";
    string constant OUTPUT_FILENAME = "genesis.json";
    bytes32 constant ADMIN_SLOT =
        0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
    bytes32 constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes32 constant EMPTY_SLOT_VALUE =
        0x0000000000000000000000000000000000000000000000000000000000000000;
    uint256 constant BALANCE_BRIDGE = 0xffffffffffffffffffffffffffffffff;
    uint256 constant BALANCE_DEPLOYER = 0x152d02c7e14af6800000;
    bytes16 private constant HEX_SYMBOLS = "0123456789abcdef";

    address deployerAddr;
    address timelockAdminAddress;
    bool isTest;

    string[] internal contractNames = [
        "PolygonZkEVMDeployer",
        "ProxyAdmin",
        "PolygonZkEVMBridgeImplementation",
        "PolygonZkEVMBridgeProxy",
        "PolygonZkEVMGlobalExitRootL2Implementation",
        "PolygonZkEVMGlobalExitRootL2Proxy",
        "PolygonZkEVMTimelock"
    ];

    bytes32[] internal timelockRoles = [
        keccak256("TIMELOCK_ADMIN_ROLE"),
        keccak256("PROPOSER_ROLE"),
        keccak256("EXECUTOR_ROLE"),
        keccak256("CANCELLER_ROLE")
    ];

    ContractInfo[] internal contracts;
    Slot[] internal contractSlots;

    function run() public {
        require(vm.isDir(OUTPUT_DIR), "Output directory does not exist");
        string memory outPath = string.concat(OUTPUT_DIR, OUTPUT_FILENAME);

        loadConfig();

        string memory gensis = generateGenesisJson();
        bytes32 stateRoot = _calculateStateRoot(_wrapJson(gensis));
        string memory finalGenesis = _insertStateRoot(gensis, stateRoot);

        vm.writeFile(outPath, finalGenesis);
        console.log("Genesis file created at path: %s\n", outPath);
    }

    function loadConfig() public {
        string memory inputPath = "script/inputs/genesisInput.json";
        console.log("Reading config from path: %s \n", inputPath);

        string memory input = vm.readFile(inputPath);
        for (uint256 i = 0; i < contractNames.length; i++) {
            ContractInfo memory currentContract = ContractInfo({
                name: contractNames[i],
                addr: input.readAddress(string.concat(".", contractNames[i]))
            });
            contracts.push(currentContract);
            console.log(
                "%s's address: %s",
                currentContract.name,
                currentContract.addr
            );
        }
        deployerAddr = input.readAddress(".Deployer");
        console.log("Deployer's address: %s", deployerAddr);

        timelockAdminAddress = input.readAddress(".timelockAdminAddress");
        console.log("Timelock Admin's address: %s", timelockAdminAddress);

        isTest = input.readBool(".isTest");
        console.log("Is test: %s", isTest);
        console.log("Config loaded successfully!\n");
    }

    function generateGenesisJson() public returns (string memory) {
        string memory finalOutput = '"genesis": [';
        for (uint256 i = 0; i < contracts.length; i++) {
            uint256 balance = 0;
            if (
                keccak256(abi.encodePacked(contracts[i].name)) ==
                keccak256(abi.encodePacked("PolygonZkEVMBridgeProxy"))
            ) {
                balance = BALANCE_BRIDGE;
            }
            string memory contractOutput = _generateContractGenesisInfo(
                contracts[i].name,
                balance,
                contracts[i].addr
            );
            finalOutput = string.concat(finalOutput, contractOutput);
            if (i != contracts.length - 1) {
                finalOutput = string.concat(finalOutput, ",");
            }
        }
        finalOutput = string.concat(finalOutput, ",");
        string memory deployerOutput = _getDeployerInfo();
        finalOutput = string.concat(finalOutput, deployerOutput);
        finalOutput = string.concat(finalOutput, "]");
        return finalOutput;
    }

    function _getContractSlots(address contractAddr) internal {
        // try to get 200 slots
        uint256 n = 200;
        for (uint256 i = 0; i < n; i++) {
            bytes32 currentSlot = bytes32(uint256(i));
            bytes32 currentSlotValue = vm.load(contractAddr, currentSlot);
            if (currentSlotValue != EMPTY_SLOT_VALUE) {
                contractSlots.push(
                    Slot({slot: currentSlot, value: currentSlotValue})
                );
            }
        }
    }

    function _generateContractGenesisInfo(
        string memory contractName,
        uint256 balance,
        address contractAddr
    ) internal returns (string memory) {
        string memory contractObj = contractName;

        bytes memory runtimeCode = contractAddr.code;
        require(runtimeCode.length > 0, "Contract runtime code is empty");
        vm.serializeBytes(contractObj, "bytecode", runtimeCode);

        vm.serializeString(contractObj, "contractName", contractName);
        vm.serializeString(contractObj, "balance", _toHexString(balance));
        vm.serializeString(
            contractObj,
            "nonce",
            _toHexString(vm.getNonce(contractAddr))
        );
        vm.serializeAddress(contractObj, "address", contractAddr);

        _getContractSlots(contractAddr);

        // Special handling for PolygonZkEVMTimelock
        if (
            keccak256(abi.encodePacked(contractName)) !=
            keccak256(abi.encodePacked("PolygonZkEVMTimelock"))
        ) {
            bytes32 adminSlotValue = vm.load(contractAddr, ADMIN_SLOT);
            if (adminSlotValue != EMPTY_SLOT_VALUE) {
                contractSlots.push(
                    Slot({slot: ADMIN_SLOT, value: adminSlotValue})
                );
            }
            bytes32 implementationSlotValue = vm.load(
                contractAddr,
                IMPLEMENTATION_SLOT
            );
            if (implementationSlotValue != EMPTY_SLOT_VALUE) {
                contractSlots.push(
                    Slot({
                        slot: IMPLEMENTATION_SLOT,
                        value: implementationSlotValue
                    })
                );
            }
        } else {
            for (uint256 i = 0; i < timelockRoles.length; i++) {
                uint256 rolesMappingStoragePositionStruct = 0;
                bytes32 storagePosition = keccak256(
                    abi.encodePacked(
                        timelockRoles[i],
                        rolesMappingStoragePositionStruct
                    )
                );

                address[] memory addressArray = new address[](2);
                addressArray[0] = timelockAdminAddress;
                addressArray[1] = contractAddr;
                for (uint256 j = 0; j < addressArray.length; j++) {
                    bytes32 storagePositionRole = keccak256(
                        abi.encodePacked(
                            uint256(uint160(addressArray[j])),
                            storagePosition
                        )
                    );
                    bytes32 valueRole = vm.load(
                        contractAddr,
                        storagePositionRole
                    );
                    if (valueRole != EMPTY_SLOT_VALUE) {
                        contractSlots.push(
                            Slot({slot: storagePositionRole, value: valueRole})
                        );
                    }
                }
                bytes32 roleAdminSlot = bytes32(uint256(storagePosition) + 1); // shift by 1 to get the next slot
                bytes32 valueRoleAdminSlot = vm.load(
                    contractAddr,
                    roleAdminSlot
                );
                if (valueRoleAdminSlot != EMPTY_SLOT_VALUE) {
                    contractSlots.push(
                        Slot({slot: roleAdminSlot, value: valueRoleAdminSlot})
                    );
                }
            }
        }

        string memory slotsObj = string.concat("storage slots:", contractName);
        string memory slotsOutput;
        for (uint256 i = 0; i < contractSlots.length; i++) {
            slotsOutput = vm.serializeBytes32(
                slotsObj,
                vm.toString(contractSlots[i].slot),
                contractSlots[i].value
            );
        }
        // reset contractSlots for next contract
        delete contractSlots;
        return vm.serializeString(contractObj, "storage", slotsOutput);
    }

    function _getDeployerInfo() internal returns (string memory) {
        uint256 balance = 0;
        if (isTest) {
            balance = BALANCE_DEPLOYER;
        }
        string memory deployerObj = "deployer info";
        vm.serializeString(deployerObj, "accountName", "deployer");
        vm.serializeString(
            deployerObj,
            "nonce",
            _toHexString(vm.getNonce(deployerAddr))
        );
        vm.serializeString(deployerObj, "balance", _toHexString(balance));
        return vm.serializeAddress(deployerObj, "address", deployerAddr);
    }

    function _calculateStateRoot(
        string memory genesis
    ) public returns (bytes32) {
        string[] memory operation = new string[](4);
        operation[0] = "node";
        operation[1] = "tools/zkevm-commonjs-wrapper";
        operation[2] = "calculateRoot";
        operation[3] = genesis;

        bytes memory result = vm.ffi(operation);
        return abi.decode(result, (bytes32));
    }

    function _toHexString(uint256 value) internal pure returns (string memory) {
        // Determine the length of the hex string
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp >>= 4;
        }

        // Handle case when value is zero
        if (digits == 0) return "0x00";

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = HEX_SYMBOLS[value & 15];
            value >>= 4;
        }

        // Add '0x' prefix
        return string(abi.encodePacked("0x", buffer));
    }

    function _wrapJson(
        string memory json
    ) internal pure returns (string memory) {
        return string.concat("{", json, "}");
    }

    function _insertStateRoot(
        string memory json,
        bytes32 stateRoot
    ) internal pure returns (string memory) {
        return
            string.concat(
                "{",
                '"root":"',
                vm.toString(stateRoot),
                '",',
                json,
                "}"
            );
    }
}
