// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Yalnız test: güvenli devri kabul eden (ERC-721 alıcısı) sözleşme. kabul=false ise yanlış cevap döner.
contract GenesisAlici {
    bool public kabul;
    uint256 public sonToken;

    constructor(bool kabul_) {
        kabul = kabul_;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        sonToken = tokenId;
        return kabul ? this.onERC721Received.selector : bytes4(0xdeadbeef);
    }
}
