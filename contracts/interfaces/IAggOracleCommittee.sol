// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {IAgglayerGERL2} from "./IAgglayerGERL2.sol";

/**
 * @title IAggOracleCommittee
 * @notice Interface for the AggOracleCommittee contract responsible for managing the insertion of GERs into the AgglayerGERL2.
 */
interface IAggOracleCommittee {
    // Custom errors

    /// @notice Thrown when the quorum value is zero.
    error QuorumCannotBeZero();

    /// @notice Thrown when the caller is not an oracle member.
    error NotOracleMember();

    /// @notice Thrown when the address is already an oracle member.
    error AlreadyOracleMember();

    /// @notice Thrown when the provided oracle member index does not match the address.
    error OracleMemberIndexMismatch();

    /// @notice Thrown when the address was not an oracle member.
    error WasNotOracleMember();

    /// @notice Thrown when the oracle member is not found.
    error OracleMemberNotFound();

    /// @notice Thrown when the proposed GER is invalid (zero or reserved value).
    error InvalidProposedGER();

    /// @notice Thrown when the oracle member address is the zero address.
    error OracleMemberCannotBeZero();

    /// @notice Thrown when the oracle member has already voted for the proposed GER.
    error AlreadyVotedForThisGER();

    /// @notice Thrown when the quorum has not been reached for a global exit root.
    error QuorumNotReached();

    /// @notice Thrown when the global exit root manager address is the zero address.
    error GlobalExitRootManagerCannotBeZero();

    // Events

    /// @dev Emitted when a global exit root is proposed
    event ProposedGlobalExitRoot(
        bytes32 proposedGlobalExitRoot,
        address proposer
    );

    /// @notice Thrown when the quorum is greater than the number of oracle members.
    error QuorumCannotBeGreaterThanAggOracleMembers();

    /// @notice Thrown when the oracle member index is out of bounds.
    error OracleMemberIndexOutOfBounds();

    /// @dev Emitted when a global exit root is consolidated
    event ConsolidatedGlobalExitRoot(bytes32 consolidatedGlobalExitRoot);

    /// @dev Emitted when the quorum is updated
    event UpdateQuorum(uint64 newQuorum);

    /// @dev Emitted when a new oracle member is added
    event AddAggOracleMember(address newOracleMember);

    /// @dev Emitted when an oracle member is removed
    event RemoveAggOracleMember(address oracleMemberRemoved);

    // External functions

    /**
     * @notice Initializes the contract.
     * @param _owner Owner of the contract, presumably a timelock
     * @param _aggOracleMembers Initial oracle members
     * @param _quorum Quorum required for consolidation
     */
    function initialize(
        address _owner,
        address[] calldata _aggOracleMembers,
        uint64 _quorum
    ) external;

    /**
     * @notice Propose a global exit root.
     * This function can only be called by an oracle member.
     * If the quorum is reached, the GER is consolidated.
     * @param proposedGlobalExitRoot Global exit root proposed
     */
    function proposeGlobalExitRoot(bytes32 proposedGlobalExitRoot) external;

    /**
     * @notice Consolidate a global exit root that has reached quorum.
     * This function it's meant to be called if the quorum was lowered, and there's a GER that has
     * enough votes to be consolidated after updating it.
     * @param globalExitRoot Global exit root to consolidate
     */
    function consolidateGlobalExitRoot(bytes32 globalExitRoot) external;

    /**
     * @notice Add an oracle member.
     * Only the owner can call this function.
     * @param newOracleMember Address of the new oracle member
     */
    function addOracleMember(address newOracleMember) external;

    /**
     * @notice Remove an oracle member.
     * Only the owner can call this function.
     * @param oracleMemberAddress Address of the oracle member to remove
     * @param oracleMemberIndex Index of the oracle member to remove
     */
    function removeOracleMember(
        address oracleMemberAddress,
        uint256 oracleMemberIndex
    ) external;

    /**
     * @notice Update the quorum value.
     * Only the owner can call this function.
     * @param newQuorum New quorum value
     */
    function updateQuorum(uint64 newQuorum) external;

    /**
     * @notice Transfer the globalExitRootUpdater role.
     * This is a two-step process; the pending globalExitRootUpdater must accept to finalize the process.
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external;

    /**
     * @notice Accept the globalExitRootUpdater role.
     */
    function acceptGlobalExitRootUpdater() external;

    /**
     * @notice Returns the index of an oracle member.
     * @param oracleMember Oracle member address
     */
    function getAggOracleMemberIndex(
        address oracleMember
    ) external view returns (uint256);

    /**
     * @notice Returns all the oracle members.
     */
    function getAllAggOracleMembers() external view returns (address[] memory);

    /**
     * @notice Returns the number of oracle members.
     */
    function getAggOracleMembersCount() external view returns (uint256);

    // Public state variables (as getters)

    /// @notice This value is reserved as an initial voted GER to mark an oracle address as active
    function INITIAL_PROPOSED_GER() external view returns (bytes32);

    /// @notice Global exit root manager L2
    function globalExitRootManagerL2Sovereign()
        external
        view
        returns (IAgglayerGERL2);

    /// @notice Array of oracle members
    function aggOracleMembers(uint256 index) external view returns (address);

    /// @notice Number of reports that must match to consolidate a new rewards root (N/M)
    function quorum() external view returns (uint64);

    /// @notice Oracle member address --> current voted GER
    function addressToLastProposedGER(
        address oracleMember
    ) external view returns (bytes32);
}
