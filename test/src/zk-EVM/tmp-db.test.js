const { buildPoseidon } = require('circomlibjs');
const { Scalar } = require('ffjavascript');

const { expect } = require('chai');
const ethers = require('ethers');

const MemDB = require('../../../src/zk-EVM/zkproverjs/memdb');
const SMT = require('../../../src/zk-EVM/zkproverjs/smt');
const smtUtils = require('../../../src/zk-EVM/helpers/smt-utils');
const smtKeyUtils = require('../../../src/zk-EVM/helpers/smt-key-utils');

const TmpDB = require('../../../src/zk-EVM/tmp-db');

describe('Tmp Db Test', () => {
    let poseidon;
    let F;

    before(async () => {
        poseidon = await buildPoseidon();
        F = poseidon.F;
    });

    it('Check that tmpDB gets the state from srcDb', async () => {
        const arity = 4;
        const address = '0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D';
        const balance = Scalar.e(ethers.utils.parseEther('100'));

        const db = new MemDB(F);
        const smt = new SMT(db, arity, poseidon, poseidon.F);

        // create TmpDB
        const tmpDB = new TmpDB(db);

        // load smtTMp
        const smtTmp = new SMT(tmpDB, arity, poseidon, poseidon.F);

        const keyBalance = await smtKeyUtils.keyEthAddrBalance(address, smt.arity);
        const zeroRoot = F.zero;

        const auxRes = await smt.set(zeroRoot, keyBalance, balance);
        const genesisRoot = auxRes.newRoot;

        const resBalance = await smt.get(genesisRoot, keyBalance);
        const resBalanceTmp = await smtTmp.get(genesisRoot, keyBalance);

        expect(resBalance).to.be.deep.equal(resBalanceTmp);
    });

    it('Update and populate memDB with tmpDb', async () => {
        const arity = 4;
        const address = '0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D';
        const balance = Scalar.e(ethers.utils.parseEther('100'));

        const db = new MemDB(F);
        const smt = new SMT(db, arity, poseidon, poseidon.F);

        // create TmpDB
        const tmpDB = new TmpDB(db);

        // load smtTMp
        const smtTmp = new SMT(tmpDB, arity, poseidon, poseidon.F);

        const keyBalance = await smtKeyUtils.keyEthAddrBalance(address, smt.arity);
        const zeroRoot = F.zero;

        const auxRes = await smtTmp.set(zeroRoot, keyBalance, balance);
        const genesisRoot = auxRes.newRoot;

        let resBalance;
        try {
            resBalance = await smt.get(genesisRoot, keyBalance);
        } catch (error) {
            resBalance = { value: Scalar.e(0) };
        }
        const resBalanceTmp = await smtTmp.get(genesisRoot, keyBalance);

        expect(resBalance.value).to.be.equal(Scalar.e(0));
        expect(resBalanceTmp.value).to.be.equal(balance);

        // populate db with the content of the tmpDb
        await tmpDB.populateSrcDb();

        let resBalance2;
        try {
            resBalance2 = await smt.get(genesisRoot, keyBalance);
        } catch (error) {
            resBalance2 = { value: Scalar.e(0) };
        }
        const resBalance2Tmp = await smtTmp.get(genesisRoot, keyBalance);

        const tempDBArray = await smtUtils.getCurrentDB(genesisRoot, tmpDB, F);
        const DBArray = await smtUtils.getCurrentDB(genesisRoot, db, F);

        expect(resBalance2Tmp.value).to.be.equal(balance);
        expect(resBalance2Tmp.value.toString()).to.be.equal(resBalance2.value.toString());
        expect(tempDBArray).to.be.deep.equal(DBArray);
    });
});
