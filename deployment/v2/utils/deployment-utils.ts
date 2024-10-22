const padTo32Bytes = (value) => {
    const hexValue = value.startsWith("0x") ? value.slice(2) : value; // Remove '0x'
    return "0x" + hexValue.padStart(64, "0"); // Pad to 64 hex digits
};

export {
    padTo32Bytes
}