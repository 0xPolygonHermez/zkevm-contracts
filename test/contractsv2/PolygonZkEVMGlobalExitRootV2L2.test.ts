/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers} from "hardhat";
import {PolygonZkEVMGlobalExitRootV2L2} from "../../typechain-types";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

describe("Polygon Global Exit Root v2 L2", () => {
    let deployer: HardhatEthersSigner;
    let bridge: HardhatEthersSigner;
    let globalExitRootSetterSigner: HardhatEthersSigner;
    let randomSigner: HardhatEthersSigner;

    let globalExitRootL2: PolygonZkEVMGlobalExitRootV2L2;

    const globalExitRootSetterRole = ethers.id("GLOBAL_EXIT_ROOT_SETTER_ROLE");
    const globalExitRootSetterAdminRole = ethers.id("GLOBAL_EXIT_ROOT_SETTER_ROLE_ADMIN");

    beforeEach("Deploy contract", async () => {
        [deployer, bridge, globalExitRootSetterSigner, randomSigner] = await ethers.getSigners();

        const PolygonZkEVMGlobalExitRootV2L2Factory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2L2");
        globalExitRootL2 = await PolygonZkEVMGlobalExitRootV2L2Factory.connect(deployer).deploy(bridge.address);

        // grant setter role
        await globalExitRootL2
            .connect(deployer)
            .grantRole(globalExitRootSetterRole, globalExitRootSetterSigner.address);
    });

    it("should check the initialized parameters", async () => {
        expect(await globalExitRootL2.bridgeAddress()).to.be.equal(bridge.address);
    });

    describe("updateExitRoot", () => {
        it("should revert if non-bridge address tries to update exit root", async () => {
            // non-bridge address shouldn't be able
            const root = ethers.id("root 1");

            await expect(globalExitRootL2.connect(randomSigner).updateExitRoot(root)).to.be.revertedWithCustomError(
                globalExitRootL2,
                "OnlyAllowedContracts()"
            );
        });

        it("should update exit root if set by bridge", async () => {
            const current = await globalExitRootL2.lastRollupExitRoot();
            const next = ethers.id("root 2");
            expect(next).to.not.eq(current);
            await globalExitRootL2.connect(bridge).updateExitRoot(next);

            const newRoot = await globalExitRootL2.lastRollupExitRoot();
            expect(newRoot).to.equal(next);
        });
    });

    describe("updateGlobalExitRoot", () => {
        it("should revert if unauthorized user tries to set global exit root", async () => {
            const root = ethers.id("root 3");
            await expect(
                globalExitRootL2.connect(randomSigner).updateGlobalExitRoot(root)
            ).to.be.revertedWithCustomError(globalExitRootL2, "AddressDoNotHaveRequiredRole");
        });

        it("should update global exit root if called by authorized user", async () => {
            const root = ethers.id("root 4");
            const currentTimestamp = await globalExitRootL2.globalExitRootMap(root);
            expect(currentTimestamp).to.eq(0);

            await globalExitRootL2.connect(globalExitRootSetterSigner).updateGlobalExitRoot(root);
            const newTimestamp = await globalExitRootL2.globalExitRootMap(root);
            expect(newTimestamp).to.not.eq(0);
        });
    });

    describe("auth", () => {
        it("should let admin create or remove new admins", async () => {
            const toAdmin = randomSigner.address;
            const isAdmin = await globalExitRootL2.hasRole(globalExitRootSetterAdminRole, toAdmin);
            expect(isAdmin).to.eq(false);

            // grant admin
            await globalExitRootL2.connect(deployer).grantRole(globalExitRootSetterAdminRole, toAdmin);
            const isAdminAfter = await globalExitRootL2.hasRole(globalExitRootSetterAdminRole, toAdmin);
            expect(isAdminAfter).to.eq(true);

            // revoke admin
            await globalExitRootL2.connect(deployer).revokeRole(globalExitRootSetterAdminRole, toAdmin);
            const isAdminAfterRevoke = await globalExitRootL2.hasRole(globalExitRootSetterAdminRole, toAdmin);
            expect(isAdminAfterRevoke).to.eq(false);
        });

        it("should let admin create or remove new global exit root setters", async () => {
            const toSetter = randomSigner.address;
            const isSetter = await globalExitRootL2.hasRole(globalExitRootSetterRole, toSetter);
            expect(isSetter).to.eq(false);

            // grant setter
            await globalExitRootL2.connect(deployer).grantRole(globalExitRootSetterRole, toSetter);
            const isSetterAfter = await globalExitRootL2.hasRole(globalExitRootSetterRole, toSetter);
            expect(isSetterAfter).to.eq(true);

            // revoke setter
            await globalExitRootL2.connect(deployer).revokeRole(globalExitRootSetterRole, toSetter);
            const isSetterAfterRevoke = await globalExitRootL2.hasRole(globalExitRootSetterRole, toSetter);
            expect(isSetterAfterRevoke).to.eq(false);
        });

        it("should not let setters create or remove other setters", async () => {
            const toSetter = randomSigner.address;
            const isSetter = await globalExitRootL2.hasRole(globalExitRootSetterRole, toSetter);
            expect(isSetter).to.eq(false);

            await expect(
                globalExitRootL2.connect(globalExitRootSetterSigner).grantRole(globalExitRootSetterRole, toSetter)
            ).to.be.revertedWithCustomError(globalExitRootL2, "AddressDoNotHaveRequiredRole");
            expect(await globalExitRootL2.hasRole(globalExitRootSetterRole, toSetter)).to.eq(false);

            // grant setter with admin
            await globalExitRootL2.connect(deployer).grantRole(globalExitRootSetterRole, toSetter);
            expect(await globalExitRootL2.hasRole(globalExitRootSetterRole, toSetter)).to.eq(true);

            // setter cannot remove other setter
            await expect(
                globalExitRootL2.connect(globalExitRootSetterSigner).revokeRole(globalExitRootSetterRole, toSetter)
            ).to.be.revertedWithCustomError(globalExitRootL2, "AddressDoNotHaveRequiredRole");
        });
    });
});
