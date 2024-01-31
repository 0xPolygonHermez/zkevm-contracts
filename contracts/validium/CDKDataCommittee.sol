// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "./interfaces/ICDKDataCommitteeErrors.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract CDKDataCommittee is
ICDKDataCommitteeErrors, OwnableUpgradeable {
    /**
     * @notice Struct which will store all the data of the committee members
     * @param url string that represents the URL of the member to be used to access the data
     * @param addr address of the member that will be used to sign
     */
    struct Member {
        string url;
        address addr;
    }

    // Size of a signature in bytes
    uint internal constant _SIGNATURE_SIZE = 65;
    // Size of an address in bytes
    uint internal constant _ADDR_SIZE = 20;

    // Specifies the required amount of signatures from members in the data availability committee
    uint public requiredAmountOfSignatures;

    // Hash of the addresses of the committee
    bytes32 public committeeHash;

    // Register of the members of the committee
    Member[] public members;

    /**
     * @dev Emitted when the committee is updated
     * @param committeeHash hash of the addresses of the committee members
     */
    event CommitteeUpdated(bytes32 committeeHash);

    function initialize() external initializer {
        // Initialize OZ contracts
        __Ownable_init_unchained();
    }

    /**
     * @notice Allows the admin to setup the members of the committee. Note that:
     * The system will require N / M signatures where N => _requiredAmountOfSignatures and M => urls.length
     * There must be the same amount of urls than addressess encoded in the addrsBytes
     * A member is represented by the url and the address contained in urls[i] and addrsBytes[i*_ADDR_SIZE : i*_ADDR_SIZE + _ADDR_SIZE]
     * @param _requiredAmountOfSignatures Required amount of signatures
     * @param urls List of urls of the members of the committee
     * @param addrsBytes Byte array that contains the addressess of the members of the committee
     */
    function setupCommittee(
        uint _requiredAmountOfSignatures,
        string[] calldata urls,
        bytes calldata addrsBytes
    ) external onlyOwner {
        uint membersLength = urls.length;
        if (membersLength <  _requiredAmountOfSignatures) {
            revert TooManyRequiredSignatures();
        }
        if (addrsBytes.length != membersLength * _ADDR_SIZE) {
            revert UnexpectedAddrsBytesLength();
        }

        delete members;
        address lastAddr;
        for (uint i = 0; i < membersLength; i++) {
            uint currentAddresStartingByte = i * _ADDR_SIZE;
            address currentMemberAddr = address(bytes20(addrsBytes[
                        currentAddresStartingByte :
                        currentAddresStartingByte + _ADDR_SIZE
            ]));
            if (bytes(urls[i]).length == 0) {
                revert EmptyURLNotAllowed();
            }
            if (lastAddr >= currentMemberAddr) {
                revert WrongAddrOrder();
            }
            lastAddr = currentMemberAddr;
            members.push(Member({
                url: urls[i],
                addr: currentMemberAddr
            }));
        }
        committeeHash = keccak256(addrsBytes);
        requiredAmountOfSignatures = _requiredAmountOfSignatures;
        emit CommitteeUpdated(committeeHash);
    }

    function getAmountOfMembers() public view returns(uint256) {
        return members.length;
    }

    /**
     * @notice Verifies that the given signedHash has been signed by requiredAmountOfSignatures committee members
     * @param signedHash Hash that must have been signed by requiredAmountOfSignatures of committee members
     * @param signaturesAndAddrs Byte array containing the signatures and all the addresses of the committee in ascending order
     * [signature 0, ..., signature requiredAmountOfSignatures -1, address 0, ... address N]
     * note that each ECDSA signatures are used, therefore each one must be 65 bytes
     */
    function verifySignatures(
        bytes32 signedHash,
        bytes calldata signaturesAndAddrs
    ) external view {
        // pre-check: byte array size
        uint splitByte = _SIGNATURE_SIZE * requiredAmountOfSignatures;
        if(
            signaturesAndAddrs.length < splitByte ||
            (signaturesAndAddrs.length - splitByte) % _ADDR_SIZE != 0
        ) {
            revert UnexpectedAddrsAndSignaturesSize();
        }

        // hash the addresses part of the byte array and check that it's equal to committe hash
        if (
            keccak256(signaturesAndAddrs[splitByte:]) != 
            committeeHash
        ) {
            revert UnexpectedCommitteeHash();
        }

        // recover addresses from signatures and check that are part of the committee
        uint lastAddrIndexUsed;
        uint addrsLen = (signaturesAndAddrs.length - splitByte) / _ADDR_SIZE;
        for (uint i = 0; i < requiredAmountOfSignatures; i++) {
            address currentSigner = ECDSA.recover(
                signedHash,
                signaturesAndAddrs[i*_SIGNATURE_SIZE : i*_SIGNATURE_SIZE + _SIGNATURE_SIZE]
            );
            bool currentSignerIsPartOfCommittee = false;
            for (uint j = lastAddrIndexUsed; j < addrsLen; j++) {
                uint currentAddresStartingByte = splitByte + j*_ADDR_SIZE;
                address committeeAddr = address(bytes20(signaturesAndAddrs[
                    currentAddresStartingByte :
                    currentAddresStartingByte + _ADDR_SIZE
                ]));
                if (committeeAddr == currentSigner) {
                    lastAddrIndexUsed = j+1;
                    currentSignerIsPartOfCommittee = true;
                    break;
                }
            }
            if (!currentSignerIsPartOfCommittee) {
                revert CommitteeAddressDoesntExist();
            }
        }
    }
}