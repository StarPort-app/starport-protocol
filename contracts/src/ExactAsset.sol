// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IExactAsset {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @dev Exact accounting only. Transfer-tax/rebasing assets are not supported.
library ExactAsset {
    error UnsupportedTransfer();
    function move(address asset, address from, address to, uint256 amount, bool pull) internal {
        if (amount == 0 || from == to || to == address(0)) revert UnsupportedTransfer();
        uint256 beforeFrom = IExactAsset(asset).balanceOf(from);
        uint256 beforeTo = IExactAsset(asset).balanceOf(to);
        bytes memory callData = pull
            ? abi.encodeCall(IExactAsset.transferFrom, (from, to, amount))
            : abi.encodeCall(IExactAsset.transfer, (to, amount));
        (bool ok, bytes memory data) = asset.call(callData);
        if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert UnsupportedTransfer();
        if (beforeFrom < amount || IExactAsset(asset).balanceOf(from) != beforeFrom - amount
            || IExactAsset(asset).balanceOf(to) != beforeTo + amount) revert UnsupportedTransfer();
    }
}

abstract contract GuardedEntry {
    error ReentrantCall();
    uint256 private entered;
    modifier nonReentrant() { if (entered != 0) revert ReentrantCall(); entered = 1; _; entered = 0; }
}
