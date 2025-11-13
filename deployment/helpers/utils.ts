/* eslint-disable no-extend-native */
Object.defineProperty(BigInt.prototype, 'toJSON', {
    get() {
        return () => String(this);
    },
});
