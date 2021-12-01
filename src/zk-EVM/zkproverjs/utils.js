const { Scalar } = require('ffjavascript');

exports.scalar2fea = function s2fea(F, scalar) {
    scalar = Scalar.e(scalar);
    const r0 = Scalar.band(scalar, Scalar.e('0xFFFFFFFFFFFFFFFF'));
    const r1 = Scalar.band(Scalar.shr(scalar, 64), Scalar.e('0xFFFFFFFFFFFFFFFF'));
    const r2 = Scalar.band(Scalar.shr(scalar, 128), Scalar.e('0xFFFFFFFFFFFFFFFF'));
    const r3 = Scalar.band(Scalar.shr(scalar, 192), Scalar.e('0xFFFFFFFFFFFFFFFF'));
    return [F.e(r0), F.e(r1), F.e(r2), F.e(r3)];
};

exports.fea2scalar = function fea2scalar(F, arr) {
    let res = F.toObject(arr[0]);
    res = Scalar.add(res, Scalar.shl(F.toObject(arr[1]), 64));
    res = Scalar.add(res, Scalar.shl(F.toObject(arr[2]), 128));
    res = Scalar.add(res, Scalar.shl(F.toObject(arr[3]), 192));
    return res;
};

// Field Element to Number
exports.fe2n = function fe2n(Fr, fe) {
    const maxInt = Scalar.e('0x7FFFFFFF');
    const minInt = Scalar.sub(Fr.p, Scalar.e('0x80000000'));
    const o = Fr.toObject(fe);
    if (Scalar.gt(o, maxInt)) {
        const on = Scalar.sub(Fr.p, o);
        if (Scalar.gt(o, minInt)) {
            return -Scalar.toNumber(on);
        }
        throw new Error(`Accessing a no 32bit value: ${ctx.ln}`);
    } else {
        return Scalar.toNumber(o);
    }
};

exports.log2 = function log2(V) {
    return (((V & 0xFFFF0000) !== 0 ? (V &= 0xFFFF0000, 16) : 0) | ((V & 0xFF00FF00) !== 0 ? (V &= 0xFF00FF00, 8) : 0) | ((V & 0xF0F0F0F0) !== 0 ? (V &= 0xF0F0F0F0, 4) : 0) | ((V & 0xCCCCCCCC) !== 0 ? (V &= 0xCCCCCCCC, 2) : 0) | ((V & 0xAAAAAAAA) !== 0));
};
