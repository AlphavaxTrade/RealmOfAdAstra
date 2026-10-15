// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

/// @title Realm of AdAstra — Genesis NFT (Sezon 1)
/// @notice Oyunda Genesis Yolu'nu tamamlayan oyuncuya (şartlar, 18 eser uyandırma, 3 yıllık ayrıcalık maliyeti önden, mühür bedeli)
/// oyunun verdiği numarayla (1..SEASON_CAP) basılır. Standart ERC-721: satılabilir, devredilebilir.
/// Ayrıcalıklar (trade uygulamasında süresiz Uydu ve Gözlemevi indirimi, Universe'de gezegen satın alma hakkı, stake ödül çarpanı)
/// NFT'nin O ANKİ sahibine aittir; satılırsa alıcıya geçer. Bedel oyunda ödenir: sözleşme para tutmaz ve paraya dokunmaz.
/// Basımı yalnız "minter" (oyun sunucusunun basım anahtarı) yapar. Sezon tavanı kuruluşta sabitlenir: sahip anahtarı çalınsa
/// bile tavanı aşan ya da aynı numarayı ikinci kez taşıyan Genesis basılamaz. Sahiplik iki adımda devredilir (donanım cüzdanına).
contract GenesisNFT {
    string public constant name = "RoA Genesis";
    string public constant symbol = "ROAG";
    uint256 public constant MAX_SEASON_CAP = 10000;
    uint256 public immutable SEASON_CAP;

    address public owner;
    address public pendingOwner;
    address public minter;
    uint256 public totalSupply;
    string private _baseURI;
    bool public baseURIFrozen;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approvals;
    mapping(address => mapping(address => bool)) private _operators;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event MinterChanged(address indexed previousMinter, address indexed newMinter);
    event BaseURIChanged(string baseURI);
    event BaseURIFrozenForever();
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotPendingOwner();
    error NotMinter();
    error NotAuthorized();
    error ZeroAddress();
    error BadSeasonCap(uint256 cap);
    error BadTokenId(uint256 tokenId);
    error AlreadyMinted(uint256 tokenId);
    error NonexistentToken(uint256 tokenId);
    error WrongFrom();
    error UnsafeRecipient();
    error Frozen();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 seasonCap, address minter_, string memory baseURI_) {
        if (seasonCap == 0 || seasonCap > MAX_SEASON_CAP) revert BadSeasonCap(seasonCap);
        if (minter_ == address(0)) revert ZeroAddress();
        SEASON_CAP = seasonCap;
        owner = msg.sender;
        minter = minter_;
        _baseURI = baseURI_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit MinterChanged(address(0), minter_);
        emit BaseURIChanged(baseURI_);
    }

    // ── ERC-165 / ERC-721 / ERC-721 Metadata ─────────────────────────────────
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7      // ERC-165
            || interfaceId == 0x80ac58cd      // ERC-721
            || interfaceId == 0x5b5e139f;     // ERC-721 Metadata
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address tokenOwner) {
        tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert NonexistentToken(tokenId);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return string.concat(_baseURI, _toString(tokenId));
    }

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        if (msg.sender != tokenOwner && !_operators[tokenOwner][msg.sender]) revert NotAuthorized();
        _approvals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        ownerOf(tokenId);
        return _approvals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operators[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address tokenOwner, address operator) external view returns (bool) {
        return _operators[tokenOwner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address tokenOwner = ownerOf(tokenId);
        if (tokenOwner != from) revert WrongFrom();
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender != tokenOwner && !_operators[tokenOwner][msg.sender] && _approvals[tokenId] != msg.sender) revert NotAuthorized();
        delete _approvals[tokenId];
        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 cevap) {
                if (cevap != IERC721Receiver.onERC721Received.selector) revert UnsafeRecipient();
            } catch {
                revert UnsafeRecipient();
            }
        }
    }

    // ── Basım (yalnız oyun sunucusu) ─────────────────────────────────────────
    /// @notice Oyunda basılan Genesis'i zincire taşır: numara oyunun verdiği Genesis numarasıdır (1..SEASON_CAP), bir kez basılır.
    function mint(address to, uint256 tokenId) external {
        if (msg.sender != minter) revert NotMinter();
        if (to == address(0)) revert ZeroAddress();
        if (tokenId == 0 || tokenId > SEASON_CAP) revert BadTokenId(tokenId);
        if (_owners[tokenId] != address(0)) revert AlreadyMinted(tokenId);
        _owners[tokenId] = to;
        unchecked {
            _balances[to] += 1;
            totalSupply += 1;
        }
        emit Transfer(address(0), to, tokenId);
    }

    // ── Yönetim ──────────────────────────────────────────────────────────────
    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddress();
        emit MinterChanged(minter, newMinter);
        minter = newMinter;
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        if (baseURIFrozen) revert Frozen();
        _baseURI = baseURI_;
        emit BaseURIChanged(baseURI_);
    }

    /// @notice Görsel/açıklama adresini kalıcı olarak sabitler (geri alınamaz)
    function freezeBaseURI() external onlyOwner {
        baseURIFrozen = true;
        emit BaseURIFrozenForever();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ── Yardımcı ─────────────────────────────────────────────────────────────
    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        for (uint256 v = value; v != 0; v /= 10) digits++;
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
