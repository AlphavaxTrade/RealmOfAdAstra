// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Realm of Astra — ADA dağıtım oranları
/// @notice Oyundaki bütün ADA oranları (yakım, yapımcı payı, temel gelir, ödül kasaları, çark, zindan harcı, piyango,
/// pazar komisyonu, çekim ücreti ve kirası) burada herkesin görebileceği şekilde durur. Oyun sunucusu oranları buradan okur.
/// Oranları yalnız sahip değiştirebilir; yeni oranlar önerildikten 24 saat sonra geçerli olur (oyuncular önceden görür).
/// Sözleşme para tutmaz ve paraya dokunmaz; yalnız kuralı tutar.
/// Oranlar baz puandır: 10000 = %100. Sıra (js/economy/rates.js ile aynı):
///  0 yakım, 1 yapımcı, 2 temel gelir, 3 ödül kasaları                       → toplam 10000
///  4 zindan, 5 kolezyum, 6 dünya bossu, 7 pazar desteği, 8 görev, 9 karnaval, 10 Fatih Ödülü, 11 Sirius Konseyi → toplam 10000
///  12 çark→karnaval (≤10000), 13 zindan harcı→zindan (≤10000), 14 piyango amorti (≤5000),
///  15 pazar ADA komisyonu (≤1000), 16 pazar hammadde yakımı (≤1000), 17 çekim ücreti (≤2000),
///  18 çekim ücreti fiyat düşerken (≤3000), 19 çekim ücretinin temel gelire giden kısmı (≤10000), 20 çekim hakkı kirası (≤1000)
contract RealmRates {
    uint256 public constant COUNT = 21;
    uint256 public constant DELAY = 24 hours;

    address public owner;
    address public pendingOwner;

    uint16[21] private _current;
    uint16[21] private _next;
    uint64 public effectiveAt;      // 0 = bekleyen değişiklik yok

    event RatesProposed(uint16[21] rates, uint64 effectiveAt);
    event RatesApplied(uint16[21] rates);
    event ProposalCancelled();
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddress();
    error BadSpendSplit();
    error BadPoolSplit();
    error RateTooHigh(uint256 index);
    error NothingPending();
    error NotYet(uint64 effectiveAt);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint16[21] memory initial) {
        _check(initial);
        _current = initial;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit RatesApplied(initial);
    }

    /// @notice Şu an geçerli oranlar (süresi dolmuş bir öneri varsa o geçerlidir)
    function active() public view returns (uint16[21] memory) {
        if (effectiveAt != 0 && block.timestamp >= effectiveAt) return _next;
        return _current;
    }

    /// @notice Bekleyen öneri ve geçerli olacağı zaman (effectiveAt 0 ise öneri yok)
    function pending() external view returns (uint16[21] memory rates, uint64 at) {
        return (_next, effectiveAt);
    }

    /// @notice Yeni oranlar öner: 24 saat sonra geçerli olur. Önceki bekleyen öneri varsa yerine geçer.
    function propose(uint16[21] calldata rates) external onlyOwner {
        _check(rates);
        _settle();
        _next = rates;
        effectiveAt = uint64(block.timestamp + DELAY);
        emit RatesProposed(rates, effectiveAt);
    }

    /// @notice Bekleyen öneriyi geri çek (süresi dolmadıysa)
    function cancel() external onlyOwner {
        _settle();
        if (effectiveAt == 0) revert NothingPending();
        effectiveAt = 0;
        emit ProposalCancelled();
    }

    /// @notice Süresi dolan öneriyi kalıcı yap (herkes çağırabilir; çağrılmasa da active() yeni oranları döndürür)
    function finalize() external {
        if (effectiveAt == 0) revert NothingPending();
        if (block.timestamp < effectiveAt) revert NotYet(effectiveAt);
        _settle();
    }

    function _settle() private {
        if (effectiveAt != 0 && block.timestamp >= effectiveAt) {
            _current = _next;
            effectiveAt = 0;
            emit RatesApplied(_current);
        }
    }

    function _check(uint16[21] memory r) private pure {
        if (uint256(r[0]) + r[1] + r[2] + r[3] != 10000) revert BadSpendSplit();
        if (uint256(r[4]) + r[5] + r[6] + r[7] + r[8] + r[9] + r[10] + r[11] != 10000) revert BadPoolSplit();
        uint16[9] memory maxes = [10000, 10000, 5000, 1000, 1000, 2000, 3000, 10000, 1000];
        for (uint256 i = 0; i < 9; i++) {
            if (r[12 + i] > maxes[i]) revert RateTooHigh(12 + i);
        }
    }

    /// @notice Sahiplik iki adımda devredilir (yanlış adrese devri önler)
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
