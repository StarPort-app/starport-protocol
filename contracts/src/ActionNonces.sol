// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @dev Wallet-called actions only; scoped to this contract and caller, not API idempotency keys.
abstract contract ActionNonces {
    error NonceUsed();
    error InvalidNonceMask();
    mapping(address => mapping(uint256 => uint256)) private nonceWords;
    event NoncesInvalidated(address indexed owner, uint256 indexed word, uint256 mask);
    function isNonceUsed(address owner, uint256 nonce) public view returns (bool) {
        return nonceWords[owner][nonce >> 8] & (uint256(1) << (nonce & 255)) != 0;
    }
    function invalidateNonces(uint256 word, uint256 mask) external {
        if (mask == 0) revert InvalidNonceMask();
        nonceWords[msg.sender][word] |= mask;
        emit NoncesInvalidated(msg.sender, word, mask);
    }
    function _consumeNonce(uint256 nonce) internal {
        if (isNonceUsed(msg.sender, nonce)) revert NonceUsed();
        nonceWords[msg.sender][nonce >> 8] |= uint256(1) << (nonce & 255);
    }
}
