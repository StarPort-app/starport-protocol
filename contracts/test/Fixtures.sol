// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
contract FixtureAsset {
    mapping(address => uint256) public balanceOf;
    bool public failTransfers;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function setFailure(bool value) external { failTransfers = value; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(!failTransfers, "fixture transfer failure");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
}
contract FixtureEscrow {
    mapping(address => mapping(address => uint256)) public balanceOfToken;
    function credit(address recipient, address token, uint256 amount) external {
        FixtureAsset(token).mint(address(this), amount); balanceOfToken[recipient][token] += amount;
    }
    function claimToken(address token) external {
        uint256 amount = balanceOfToken[msg.sender][token]; balanceOfToken[msg.sender][token] = 0;
        FixtureAsset(token).transfer(msg.sender, amount);
    }
}
contract FixtureFactory {
    mapping(address => address) public recipients;
    function set(address token, address recipient) external { recipients[token] = recipient; }
    function transferCreatorFeeRecipient(address token, address recipient) external {
        require(recipients[token] == msg.sender, "not recipient"); recipients[token] = recipient;
    }
}
contract FixtureTransferTaxAsset {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }
}
