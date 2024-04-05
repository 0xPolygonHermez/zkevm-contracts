// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;
import "../PolygonRollupManager.sol";

/**
 * PolygonRollupManager mock
 */
contract PolygonRollupManagerMock is PolygonRollupManager {
    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol MATIC token address
     * @param _bridgeAddress Bridge address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridge _bridgeAddress
    ) PolygonRollupManager(_globalExitRootManager, _pol, _bridgeAddress) {}

    function initializeMock(
        address trustedAggregator,
        uint64 _pendingStateTimeout,
        uint64 _trustedAggregatorTimeout,
        address admin,
        address timelock,
        address emergencyCouncil
    ) external reinitializer(2) {
        pendingStateTimeout = _pendingStateTimeout;
        trustedAggregatorTimeout = _trustedAggregatorTimeout;

        // Constant deployment variables
        _zkGasPrice = 0.1 ether / ZK_GAS_LIMIT_BATCH; // 0.1 Matic
        verifySequenceTimeTarget = 30 minutes;
        multiplierZkGasPrice = 1002;

        // Initialize OZ contracts
        __AccessControl_init();

        // setup roles

        // trusted aggregator role
        _setupRole(_TRUSTED_AGGREGATOR_ROLE, trustedAggregator);

        // Timelock roles
        _setupRole(DEFAULT_ADMIN_ROLE, timelock);
        _setupRole(_ADD_ROLLUP_TYPE_ROLE, timelock);
        _setupRole(_ADD_EXISTING_ROLLUP_ROLE, timelock);

        // Even this role can only update to an already added verifier/consensus
        // Could break the compatibility of them, changing the virtual state
        _setupRole(_UPDATE_ROLLUP_ROLE, timelock);

        // Admin roles
        _setupRole(_OBSOLETE_ROLLUP_TYPE_ROLE, admin);
        _setupRole(_CREATE_ROLLUP_ROLE, admin);
        _setupRole(_STOP_EMERGENCY_ROLE, admin);
        _setupRole(_TWEAK_PARAMETERS_ROLE, admin);
        _setRoleAdmin(_TRUSTED_AGGREGATOR_ROLE, _TRUSTED_AGGREGATOR_ROLE_ADMIN);
        _setupRole(_TRUSTED_AGGREGATOR_ROLE_ADMIN, admin);

        _setupRole(_SET_FEE_ROLE, admin);

        // Emergency council roles
        _setRoleAdmin(_EMERGENCY_COUNCIL_ROLE, _EMERGENCY_COUNCIL_ADMIN);
        _setupRole(_EMERGENCY_COUNCIL_ROLE, emergencyCouncil);
        _setupRole(_EMERGENCY_COUNCIL_ADMIN, emergencyCouncil);

        // Since it's mock, use admin for everything
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function prepareMockCalculateRoot(bytes32[] memory localExitRoots) public {
        rollupCount = uint32(localExitRoots.length);

        // Add local Exit roots;
        for (uint256 i = 0; i < localExitRoots.length; i++) {
            rollupIDToRollupData[uint32(i + 1)]
                .lastLocalExitRoot = localExitRoots[i];
        }
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param verifyBatchesData Struct that contains all the necessary data to verify batches
     * @param oldStateRootArray Array of state root before batch is processed
     */
    function getInputSnarkBytes(
        VerifySequenceData[] calldata verifyBatchesData,
        bytes32[] calldata oldAccInputHashArray,
        bytes32[] calldata newAccInputHasArray,
        bytes32[] calldata oldStateRootArray
    ) public view returns (uint256) {
        // review don't check the length on both arrays since this is a view function

        // Create a snark input byte array
        bytes memory accumulateSnarkBytes;

        // This pointer will be the current position to write on accumulateSnarkBytes
        uint256 ptrAccumulateInputSnarkBytes;

        // Total length of the accumulateSnarkBytes, ByesPerRollup * rollupToVerify + 20 bytes (msg.sender)
        uint256 totalSnarkLength = _SNARK_BYTES_PER_ROLLUP_AGGREGATED *
            verifyBatchesData.length +
            20;

        // Use assembly to rever memory and get the memory pointer
        assembly {
            // Set accumulateSnarkBytes to the next free memory space
            accumulateSnarkBytes := mload(0x40)

            // Reserve the memory: 32 bytes for the byte array length + 32 bytes extra for byte manipulation (0x40) +
            // the length of the input snark bytes
            mstore(0x40, add(add(accumulateSnarkBytes, 0x40), totalSnarkLength))

            // Set the length of the input bytes
            mstore(accumulateSnarkBytes, totalSnarkLength)

            // Set the pointer on the start of the actual byte array
            ptrAccumulateInputSnarkBytes := add(accumulateSnarkBytes, 0x20)
        }

        for (uint256 i = 0; i < verifyBatchesData.length; i++) {
            ptrAccumulateInputSnarkBytes = _appendDataToInputSnarkBytesMock(
                rollupIDToRollupData[verifyBatchesData[i].rollupID],
                verifyBatchesData[i],
                oldStateRootArray[i],
                oldAccInputHashArray[i],
                newAccInputHasArray[i],
                ptrAccumulateInputSnarkBytes
            );
        }

        _appendSenderToInputSnarkBytes(ptrAccumulateInputSnarkBytes);

        uint256 inputSnark = uint256(sha256(accumulateSnarkBytes)) % _RFIELD;
        return inputSnark;
    }

    /**
     * @notice Function to append the current rollup data to the input snark bytes
     * @param rollup Rollup storage pointer
     * @param verifyBatchData Struct that contains all the necessary data to verify batches
     * @param oldStateRoot State root before batch is processed
     * @param oldAccInputHash Old accumulated input hash
     * @param newAccInputHash new accumualted input hash
     * @param ptrAccumulateInputSnarkBytes Memory pointer to the bytes array that will accumulate all rollups data to finally be used as the snark input
     */
    function _appendDataToInputSnarkBytesMock(
        RollupDataSequenceBased storage rollup,
        VerifySequenceData calldata verifyBatchData,
        bytes32 oldStateRoot,
        bytes32 oldAccInputHash,
        bytes32 newAccInputHash,
        uint256 ptrAccumulateInputSnarkBytes
    ) internal view returns (uint256) {
        uint64 initNumBatch = verifyBatchData.initSequenceNum;
        uint64 finalNewBatch = verifyBatchData.finalSequenceNum;
        bytes32 newLocalExitRoot = verifyBatchData.newLocalExitRoot;
        bytes32 newStateRoot = verifyBatchData.newStateRoot;

        // Check that new state root is inside goldilocks field
        // if (!_checkStateRootInsidePrime(uint256(newStateRoot))) {
        //     revert NewStateRootNotInsidePrime();
        // }
        uint256 ptr = ptrAccumulateInputSnarkBytes;

        assembly {
            // store oldStateRoot
            mstore(ptr, oldStateRoot)
            ptr := add(ptr, 32)

            // store oldAccInputHash
            mstore(ptr, oldAccInputHash)
            ptr := add(ptr, 32)

            // store initNumBatch
            mstore(ptr, shl(192, initNumBatch)) // 256-64 = 192
            ptr := add(ptr, 8)

            // store chainID
            // chainID is stored inside the rollup struct, on the first storage slot with 32 -(8 + 20) = 4 bytes offset
            mstore(ptr, shl(32, sload(rollup.slot)))
            ptr := add(ptr, 8)

            // store forkID
            // chainID is stored inside the rollup struct, on the second storage slot with 32 -(8 + 20) = 4 bytes offset
            mstore(ptr, shl(32, sload(add(rollup.slot, 1))))
            ptr := add(ptr, 8)

            // store newStateRoot
            mstore(ptr, newStateRoot)
            ptr := add(ptr, 32)

            // store newAccInputHash
            mstore(ptr, newAccInputHash)
            ptr := add(ptr, 32)

            // store newLocalExitRoot
            mstore(ptr, newLocalExitRoot)
            ptr := add(ptr, 32)

            // store finalNewBatch
            mstore(ptr, shl(192, finalNewBatch)) // 256-64 = 192
            ptr := add(ptr, 8)
        }
        return ptr;
    }
}
