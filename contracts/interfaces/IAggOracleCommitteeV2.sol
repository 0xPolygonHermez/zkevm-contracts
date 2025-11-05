// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {IAgglayerGERL2} from "./IAgglayerGERL2.sol";
import {IAgglayerBridgeL2} from "./IAgglayerBridgeL2.sol";
import {IVersion} from "./IVersion.sol";

/**
 * @title IAggOracleCommitteeV2Events
 * @notice Events emitted by AggOracleCommitteeV2 implementations
 */
interface IAggOracleCommitteeV2Events {
    /// @notice Emitted when a GER is injected
    event GERInjected(bytes32 indexed globalExitRoot);

    /// @notice Emitted when a GER is injected
    event LERInjected(uint32 indexed rollupIndex, bytes32 indexed LER, bytes indexed agglayerParams);

    /// @notice Emitted when the aggOracleProposer is updated
    event UpdateAggOracleProposer(address indexed newProposer);

    /// @notice Emitted when validators and threshold are updated
    event ValidatorsAndThresholdUpdated(address[] validators, uint256 threshold);
}

/**
 * @title IAggOracleCommitteeV2Errors
 * @notice Error definitions for AggOracleCommitteeV2 implementations
 */
interface IAggOracleCommitteeV2Errors {
    /// @notice Thrown when the AgglayerGERL2 address is zero
    error AgglayerGERL2CannotBeZero();

    /// @notice Thrown when the AgglayerBridgeL2 address is zero
    error AgglayerBridgeL2CannotBeZero();

    /// @notice Thrown when the owner address is zero
    error OwnerCannotBeZero();

    /// @notice Thrown when the proposer address is zero
    error ProposerCannotBeZero();

    /// @notice Thrown when the caller is not the oracle proposer
    error OnlyAggOracleProposerCanCall();

    /// @notice Thrown when array lengths don't match
    error ArrayLengthMismatch();

    /// @notice Thrown when a GER is zero
    error GERCannotBeZero();

    /// @notice Thrown when the validator address is zero
    error ValidatorCannotBeZero();

    /// @notice Thrown when the address is already a validator
    error ValidatorAlreadyExists();

    /// @notice Thrown when the validator index is out of bounds
    error ValidatorIndexOutOfBounds();

    /// @notice Thrown when the validator index doesn't match the address
    error ValidatorIndexMismatch();

    /// @notice Thrown when threshold is greater than the number of validators
    error ThresholdCannotBeGreaterThanValidators();

    /// @notice Thrown when threshold cannot be zero if any validator exists
    error ThresholdCannotBeZeroIfAnyValidatorExists();

    /// @notice Thrown when indices are not in descending order
    error IndicesNotInDescendingOrder();

    /// @notice Thrown when there are insufficient signatures
    error InsufficientSignatures();

    /// @notice Thrown when a validator does not exist
    error ValidatorDoesNotExist();

    /// @notice Thrown when validators are not ordered
    error ValidatorsNotOrdered();

    /// @notice Thrown when a validator is not found
    error ValidatorNotFound();

    /// @notice Thrown when a LER is zero
    error LERCannotBeZero();
}

/**
 * @title IAggOracleCommitteeV2
 * @notice Core interface for the AggOracleCommitteeV2 contract responsible for managing the insertion of GERs and LERs.
 * @dev This contract uses signature verification similar to Safe multisig for permissioned injection of GERs and LERs.
 */
interface IAggOracleCommitteeV2 is
    IAggOracleCommitteeV2Errors,
    IAggOracleCommitteeV2Events,
    IVersion
{
    ////////////////////
    // Structs
    ////////////////////

    /**
     * @notice Struct containing validator information
     * @param addr The address of the validator
     * @param url The URL associated with the validator
     */
    struct ValidatorInfo {
        address addr;
        string url;
    }

    /**
     * @notice Struct containing internal validator information
     * @param isValidator Whether the address is a validator
     * @param url The URL associated with the validator
     */
    struct ValidatorInternalInfo {
        bool isValidator;
        string url;
    }

    /**
     * @notice Struct to hold information for removing a validator
     * @param addr The address of the validator to remove
     * @param index The index of the validator in the validators array
     */
    struct RemoveValidatorInfo {
        address addr;
        uint256 index;
    }

    /**
     * @notice Struct containing LER information
     * @param rollupIndex The rollup index
     * @param LER The local exit root
     * @param agglayerParams The agglayer parameters
     */
    struct LERInformation {
        uint32 rollupIndex;
        bytes32 LER;
        bytes agglayerParams;
    }

    ////////////////////
    // External Functions
    ////////////////////

    /**
     * @notice Initializes the contract
     * @param _owner Owner of the contract, presumably a multisig
     * @param _newProposer Address that can propose GER/LER injections
     * @param _newValidators Initial array of validator information
     * @param _newThreshold Number of signatures required for GER/LER injection
     */
    function initialize(
        address _owner,
        address _newProposer,
        ValidatorInfo[] memory _newValidators,
        uint256 _newThreshold
    ) external;

    /**
     * @notice Inject multiple GERs with signature verification
     * @param _globalExitRoot The GER to inject
     * @param _signatures The signatures to verify
     */
    function injectGER(
        bytes32 _globalExitRoot,
        bytes calldata _signatures
    ) external;

    /**
     * @notice Update the aggOracleProposer address
     * @param _newProposer New proposer address
     */
    function updateAggOracleProposer(address _newProposer) external;

    /**
     * @notice Transfer the globalExitRootUpdater role
     * @dev This is a two-step process; the pending globalExitRootUpdater must accept to finalize the process
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external;

    /**
     * @notice Accept the globalExitRootUpdater role
     * @dev This is the second step from a two-step process
     */
    function acceptGlobalExitRootUpdater() external;

    /**
     * @notice Update the validators and threshold
     * @param _validatorsToRemove Array of validators to remove with their indices (MUST be in descending index order)
     * @param _validatorsToAdd Array of new validators to add with their URLs
     * @param _newThreshold New threshold value
     */
    function updateValidatorsAndThreshold(
        RemoveValidatorInfo[] memory _validatorsToRemove,
        ValidatorInfo[] memory _validatorsToAdd,
        uint256 _newThreshold
    ) external;

    ////////////////////
    // View Functions
    ////////////////////

    /**
     * @notice Verify a GER with signatures
     * @param _globalExitRoot The GER to verify
     * @param _signatures The signatures to verify
     * @return True if the GER is valid
     */
    function verifyGER(
        bytes32 _globalExitRoot,
        bytes memory _signatures
    ) external view returns (bool);

    /**
     * @notice Returns the index of a validator
     * @param _validator Validator address
     * @return The index of the validator
     */
    function getValidatorIndex(
        address _validator
    ) external view returns (uint256);

    /**
     * @notice Returns all the validators with their information
     * @return Array of validator information
     */
    function getValidatorsInfo() external view returns (ValidatorInfo[] memory);

    /**
     * @notice Returns the number of validators
     * @return The count of validators
     */
    function getValidatorsCount() external view returns (uint256);

    /**
     * @notice Returns if an address is a validator
     * @param _validator The address to check
     * @return True if the address is a validator
     */
    function isValidator(address _validator) external view returns (bool);

    ////////////////////
    // Public State Variables
    ////////////////////

    /// @notice Global exit root manager L2
    function agglayerGERL2() external view returns (IAgglayerGERL2);

    /// @notice Agglayer Bridge L2
    function agglayerBridgeL2() external view returns (IAgglayerBridgeL2);

    /// @notice Array of validators
    function validators(uint256 index) external view returns (address);

    /// @notice Threshold required for signature verification
    function threshold() external view returns (uint256);

    /// @notice Mapping to track validator information
    function validatorInfo(address validator) external view returns (bool isValidator, string memory url);

    /// @notice Address that can propose GER and LER injections
    function proposer() external view returns (address);
}