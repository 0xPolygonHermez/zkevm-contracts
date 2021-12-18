const ethers = require('ethers');

module.exports.DB_LastBatch = ethers.utils.id(('Rollup_DB_LastBatch')).slice(0, -6);
module.exports.DB_StateRoot = ethers.utils.id(('Rollup_DB_StateRoot')).slice(0, -6);
module.exports.DB_LocalExitRoot = ethers.utils.id(('Rollup_DB_LocalExitRoot')).slice(0, -6);
module.exports.DB_GlobalExitRoot = ethers.utils.id(('Rollup_DB_GlobalExitRoot')).slice(0, -6);

module.exports.DB_SeqChainID = ethers.utils.id(('Rollup_DB_SeqChainID')).slice(0, -6);
module.exports.DB_Arity = ethers.utils.id(('Rollup_DB_Arity')).slice(0, -6);

module.exports.defaultSeqChainID = 100000;
module.exports.defaultArity = 4;

module.exports.constantBalance = 0;
module.exports.constantNonce = 1;

module.exports.defaultMaxTx = 100;
