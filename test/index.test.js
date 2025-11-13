/* eslint-disable no-restricted-syntax */
const { expect } = require('chai');
const index = require('../index');

describe('should export index', () => {
    it('should validate all abi exports', async () => {
        for (const file of Object.keys(index)) {
            expect(index[file]).to.be.an('object');
            expect(index[file]).to.have.property('abi');
        }
    });
});
