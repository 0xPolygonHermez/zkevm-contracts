const ethers = require('ethers');

module.exports.DB_LastBatch = ethers.utils.id(('Rollup_DB_LastBatch'));
module.exports.DB_Batch = ethers.utils.id(('Rollup_DB_Batch'));
module.exports.DB_ChainID = ethers.utils.id(('Rollup_DB_ChainID'));
module.exports.DB_Arity = ethers.utils.id(('Rollup_DB_Arity'));

module.exports.defaultChainID = 0;
module.exports.defaultArity = 4;

module.exports.constantBalance = 0;
module.exports.constantNonce = 1;

module.exports.genericChainID = 1;
