// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {IAgglayerGERL2} from "./IAgglayerGERL2.sol";
import {IAgglayerBridgeL2} from "./IAgglayerBridgeL2.sol";

/**
 * @title IAggOracleCommitteeV2
 * @notice Interface for the AggOracleCommitteeV2 contract responsible for managing the insertion of GERs and LERs.
 */
interface IAggOracleCommitteeV2 {
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

    // Events

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

    // External functions

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
    ) external;

    /**
     * @notice Inject multiple GERs with signature verification
     * @param _globalExitRoots Array of GERs to inject
     * @param _signatures Array of signature arrays for each GER
     */
    function injectGER(
        bytes32[] calldata _globalExitRoots,
        bytes[] calldata _signatures
    ) external;

    /**
     * @notice Inject multiple LERs with signature verification
     * @param _lerInformation Array of LER information to inject
     * @param _signatures Array of signature arrays for each LER
     */
    function injectLER(
        LERInformation[] calldata _lerInformation,
        bytes[] calldata _signatures
    ) external;

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
        bytes32[32][][] calldata _smtProofLocalExitRoot,
        uint32[][] calldata _originNetwork,
        address[][] calldata _originTokenAddress,
        uint32[][] calldata _destinationNetwork,
        address[] calldata _destinationAddress,
        uint256[][] calldata _amount,
        bytes[][] calldata _metadata
    ) external;

    /**
     * @notice Add an oracle member
     * @param _newOracleMember Address of the new oracle member
     */
    function addOracleMember(address _newOracleMember) external;

    /**
     * @notice Remove an oracle member
     * @param _oracleMemberAddress Address of the oracle member to remove
     * @param _oracleMemberIndex Index of the oracle member to remove
     */
    function removeOracleMember(
        address _oracleMemberAddress,
        uint256 _oracleMemberIndex
    ) external;

    /**
     * @notice Update the threshold value
     * @param _newThreshold New threshold value
     */
    function updateThreshold(uint64 _newThreshold) external;

    /**
     * @notice Update the aggOracleProposer address
     * @param _newProposer New proposer address
     */
    function updateAggOracleProposer(address _newProposer) external;

    /**
     * @notice Transfer the globalExitRootUpdater role
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external;

    /**
     * @notice Accept the globalExitRootUpdater role
     */
    function acceptGlobalExitRootUpdater() external;

    /**
     * @notice Returns the index of an oracle member
     * @param _oracleMember Oracle member address
     * @return The index of the oracle member
     */
    function getAggOracleMemberIndex(
        address _oracleMember
    ) external view returns (uint256);

    /**
     * @notice Returns all the oracle members
     * @return Array of oracle member addresses
     */
    function getAllAggOracleMembers() external view returns (address[] memory);

    /**
     * @notice Returns the number of oracle members
     * @return The count of oracle members
     */
    function getAggOracleMembersCount() external view returns (uint256);

    // Public state variables (as getters)

    /// @notice Version constant
    function VERSION() external view returns (string memory);

    /// @notice Global exit root manager L2
    function globalExitRootManagerL2Sovereign()
        external
        view
        returns (IAgglayerGERL2);

    /// @notice Agglayer Bridge L2
    function agglayerBridgeL2() external view returns (IAgglayerBridgeL2);

    /// @notice Array of oracle members
    function aggOracleMembers(uint256 index) external view returns (address);

    /// @notice Threshold required for signature verification
    function threshold() external view returns (uint64);

    /// @notice Mapping to track if an address is an oracle member
    function isAggOracleMember(address member) external view returns (bool);

    /// @notice Address that can propose LER injections
    function aggOracleProposer() external view returns (address);
}

