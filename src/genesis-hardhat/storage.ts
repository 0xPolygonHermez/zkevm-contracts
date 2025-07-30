/// ///////////////////////////////
///   TIMELOCK STORAGE   /////////
/// //////////////////////////////

const TIMELOCK = {
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L27
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/access/AccessControl.sol#L55
    ROLES_MAPPING: "0x0000000000000000000000000000000000000000000000000000000000000000",
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L34
    MINDELAY: "0x0000000000000000000000000000000000000000000000000000000000000002",
};

export const STORAGE_GENESIS = {
    TIMELOCK
};