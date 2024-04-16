import {ethers} from "ethers";
import {join} from "path";
import * as kzg from "c-kzg";
import {BlobEIP4844Transaction} from "@ethereumjs/tx";
import {Common, Hardfork} from "@ethereumjs/common";

const BYTES_PER_FIELD_ELEMENT = 32;
const FIELD_ELEMENTS_PER_BLOB = 4096;
const USEFUL_BYTES_PER_BLOB = 32 * FIELD_ELEMENTS_PER_BLOB;
const MAX_BLOBS_PER_TX = 2;
const MAX_USEFUL_BYTES_PER_TX = USEFUL_BYTES_PER_BLOB * MAX_BLOBS_PER_TX - 1;
const BLOB_SIZE = BYTES_PER_FIELD_ELEMENT * FIELD_ELEMENTS_PER_BLOB;

const {blobToKzgCommitment, computeBlobKzgProof, computeKzgProof, loadTrustedSetup} = kzg;

// ensure that the trusted setup is loaded, required to perform any kzg operations
loadTrustedSetup(join(__dirname, "trusted_setup.txt"));

export class BlobUtils {
    private provider: ethers.Provider;
    private signer: ethers.Signer;

    constructor(_provider: ethers.JsonRpcProvider, _signer: ethers.Signer) {
        this.provider = _provider;
        this.signer = _signer;
    }

    async generateRawBlobTransaction(
        blobData: string | Uint8Array,
        {
            chainId,
            nonce,
            to,
            value,
            data,
            maxPriorityFeePerGas,
            maxFeePerGas,
            gasLimit,
            maxFeePerBlobGas,
        } = {} as ethers.TransactionLike
    ) {
        if (!chainId) chainId = (await this.provider.getNetwork()).chainId;
        if (!nonce) nonce = await this.provider.getTransactionCount(await this.signer.getAddress());
        if (!value) value = 0n;
        data = data ?? "0x";

        // if (!maxFeePerGas) {
        //   maxFeePerGas = await this.provider.estimateGas({
        //     from: await this.signer.getAddress(),
        //     to,
        //     data,
        //     value
        //   })
        //   console.log('estimated', maxFeePerGas)
        //   if (!maxFeePerGas) {
        //     throw new Error('execution reverted')
        //   }
        // }

        maxFeePerGas = maxFeePerGas || ethers.parseUnits("10", "gwei");
        maxFeePerBlobGas = maxFeePerBlobGas || ethers.parseUnits("2000", "gwei");

        to = to ?? ethers.ZeroAddress;
        gasLimit = gasLimit || 21000n;
        maxPriorityFeePerGas = maxPriorityFeePerGas ?? ethers.parseUnits("10", "gwei");

        const {blobs, blobVersionedHashes, kzgCommitments, kzgProofs} = BlobUtils.getBlobs(blobData);

        const blobTxn = new BlobEIP4844Transaction(
            {
                chainId,
                nonce,
                to,
                value,
                data,
                maxPriorityFeePerGas,
                maxFeePerGas,
                gasLimit,
                maxFeePerBlobGas,
                blobVersionedHashes,
                blobs,
                kzgCommitments,
                kzgProofs,
            },
            {
                common: Common.custom(
                    {
                        chainId,
                    },
                    {
                        customCrypto: {kzg: kzg as any},
                        hardfork: Hardfork.Cancun,
                    }
                ),
            }
        ).sign(ethers.getBytes((this.signer as ethers.Wallet).privateKey));

        const signedSerializedTxn = ethers.hexlify(blobTxn.serializeNetworkWrapper());

        return {
            signedSerializedTxn,
            blobs,
            blobVersionedHashes,
            kzgCommitments,
            kzgProofs,
        };
    }

    public static getBlobs(blobData: string | Uint8Array, blobCommitmentVersion = 1) {
        const data = ethers.getBytes(blobData);
        const length = data.length;

        let blobIndex = 0;
        let fieldIndex = -1;

        const blobs = [new Uint8Array(BLOB_SIZE).fill(0)];
        for (let i = 0; i < length; i += 31) {
            if (++fieldIndex === FIELD_ELEMENTS_PER_BLOB) {
                blobs.push(new Uint8Array(BLOB_SIZE).fill(0));
                blobIndex++;
                fieldIndex = 0;
            }
            blobs[blobIndex].set(data.subarray(i, Math.min(i + 31, length)), fieldIndex * 32 + 1);
        }

        const kzgCommitments = blobs.map(blobToKzgCommitment);
        const blobVersionedHashes = kzgCommitments.map((c) => BlobUtils.computeVersionedHash(c, blobCommitmentVersion));
        const kzgProofs = blobs.map((b, idx) => computeBlobKzgProof(b, kzgCommitments[idx]));

        return {blobs, blobVersionedHashes, kzgCommitments, kzgProofs};
    }

    public static computeVersionedHash(commitment: Uint8Array, blobCommitmentVersion: number) {
        const computedVersionedHash = new Uint8Array(32);
        computedVersionedHash.set([blobCommitmentVersion], 0);
        const hash = ethers.getBytes(ethers.sha256(commitment));
        computedVersionedHash.set(hash.subarray(1), 1);
        return computedVersionedHash;
    }

    public static computeKzgProof(blob: Uint8Array | string, fieldIndex: Uint8Array | string) {
        const proof = computeKzgProof(ethers.getBytes(blob), ethers.getBytes(fieldIndex));
        return [ethers.hexlify(proof[0]), ethers.hexlify(proof[1])];
    }
}
