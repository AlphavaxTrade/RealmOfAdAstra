// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Realm of Astra — oyun içi ödemeler
/// @notice Oyuncu cüzdanından tek işlemde:
///   1) ADASTRA'yı doğrudan oyunun hazine cüzdanına aktarır (sözleşme hiçbir zaman token tutmaz),
///   2) işlemin ağ ücreti kadar AVAX komisyonunu (tx.gasprice × feeGas) komisyon cüzdanına aktarır.
/// Her ödemenin bir referansı (ref) vardır; oyun sunucusu ödemeyi bu referansla eşleştirir.
/// Aynı oyuncu aynı referansı ikinci kez kullanamaz. Referans oyuncuya özel olduğu için başkası
/// bir oyuncunun bekleyen ödemesini önden aynı referansla bozamaz.
/// Sözleşme sahibi yalnız ayarları değiştirebilir ve ödemeleri durdurabilir; oyuncu parasına erişemez.
/// Hazine ve komisyon cüzdanı adresleri ANINDA değiştirilemez (13 Ekim 2026 denetimi, K5): sahip yeni adresleri
/// önerir, 24 saat sonra uygulanır; o sürede bekleyen öneri görünür ve iptal edilebilir. Sahip anahtarı çalınsa bile
/// ödemelerin yönleneceği adres bir gün boyunca herkesin gözü önünde bekler. Komisyon gazı ve durdurma anında kalır.
contract RealmPayments {
    address public immutable token;
    address public owner;
    address public pendingOwner;
    address public treasury;      // ADASTRA'nın gideceği oyun cüzdanı
    address public feeReceiver;   // AVAX komisyonunun gideceği cüzdan
    uint256 public feeGas;        // komisyon = tx.gasprice × feeGas (bu işlemin yaklaşık ağ ücreti → %100 ek)
    bool public paused;

    uint256 public constant MAX_FEE_GAS = 1_000_000;
    uint256 public constant CONFIG_DELAY = 24 hours;   // adres değişikliği önerisinden uygulanmasına en az bu kadar

    // Bekleyen adres değişikliği (configEffectiveAt 0 ise öneri yok)
    address public pendingTreasury;
    address public pendingFeeReceiver;
    uint64 public configEffectiveAt;

    mapping(bytes32 => bool) public usedRef;   // keccak256(oyuncu, ref) → kullanıldı mı

    event Paid(address indexed payer, bytes32 indexed ref, uint256 amount, uint256 fee);
    event ConfigChanged(address treasury, address feeReceiver, uint256 feeGas, bool paused);
    event ConfigProposed(address treasury, address feeReceiver, uint64 effectiveAt);
    event ConfigCancelled();
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error PaymentsPaused();
    error RefAlreadyUsed();
    error ZeroAmount();
    error FeeTooLow(uint256 required, uint256 sent);
    error TokenTransferFailed();
    error FeeTransferFailed();
    error NotOwner();
    error ZeroAddress();
    error FeeGasTooHigh();
    error Reentrancy();
    error NothingPending();
    error NotYet(uint64 effectiveAt);

    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address token_, address treasury_, address feeReceiver_, uint256 feeGas_) {
        if (token_ == address(0) || treasury_ == address(0) || feeReceiver_ == address(0)) revert ZeroAddress();
        if (feeGas_ > MAX_FEE_GAS) revert FeeGasTooHigh();
        token = token_;
        owner = msg.sender;
        treasury = treasury_;
        feeReceiver = feeReceiver_;
        feeGas = feeGas_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit ConfigChanged(treasury_, feeReceiver_, feeGas_, false);
    }

    /// @notice Bu işlemde gönderilmesi gereken en az AVAX komisyonu
    function requiredFee() external view returns (uint256) {
        return tx.gasprice * feeGas;
    }

    /// @notice Oyuncu için referans anahtarı (sunucu da aynı hesabı yapar)
    function refKey(address payer, bytes32 ref) public pure returns (bytes32) {
        return keccak256(abi.encode(payer, ref));
    }

    /// @notice Ödeme: `amount` ADASTRA hazineye, gönderilen AVAX komisyon cüzdanına.
    /// Önce bir kez token.approve(bu sözleşme, miktar) gerekir.
    function pay(uint256 amount, bytes32 ref) external payable nonReentrant {
        if (paused) revert PaymentsPaused();
        if (amount == 0) revert ZeroAmount();
        uint256 required = tx.gasprice * feeGas;
        if (msg.value < required) revert FeeTooLow(required, msg.value);
        bytes32 key = refKey(msg.sender, ref);
        if (usedRef[key]) revert RefAlreadyUsed();
        usedRef[key] = true;

        _safeTransferFrom(msg.sender, treasury, amount);

        if (msg.value > 0) {
            (bool ok, ) = feeReceiver.call{value: msg.value}("");
            if (!ok) revert FeeTransferFailed();
        }
        emit Paid(msg.sender, ref, amount, msg.value);
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        // transferFrom(address,address,uint256) — true döndürmeyen eski tokenlarla da uyumlu
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    // ── Yönetim (yalnız sahip) ──────────────────────────────────────────
    /// @notice Komisyon gazı (en çok MAX_FEE_GAS) anında değişir: oyuncunun ödeyeceği komisyonu sınırlı biçimde ayarlar
    function setFeeGas(uint256 feeGas_) external onlyOwner {
        if (feeGas_ > MAX_FEE_GAS) revert FeeGasTooHigh();
        feeGas = feeGas_;
        emit ConfigChanged(treasury, feeReceiver, feeGas_, paused);
    }

    /// @notice Hazine ve komisyon cüzdanı için yeni adres öner: CONFIG_DELAY sonra uygulanabilir. Önceki öneri varsa
    /// yerine geçer ve bekleme süresi baştan başlar.
    function proposeConfig(address treasury_, address feeReceiver_) external onlyOwner {
        if (treasury_ == address(0) || feeReceiver_ == address(0)) revert ZeroAddress();
        pendingTreasury = treasury_;
        pendingFeeReceiver = feeReceiver_;
        configEffectiveAt = uint64(block.timestamp + CONFIG_DELAY);
        emit ConfigProposed(treasury_, feeReceiver_, configEffectiveAt);
    }

    /// @notice Süresi dolan öneriyi uygular (herkes çağırabilir: öneri sahipçe zaten verilmiş ve herkese açık beklemiştir)
    function applyConfig() external {
        if (configEffectiveAt == 0) revert NothingPending();
        if (block.timestamp < configEffectiveAt) revert NotYet(configEffectiveAt);
        treasury = pendingTreasury;
        feeReceiver = pendingFeeReceiver;
        pendingTreasury = address(0);
        pendingFeeReceiver = address(0);
        configEffectiveAt = 0;
        emit ConfigChanged(treasury, feeReceiver, feeGas, paused);
    }

    /// @notice Bekleyen adres önerisini iptal et (süresi dolmadan ya da uygulanmadan önce)
    function cancelConfig() external onlyOwner {
        if (configEffectiveAt == 0) revert NothingPending();
        pendingTreasury = address(0);
        pendingFeeReceiver = address(0);
        configEffectiveAt = 0;
        emit ConfigCancelled();
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit ConfigChanged(treasury, feeReceiver, feeGas, paused_);
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
