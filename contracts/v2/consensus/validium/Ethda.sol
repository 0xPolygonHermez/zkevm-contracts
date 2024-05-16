// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../../interfaces/IPolygonDataCommitteeErrors.sol";
import "../../interfaces/IDataAvailabilityProtocol.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/*
 * Contract responsible managing the data committee that will verify that the data sent for a validium is singed by a committee
 * It is advised to give the owner of the contract to a timelock contract once the data committee is set
 */
contract Ethda is IDataAvailabilityProtocol, OwnableUpgradeable {
    // Address of the ethda sequencer
    address public ethdaSequencerAddress;

    // Name of the data availability protocol
    string internal constant _PROTOCOL_NAME = "Ethda";

    // Size of a signature in bytes
    uint256 internal constant _SIGNATURE_SIZE = 65;

    // Size of a hash in bytes
    uint256 internal constant _HASH_SIZE = 32;

    /**
     * @dev Thrown when the da signer is not ethda sequencer address
     */
    error WrongSignature();

    /**
     * @dev Thrown when the addresses and signatures byte array length has an unexpected size
     */
    error UnexpectedAddrsAndSignaturesSize();

    /**
     * Disable initalizers on the implementation following the best practices
     */
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        ethdaSequencerAddress = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

        // Initialize OZ contracts
        __Ownable_init_unchained();
    }

    function setEthdaSequencerAddress(
        address _ethdaSequencerAddress
    ) public onlyOwner {
        ethdaSequencerAddress = _ethdaSequencerAddress;
    }

    /**
     * @notice Verifies that the given signedHash has been signed by requiredAmountOfSignatures committee members
     * @param signedHash Hash that must have been signed by requiredAmountOfSignatures of committee members
     * @param signaturesAndAddrs Byte array containing the signatures and all the addresses of the committee in ascending order
     * [signature 0, ..., signature requiredAmountOfSignatures -1, address 0, ... address N]
     * note that each ECDSA signatures are used, therefore each one must be 65 bytes
     */
    function verifyMessage(
        bytes32 signedHash,
        bytes calldata signaturesAndAddrs
    ) external view {
        // pre-check: byte array size
        uint256 splitByte = _SIGNATURE_SIZE;
        if (
            signaturesAndAddrs.length < splitByte ||
            (signaturesAndAddrs.length - splitByte) % _HASH_SIZE != 0
        ) {
            revert UnexpectedAddrsAndSignaturesSize();
        }

        // Recover sequencerAddress from the signature
        address signer = ECDSA.recover(
            signedHash,
            signaturesAndAddrs[:_SIGNATURE_SIZE]
        );

        if (signer != ethdaSequencerAddress) {
            revert WrongSignature();
        }
    }

    /**
     * @notice Return the protocol name
     */
    function getProcotolName() external pure override returns (string memory) {
        return _PROTOCOL_NAME;
    }
}
