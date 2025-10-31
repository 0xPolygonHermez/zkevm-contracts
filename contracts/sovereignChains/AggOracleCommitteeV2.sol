// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable5/access/OwnableUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts5/utils/cryptography/ECDSA.sol";
import {IAgglayerGERL2} from "../interfaces/IAgglayerGERL2.sol";
import {IAgglayerBridgeL2} from "../interfaces/IAgglayerBridgeL2.sol";

/**
 * @title AggOracleCommitteeV2
 * @notice Contract responsible for managing the insertion of GERs and LERs into the AgglayerGERL2.
 * @dev This contract uses signature verification similar to Safe multisig for permissioned injection of GERs and LERs.
 */
contract AggOracleCommitteeV2 is OwnableUpgradeable {
    /**
     * @notice Struct containing LER information
     * @param rollupIndex The rollup index for the LER
     * @param LER The local exit root
     * @param agglayerParams Metadata for the agglayer
     */
    struct LERInformation {
        uint32 rollupIndex;
        bytes32 LER;
        bytes agglayerParams;
    }

    // Version
    string public constant VERSION = "v2.0.0";

    // Merkle tree depth constant
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    // Global exit root manager L2
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IAgglayerGERL2 public immutable globalExitRootManagerL2Sovereign;

    // Agglayer Bridge L2
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IAgglayerBridgeL2 public immutable agglayerBridgeL2;

    // Array of oracle members
    address[] public aggOracleMembers;

    // Threshold required for signature verification
    uint64 public threshold;

    // Mapping to track if an address is an oracle member
    mapping(address => bool) public isAggOracleMember;

    // Address that can propose LER injections
    address public aggOracleProposer;

    /**
     * @dev Disables initializers on the implementation, following best practices.
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        IAgglayerGERL2 _globalExitRootManager,
        IAgglayerBridgeL2 _agglayerBridgeL2
    ) {
        require(
            address(_globalExitRootManager) != address(0),
            "GlobalExitRootManagerCannotBeZero"
        );

        require(
            address(_agglayerBridgeL2) != address(0),
            "AgglayerBridgeL2CannotBeZero"
        );

        globalExitRootManagerL2Sovereign = _globalExitRootManager;
        agglayerBridgeL2 = _agglayerBridgeL2;
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract.
     * @param _owner Owner of the contract, presumably a multisig
     * @param _aggOracleMembers Initial oracle members
     * @param _threshold Threshold required for signature verification
     * @param _aggOracleProposer Address that can propose LER injections
     */
    function initialize(
        address _owner,
        address[] calldata _aggOracleMembers,
        uint64 _threshold,
        address _aggOracleProposer
    ) external initializer {
        require(_threshold != 0, "ThresholdCannotBeZero");
        require(_aggOracleMembers.length >= 1, "MustHaveAtLeastOneSigner");
        require(
            _threshold <= _aggOracleMembers.length,
            "ThresholdCannotBeGreaterThanMembers"
        );
        require(_aggOracleProposer != address(0), "ProposerCannotBeZero");

        // Set initialization parameters
        threshold = _threshold;
        aggOracleProposer = _aggOracleProposer;

        // Add oracle members
        for (uint256 i = 0; i < _aggOracleMembers.length; i++) {
            _addOracleMember(_aggOracleMembers[i]);
        }

        // Initialize OpenZeppelin OwnableUpgradeable
        __Ownable_init(_owner);

        // Emit events
        emit UpdateThreshold(_threshold);
        emit UpdateAggOracleProposer(_aggOracleProposer);
    }

    ////////////////////
    // Owner functions
    ///////////////////

    /**
     * @notice Inject multiple GERs with signature verification
     * @param _globalExitRoots Array of GERs to inject
     * @param _signatures Array of signature arrays for each GER
     */
    function injectGER(
        bytes32[] calldata _globalExitRoots,
        bytes[] calldata _signatures
    ) external onlyOwner {
        require(
            _globalExitRoots.length == _signatures.length,
            "ArrayLengthMismatch"
        );

        for (uint256 i = 0; i < _globalExitRoots.length; i++) {
            bytes32 globalExitRoot = _globalExitRoots[i];
            require(globalExitRoot != bytes32(0), "GERCannotBeZero");

            // Build message to verify
            bytes32 messageHash = _buildGERMessage(globalExitRoot);

            // Verify signatures
            _verifySignatures(messageHash, _signatures[i]);

            // Insert GER
            globalExitRootManagerL2Sovereign.insertGlobalExitRoot(
                globalExitRoot
            );

            emit GERInjected(globalExitRoot);
        }
    }

    /**
     * @notice Inject multiple LERs with signature verification
     * @param _lerInformation Array of LER information to inject
     * @param _signatures Array of signature arrays for each LER
     */
    function injectLER(
        LERInformation[] calldata _lerInformation,
        bytes[] calldata _signatures
    ) external {
        require(
            msg.sender == aggOracleProposer,
            "OnlyAggOracleProposerCanCall"
        );
        require(
            _lerInformation.length == _signatures.length,
            "ArrayLengthMismatch"
        );

        for (uint256 i = 0; i < _lerInformation.length; i++) {
            LERInformation calldata lerInfo = _lerInformation[i];
            require(lerInfo.LER != bytes32(0), "LERCannotBeZero");

            // Build message to verify
            bytes32 messageHash = _buildLERMessage(
                lerInfo.rollupIndex,
                lerInfo.LER,
                lerInfo.agglayerParams
            );

            // Verify signatures
            _verifySignatures(messageHash, _signatures[i]);

            // Note: The actual insertion of LER into AgglayerGERL2 or AgglayerBridgeL2
            // depends on the bridge implementation. This is a placeholder.
            // The spec mentions calling insertLER but IAgglayerGERL2 doesn't have this function.
            // For now, we emit an event. Implementation may need adjustment based on actual interface.

            emit LERInjected(
                lerInfo.rollupIndex,
                lerInfo.LER,
                lerInfo.agglayerParams
            );
        }
    }

    /**
     * @notice Inject LER and execute claims
     * @param _lerInformation LER information to inject
     * @param _signatures Signatures for the LER
     * @param _smtProofLocalExitRoot Array of SMT proofs for local exit roots
     * @param _originNetwork Array of origin networks
     * @param _originTokenAddress Array of origin token addresses
     * @param _destinationNetwork Array of destination networks
     * @param _destinationAddress Array of destination addresses
     * @param _amount Array of amounts
     * @param _metadata Array of metadata
     */
    function injectLERAndClaim(
        LERInformation calldata _lerInformation,
        bytes calldata _signatures,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH][][] calldata _smtProofLocalExitRoot,
        uint32[][] calldata _originNetwork,
        address[][] calldata _originTokenAddress,
        uint32[][] calldata _destinationNetwork,
        address[] calldata _destinationAddress,
        uint256[][] calldata _amount,
        bytes[][] calldata _metadata
    ) external {
        require(
            msg.sender == aggOracleProposer,
            "OnlyAggOracleProposerCanCall"
        );
        require(_lerInformation.LER != bytes32(0), "LERCannotBeZero");

        // Build message to verify
        bytes32 messageHash = _buildLERMessage(
            _lerInformation.rollupIndex,
            _lerInformation.LER,
            _lerInformation.agglayerParams
        );

        // Verify signatures
        _verifySignatures(messageHash, _signatures);

        // Emit LER injection event
        emit LERInjected(
            _lerInformation.rollupIndex,
            _lerInformation.LER,
            _lerInformation.agglayerParams
        );

        // Process claims - iterate through arrays and call claimAsset
        // Arrays validation
        uint256 claimCount = _destinationAddress.length;
        require(
            _smtProofLocalExitRoot.length == claimCount &&
                _originNetwork.length == claimCount &&
                _originTokenAddress.length == claimCount &&
                _destinationNetwork.length == claimCount &&
                _amount.length == claimCount &&
                _metadata.length == claimCount,
            "ClaimArrayLengthMismatch"
        );

        // Execute claims - if any fail, continue without reverting
        for (uint256 i = 0; i < claimCount; i++) {
            try
                this.claimAssetFromLER(
                    _smtProofLocalExitRoot[i],
                    _originNetwork[i],
                    _originTokenAddress[i],
                    _destinationNetwork[i],
                    _destinationAddress[i],
                    _amount[i],
                    _metadata[i]
                )
            {
                emit ClaimExecuted(i, true);
            } catch {
                emit ClaimExecuted(i, false);
            }
        }
    }

    /**
     * @notice Helper function to execute claims from LER
     * @dev This function is called externally from injectLERAndClaim to allow try/catch
     */
    function claimAssetFromLER(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH][] calldata, /* smtProofLocalExitRoot */
        uint32[] calldata, /* originNetwork */
        address[] calldata, /* originTokenAddress */
        uint32[] calldata, /* destinationNetwork */
        address calldata, /* destinationAddress */
        uint256[] calldata, /* amount */
        bytes[] calldata /* metadata */
    ) external {
        require(msg.sender == address(this), "OnlySelfCanCall");
        // Placeholder for actual claim logic
        // This would interact with agglayerBridgeL2.claimAsset()
        // Implementation depends on the exact bridge interface
    }

    /**
     * @notice Add an oracle member
     * @param _newOracleMember Address of the new oracle member
     */
    function addOracleMember(address _newOracleMember) external onlyOwner {
        _addOracleMember(_newOracleMember);
    }

    /**
     * @notice Remove an oracle member
     * @param _oracleMemberAddress Address of the oracle member to remove
     * @param _oracleMemberIndex Index of the oracle member to remove
     */
    function removeOracleMember(
        address _oracleMemberAddress,
        uint256 _oracleMemberIndex
    ) external onlyOwner {
        require(
            _oracleMemberIndex < aggOracleMembers.length,
            "OracleMemberIndexOutOfBounds"
        );

        require(isAggOracleMember[_oracleMemberAddress], "NotOracleMember");

        require(
            aggOracleMembers[_oracleMemberIndex] == _oracleMemberAddress,
            "OracleMemberIndexMismatch"
        );

        // Remove oracle member
        isAggOracleMember[_oracleMemberAddress] = false;

        // Remove from array
        aggOracleMembers[_oracleMemberIndex] = aggOracleMembers[
            aggOracleMembers.length - 1
        ];
        aggOracleMembers.pop();

        emit RemoveAggOracleMember(_oracleMemberAddress);
    }

    /**
     * @notice Update the threshold value
     * @param _newThreshold New threshold value
     */
    function updateThreshold(uint64 _newThreshold) external onlyOwner {
        require(_newThreshold != 0, "ThresholdCannotBeZero");
        require(
            _newThreshold <= aggOracleMembers.length,
            "ThresholdCannotBeGreaterThanMembers"
        );

        threshold = _newThreshold;
        emit UpdateThreshold(_newThreshold);
    }

    /**
     * @notice Update the aggOracleProposer address
     * @param _newProposer New proposer address
     */
    function updateAggOracleProposer(
        address _newProposer
    ) external onlyOwner {
        require(_newProposer != address(0), "ProposerCannotBeZero");

        aggOracleProposer = _newProposer;
        emit UpdateAggOracleProposer(_newProposer);
    }

    /**
     * @notice Transfer the globalExitRootUpdater role
     * @dev This is a two-step process; the pending globalExitRootUpdater must accept to finalize the process
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external onlyOwner {
        globalExitRootManagerL2Sovereign.transferGlobalExitRootUpdater(
            _newGlobalExitRootUpdater
        );
    }

    /**
     * @notice Accept the globalExitRootUpdater role
     * @dev This is the second step from a two-step process
     */
    function acceptGlobalExitRootUpdater() external onlyOwner {
        globalExitRootManagerL2Sovereign.acceptGlobalExitRootUpdater();
    }

    ////////////////////
    // Internal functions
    ///////////////////

    /**
     * @notice Internal function to add an oracle member
     * @param _newOracleMember Address of the new oracle member
     */
    function _addOracleMember(address _newOracleMember) internal {
        require(_newOracleMember != address(0), "OracleMemberCannotBeZero");
        require(!isAggOracleMember[_newOracleMember], "AlreadyOracleMember");

        // Add oracle member
        isAggOracleMember[_newOracleMember] = true;
        aggOracleMembers.push(_newOracleMember);

        emit AddAggOracleMember(_newOracleMember);
    }

    /**
     * @notice Build message hash for GER verification
     * @param _globalExitRoot The GER to build message for
     * @return The message hash
     */
    function _buildGERMessage(
        bytes32 _globalExitRoot
    ) internal view virtual returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    address(this),
                    block.chainid,
                    _globalExitRoot
                )
            );
    }

    /**
     * @notice Build message hash for LER verification
     * @param _rollupIndex The rollup index
     * @param _LER The local exit root
     * @param _agglayerParams The agglayer parameters
     * @return The message hash
     */
    function _buildLERMessage(
        uint32 _rollupIndex,
        bytes32 _LER,
        bytes memory _agglayerParams
    ) internal view virtual returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    address(this),
                    block.chainid,
                    _rollupIndex,
                    _LER,
                    _agglayerParams
                )
            );
    }

    /**
     * @notice Verify signatures according to threshold
     * @dev Similar to Safe's signature verification approach
     * @param _messageHash The message hash to verify
     * @param _signatures Concatenated signatures (r, s, v format)
     */
    function _verifySignatures(
        bytes32 _messageHash,
        bytes memory _signatures
    ) internal view {
        // Signatures are expected to be tightly packed as (r, s, v) for each signature
        // where v is the recovery id (27 or 28)
        require(
            _signatures.length >= threshold * 65,
            "InsufficientSignatures"
        );

        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(
            _messageHash
        );

        address lastSigner = address(0);
        address currentSigner;

        for (uint256 i = 0; i < threshold; i++) {
            (uint8 v, bytes32 r, bytes32 s) = _splitSignature(
                _signatures,
                i
            );

            // Recover signer
            currentSigner = ECDSA.recover(ethSignedMessageHash, v, r, s);

            // Check that signer is an oracle member
            require(
                isAggOracleMember[currentSigner],
                "SignerNotOracleMember"
            );

            // Check that signers are ordered (prevent duplicates)
            require(currentSigner > lastSigner, "SignersNotOrdered");

            lastSigner = currentSigner;
        }
    }

    /**
     * @notice Split signature from concatenated signatures
     * @param _signatures Concatenated signatures
     * @param _index Index of the signature to extract
     * @return v The recovery id
     * @return r The r value
     * @return s The s value
     */
    function _splitSignature(
        bytes memory _signatures,
        uint256 _index
    ) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        uint256 offset = _index * 65;

        assembly {
            r := mload(add(_signatures, add(0x20, offset)))
            s := mload(add(_signatures, add(0x40, offset)))
            v := byte(0, mload(add(_signatures, add(0x60, offset))))
        }
    }

    ///////////////////
    // View functions
    ///////////////////

    /**
     * @notice Returns the index of an oracle member
     * @param _oracleMember Oracle member address
     * @return The index of the oracle member
     */
    function getAggOracleMemberIndex(
        address _oracleMember
    ) external view returns (uint256) {
        for (uint256 i = 0; i < aggOracleMembers.length; ++i) {
            if (aggOracleMembers[i] == _oracleMember) {
                return i;
            }
        }

        revert("OracleMemberNotFound");
    }

    /**
     * @notice Returns all the oracle members
     * @return Array of oracle member addresses
     */
    function getAllAggOracleMembers() external view returns (address[] memory) {
        return aggOracleMembers;
    }

    /**
     * @notice Returns the number of oracle members
     * @return The count of oracle members
     */
    function getAggOracleMembersCount() external view returns (uint256) {
        return aggOracleMembers.length;
    }

    ////////////////////
    // Events
    ///////////////////

    /// @dev Emitted when a GER is injected
    event GERInjected(bytes32 indexed globalExitRoot);

    /// @dev Emitted when a LER is injected
    event LERInjected(
        uint32 indexed rollupIndex,
        bytes32 indexed LER,
        bytes agglayerParams
    );

    /// @dev Emitted when a claim is executed
    event ClaimExecuted(uint256 indexed claimIndex, bool success);

    /// @dev Emitted when the threshold is updated
    event UpdateThreshold(uint64 newThreshold);

    /// @dev Emitted when a new oracle member is added
    event AddAggOracleMember(address newOracleMember);

    /// @dev Emitted when an oracle member is removed
    event RemoveAggOracleMember(address oracleMemberRemoved);

    /// @dev Emitted when the aggOracleProposer is updated
    event UpdateAggOracleProposer(address newProposer);
}

