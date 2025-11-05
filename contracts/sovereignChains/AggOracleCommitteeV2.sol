// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable5/access/OwnableUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts5/utils/cryptography/ECDSA.sol";
import {IAgglayerGERL2} from "../interfaces/IAgglayerGERL2.sol";
import {IAgglayerBridgeL2} from "../interfaces/IAgglayerBridgeL2.sol";
import {IAggOracleCommitteeV2} from "../interfaces/IAggOracleCommitteeV2.sol";
import {IVersion} from "../interfaces/IVersion.sol";
import {SignatureDecoder} from "../lib/SignatureDecoder.sol";

/**
 * @title AggOracleCommitteeV2
 * @notice Contract responsible for managing the insertion of GERs (Global Exit Roots) and LERs (Local Exit Roots)
 * @notice Proposer-validator management is equal as the one implemented in the AggchainSigners contract but a minor modification
 *         which allows the `url` of a validator to be empty. This Sc will be deployed on L2 and therefore GASc osts are not an issue.
 * @dev This contract uses signature verification similar to Safe multisig for permissioned injection of GERs and LERs
 *      It implements a threshold-based multi-signature scheme where a minimum number of oracle validators must sign
 *      each GER/LER injection before it can be executed.
 */
contract AggOracleCommitteeV2 is SignatureDecoder, OwnableUpgradeable, IVersion, IAggOracleCommitteeV2 {
    ////////////////////
    // Immutables & Constants
    ////////////////////

    /// @notice Version constant
    string public constant VERSION_AGG_ORACLE_COMMITTEE_V2 = "v1.0.0";

    /// @notice Merkle tree depth constant for SMT proofs
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    /// @notice Global exit root manager L2 - manages the GER tree
    IAgglayerGERL2 public immutable agglayerGERL2;

    /// @notice Agglayer Bridge L2 - manages cross-chain asset transfers
    IAgglayerBridgeL2 public immutable agglayerBridgeL2;

    ////////////////////
    // Storage
    ////////////////////

    /// @notice Array of oracle validator addresses
    address[] public validators;

    /// @notice Number of signatures required to inject a GER or LER
    uint256 public threshold;

    /// @notice Mapping to track if an address is an authorized oracle validator
    mapping(address => ValidatorInternalInfo) public validatorInfo;

    /// @notice Address authorized to propose GER and LER injections
    address public proposer;

    ////////////////////
    // Modifiers
    ////////////////////

    /**
     * @notice Modifier to restrict access to the oracle proposer
     * @dev Reverts if the caller is not the designated oracle proposer
     */
    modifier onlyAggOracleProposer() {
        if (msg.sender != proposer) {
            revert OnlyAggOracleProposerCanCall();
        }
        _;
    }

    ////////////////////
    // Constructor
    ////////////////////

    /**
     * @notice Contract constructor
     * @dev Disables initializers on the implementation contract following UUPS proxy pattern best practices
     * @param _agglayerGERL2 Address of the Agglayer Global Exit Root manager L2
     * @param _agglayerBridgeL2 Address of the Agglayer Bridge L2
     */
    constructor(
        IAgglayerGERL2 _agglayerGERL2,
        IAgglayerBridgeL2 _agglayerBridgeL2
    ) {
        if (address(_agglayerGERL2) == address(0)) {
            revert AgglayerGERL2CannotBeZero();
        }

        if (address(_agglayerBridgeL2) == address(0)) {
            revert AgglayerBridgeL2CannotBeZero();
        }

        agglayerGERL2 = _agglayerGERL2;
        agglayerBridgeL2 = _agglayerBridgeL2;
        _disableInitializers();
    }

    ////////////////////
    // Initializer
    ////////////////////

    /**
     * @notice Initializes the contract with initial configuration
     * @dev Can only be called once due to initializer modifier. Sets up the owner, validators, threshold, and proposer
     * @param _owner Owner of the contract, presumably a multisig for governance
     * @param _newProposer Address authorized to propose GER/LER injections
     * @param _newValidators Initial array of oracle validator addresses
     * @param _newThreshold Number of signatures required for GER/LER injection
     */
    function initialize(
        address _owner,
        address _newProposer,
        ValidatorInfo[] memory _newValidators,
        uint256 _newThreshold
    ) external initializer {
        // Validate owner is not zero address
        if (_owner == address(0)) {
            revert OwnerCannotBeZero();
        }

        // Validate proposer is not zero address
        if (_newProposer == address(0)) {
            revert ProposerCannotBeZero();
        }

        // threshold and validators are validated in the internal function _updateValidatorsAndThreshold
        _updateValidatorsAndThreshold(
            new RemoveValidatorInfo[](0), // No validators to remove
            _newValidators,
            _newThreshold
        );

        // Initialize ownership
        __Ownable_init(_owner);

    }

    ////////////////////
    // Oracle Proposer Functions
    ////////////////////

    /**
     * @notice Inject multiple Global Exit Roots (GERs) with signature verification
     * @dev Each GER must be signed by at least `threshold` number of oracle validators
     *      Signatures must be ordered by signer address in ascending order to prevent duplicates
     * @param _globalExitRoot The global exit root to inject into the GER manager
     * @param _signatures Concatenated signatures for the global exit root (65 bytes per signature: r+s+v)
     */
    function injectGER(
        bytes32 _globalExitRoot,
        bytes calldata _signatures
    ) external onlyAggOracleProposer {
        // Validate the GER
        _validateGER(_globalExitRoot, _signatures);

        // Insert the GER into the global exit root manager
        agglayerGERL2.insertGlobalExitRoot(_globalExitRoot);

        emit GERInjected(_globalExitRoot);
    }

    /**
     * @notice Inject multiple Local Exit Roots (LERs) with signature verification
     * @dev Each LER must be signed by at least `threshold` number of oracle validators
     *      Signatures must be ordered by signer address in ascending order to prevent duplicates
     * @param _lerInformation Array of LER information containing rollup index, LER, and agglayer params
     * @param _signatures Array of concatenated signatures for each LER (65 bytes per signature: r+s+v)
     */
    function injectLER(
        LERInformation[] calldata _lerInformation,
        bytes[] calldata _signatures
    ) external onlyAggOracleProposer {
        // Validate input arrays have matching lengths
        if (_lerInformation.length != _signatures.length) {
            revert ArrayLengthMismatch();
        }

        // Process each LER
        for (uint256 i = 0; i < _lerInformation.length; i++) {
            LERInformation calldata lerInfo = _lerInformation[i];
            
            // Validate the LER
            _validateLER(lerInfo.rollupIndex, lerInfo.LER, lerInfo.agglayerParams, _signatures[i]);

            // Emit LER injection event
            // Note: The actual insertion of LER into bridge/GER manager depends on final bridge implementation
            emit LERInjected(
                lerInfo.rollupIndex,
                lerInfo.LER,
                lerInfo.agglayerParams
            );
        }
    }

    ////////////////////
    // Owner Functions
    ////////////////////

    /**
     * @notice Update the oracle proposer address
     * @dev Only callable by the contract owner. Proposer address cannot be zero
     * @param _newProposer New proposer address
     */
    function updateAggOracleProposer(address _newProposer) external onlyOwner {
        // Validate proposer is not zero address
        if (_newProposer == address(0)) {
            revert ProposerCannotBeZero();
        }

        proposer = _newProposer;
        emit UpdateAggOracleProposer(_newProposer);
    }

    /**
     * @notice Transfer the globalExitRootUpdater role to a new address
     * @dev Only callable by the contract owner. This is step 1 of a two-step transfer process
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external onlyOwner {
        agglayerGERL2.transferGlobalExitRootUpdater(_newGlobalExitRootUpdater);
    }

    /**
     * @notice Accept the globalExitRootUpdater role
     * @dev Only callable by the contract owner. This is step 2 of a two-step transfer process
     */
    function acceptGlobalExitRootUpdater() external onlyOwner {
        agglayerGERL2.acceptGlobalExitRootUpdater();
    }

    /**
     * @notice Update the validators and threshold
     * @dev Only callable by the contract owner. Validators and threshold are updated in a single transaction
     * @param _validatorsToRemove Array of validators to remove with their indices (MUST be in descending index order)
     * @param _validatorsToAdd Array of new validators to add with their URLs
     * @param _newThreshold New threshold value
     */
    function updateValidatorsAndThreshold(
        RemoveValidatorInfo[] memory _validatorsToRemove,
        ValidatorInfo[] memory _validatorsToAdd,
        uint256 _newThreshold
    ) external onlyOwner {
        _updateValidatorsAndThreshold(_validatorsToRemove, _validatorsToAdd, _newThreshold);
    }

    ////////////////////
    // Internal Functions
    ////////////////////

    /**
     * @notice Internal function to add an oracle validator
     * @dev Validates that the address is not zero and not already a validator
     * @param _newValidator Address of the new validator
     * @param _url URL of the validator
     */
    function _addValidator(address _newValidator, string memory _url) internal {
        // Validate address is not zero
        if (_newValidator == address(0)) {
            revert ValidatorCannotBeZero();
        }
        
        // Validate address is not already a validator
        if (validatorInfo[_newValidator].isValidator) {
            revert ValidatorAlreadyExists();
        }

        // Add validator to array
        validators.push(_newValidator);
        // Add validator to mapping
        validatorInfo[_newValidator] = ValidatorInternalInfo({
            isValidator: true,
            url: _url
        });
    }

    /**
     * @notice Remove an existing oracle validator
     * @dev Only callable by the contract owner. Uses swap-and-pop pattern for gas-efficient removal
     * @param _oracleValidatorAddress Address of the oracle validator to remove
     * @param _oracleValidatorIndex Index of the validator in the validators array
     */
    function _removeValidator(
        address _oracleValidatorAddress,
        uint256 _oracleValidatorIndex
    ) internal {
        // cache array length
        uint256 validatorsLength = validators.length;

        // Validate index is within bounds
        if (_oracleValidatorIndex >= validatorsLength) {
            revert ValidatorIndexOutOfBounds();
        }

        // Validate address is a current validator
        if (validators[_oracleValidatorIndex] != _oracleValidatorAddress) {
            revert ValidatorIndexMismatch();
        }

        // Remove validator status
        // use delete to remove from mapping
        delete validatorInfo[_oracleValidatorAddress];

        // Remove from array using swap-and-pop pattern
        validators[_oracleValidatorIndex] = validators[validatorsLength - 1];
        validators.pop();
    }

    // internal function to uopdate the threshold
    function _updateThreshold(uint256 _newThreshold) internal {
        // Validate threshold doesn't exceed number of validators
        if (_newThreshold > validators.length) {
            revert ThresholdCannotBeGreaterThanValidators();
        }

        // Validate threshold is not zero
        if (validators.length != 0 && _newThreshold == 0) {
            revert ThresholdCannotBeZeroIfAnyValidatorExists();
        }

        threshold = _newThreshold;
    }

    // new internal function that updates: Validators (either added or removed) and the threshold
    function _updateValidatorsAndThreshold(
        RemoveValidatorInfo[] memory _validatorsToRemove,
        ValidatorInfo[] memory _validatorsToAdd,
        uint256 _newThreshold
    ) internal {
        // Validate descending order of indices for removal to avoid index shifting issues
        // When removing multiple signers, we must process them from highest index to lowest
        if (_validatorsToRemove.length > 1) {
            for (uint256 i = 0; i < _validatorsToRemove.length - 1; i++) {
                if (
                    _validatorsToRemove[i].index <= _validatorsToRemove[i + 1].index
                ) {
                    revert IndicesNotInDescendingOrder();
                }
            }
        }

        // Remove validators (in descending index order to avoid index shifting issues)
        for (uint256 i = 0; i < _validatorsToRemove.length; i++) {
            _removeValidator(_validatorsToRemove[i].addr, _validatorsToRemove[i].index);
        }

        // Add new validators
        for (uint256 i = 0; i < _validatorsToAdd.length; i++) {
            _addValidator(_validatorsToAdd[i].addr, _validatorsToAdd[i].url);
        }

        _updateThreshold(_newThreshold);

        emit ValidatorsAndThresholdUpdated(
            validators,
            threshold
        );
    }

    /**
     * @notice Build message hash for GER verification
     * @dev Virtual function to allow for different hashing schemes in derived contracts
     * @param _globalExitRoot The GER to build message for
     * @return The message hash to be signed by oracle validators
     */
    function _buildGERMessage(
        bytes32 _globalExitRoot
    ) internal pure virtual returns (bytes32) {
        return keccak256(abi.encodePacked(_globalExitRoot));
    }

    /**
     * @notice Validate a GER
     * @dev Validates the GER is not zero and builds the message hash to verify
     * @param _globalExitRoot The GER to validate
     * @param _signatures The signatures to verify
     */
    function _validateGER(
        bytes32 _globalExitRoot,
        bytes memory _signatures
    ) internal view {
        // Validate GER is not zero
        if (_globalExitRoot == bytes32(0)) {
            revert GERCannotBeZero();
        }

        // Build the message hash to verify
        bytes32 messageHash = _buildGERMessage(_globalExitRoot);

        // Verify required number of valid signatures
        _verifySignatures(messageHash, _signatures);
    }

    /**
     * @notice Build message hash for LER verification
     * @dev Virtual function to allow for different hashing schemes in derived contracts
     * @param _rollupIndex The rollup index
     * @param _LER The local exit root
     * @param _agglayerParams The agglayer parameters
     * @return The message hash to be signed by oracle validators
     */
    function _buildLERMessage(
        uint32 _rollupIndex,
        bytes32 _LER,
        bytes memory _agglayerParams
    ) internal pure virtual returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                _rollupIndex,
                _LER,
                _agglayerParams
            )
        );
    }

    /**
     * @notice Validate a LER
     * @dev Validates the LER is not zero and builds the message hash to verify
     * @param _rollupIndex The rollup index
     * @param _LER The local exit root
     * @param _agglayerParams The agglayer parameters
     * @param _signatures The signatures to verify
     */
    function _validateLER(
        uint32 _rollupIndex,
        bytes32 _LER,
        bytes memory _agglayerParams,
        bytes memory _signatures
    ) internal view {
        // Validate LER is not zero
        if (_LER == bytes32(0)) {
            revert LERCannotBeZero();
        }

        // Build the message hash to verify
        bytes32 messageHash = _buildLERMessage(_rollupIndex, _LER, _agglayerParams);

        // Verify required number of valid signatures
        _verifySignatures(messageHash, _signatures);
    }

    /**
     * @notice Verify signatures meet the threshold requirement
     * @notice Heavily based on the Safe multisig implementation: https://github.com/safe-fndn/safe-smart-account/blob/v1.5.0/contracts/Safe.sol#L287
     * @dev Implements signature verification similar to Safe multisig
     *      - Expects tightly packed signatures (r, s, v) where v is 27 or 28
     *      - Requires exactly `threshold` number of signatures
     *      - Signers must be in ascending address order to prevent duplicate signatures
     * @param _messageHash The message hash that was signed
     * @param _signatures Concatenated signatures (65 bytes each: 32 bytes r + 32 bytes s + 1 byte v)
     */
    function _verifySignatures(
        bytes32 _messageHash,
        bytes memory _signatures
    ) internal view {
        // Validate minimum signature length (threshold * 65 bytes per signature)
        if (_signatures.length < threshold * 65) {
            revert InsufficientSignatures();
        }

        address lastValidator = address(0);
        address currentValidator;

        // Verify each required signature
        for (uint256 i = 0; i < threshold; i++) {
            // Extract signature components (v, r, s)
            (uint8 v, bytes32 r, bytes32 s) = _splitSignature(_signatures, i);

            // Recover the signer address from the signature
            currentValidator = ECDSA.recover(_messageHash, v, r, s);

            // Validate signer is an authorized oracle validator
            if (!validatorInfo[currentValidator].isValidator) {
                revert ValidatorDoesNotExist();
            }

            // Validate signers are in ascending order (prevents duplicate signatures)
            if (currentValidator <= lastValidator) {
                revert ValidatorsNotOrdered();
            }

            lastValidator = currentValidator;
        }
    }

    ////////////////////
    // View Functions
    ////////////////////

    function verifyGER(
        bytes32 _globalExitRoot,
        bytes memory _signatures
    ) external view returns (bool) {
        _validateGER(_globalExitRoot, _signatures);
        return true;
    }

    function verifyLER(
        uint32 _rollupIndex,
        bytes32 _LER,
        bytes memory _agglayerParams,
        bytes memory _signatures
    ) external view returns (bool) {
        _validateLER(_rollupIndex, _LER, _agglayerParams, _signatures);
        return true;
    }

    /**
     * @notice Returns the index of an oracle validator in the validators array
     * @dev Reverts if the validator is not found. Used for off-chain index lookups
     * @param _validator Oracle validator address to search for
     * @return The index of the oracle validator
     */
    function getValidatorIndex(
        address _validator
    ) external view returns (uint256) {
        for (uint256 i = 0; i < validators.length; ++i) {
            if (validators[i] == _validator) {
                return i;
            }
        }
        revert ValidatorNotFound();
    }

    /**
     * @notice Returns all oracle validator addresses
     * @dev Returns a memory copy of the entire validators array
     * @return Array of all oracle validator addresses
     */
    function getValidatorsInfo() external view returns (ValidatorInfo[] memory) {
        ValidatorInfo[] memory validatorInfos = new ValidatorInfo[](validators.length);
        for (uint256 i = 0; i < validators.length; i++) {
            validatorInfos[i] = ValidatorInfo({
                addr: validators[i],
                url: validatorInfo[validators[i]].url
            });
        }
        return validatorInfos;
    }

    /**
     * @notice Returns the total number of oracle validators
     * @dev More gas-efficient than calling getValidatorsInfo() for just the count
     * @return The count of oracle validators
     */
    function getValidatorsCount() external view returns (uint256) {
        return validators.length;
    }

    /**
     * @notice Returns the version of the contract
     * @dev Returns the version of the contract
     * @return The version of the contract
     */
    function version() external pure returns (string memory) {
        return VERSION_AGG_ORACLE_COMMITTEE_V2;
    }

    /**
     * @notice Returns if an address is a validator
     * @dev Returns if an address is a validator
     * @param _validator The address to check
     * @return True if the address is a validator
     */
    function isValidator(address _validator) external view returns (bool) {
        return validatorInfo[_validator].isValidator;
    }
}
