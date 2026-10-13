// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Realm of Astra — Oyun Kasası (tek yönlü kilit)
/// @notice Bu sözleşmeye giren ASTRA bir daha HİÇBİR ZAMAN kişisel bir cüzdana çekilemez — sahibi dahil kimse.
/// Sözleşmede "çekim" ya da "geri alma" işlevi YOKTUR; böyle bir fonksiyon hiç yazılmadı, sonradan da eklenemez
/// (sözleşme yükseltilebilir değil). Para yalnız üç önceden belirlenmiş yoldan çıkabilir:
///   1) oyuncuya ödeme (payPlayer)      — Üretim Hakkı / ödül kasaları sunucunun kararına göre
///   2) yakım (burn)                    — ölü adrese gönderim, arz kalıcı olarak azalır
///   3) yapımcı payı (payCreator)       — yalnız sabit yapımcı cüzdanına, hep aynı adres
/// Bu üçü dışında hiçbir adrese tek satoshi gitmez: kontratta böyle bir kod yolu yok.
///
/// Güvenlik modeli (iki katmanlı):
///  - "Dağıtıcı" anahtarı (sunucunun otomatik işler için kullandığı, düşük değerli operasyonel anahtar) yalnız
///    "şuna şu kadar öde" diyebilir; parayı GERÇEKTEN gönderen bu sözleşmedir, dağıtıcı büyük para TUTMAZ.
///    Dağıtıcı anahtarı çalınsa bile saldırgan kendine para çekemez (böyle bir fonksiyon yok); yalnız izinli üç
///    yoldan birine, izinli HIZ sınırları içinde ödeme tetikleyebilir — bu da aşağıdaki iki sınırla kısılır:
///      • tek ödeme ≤ kasanın %singleDrawBps'i (sunucudaki aynı kuralın zincir kopyası)
///      • HERHANGİ bir 24 saatlik aralıkta toplam ≤ kasanın %dailyLimitBps'i (kayan pencere: saatlik 25 kova toplanır,
///        pencere sınırında "iki gün birden" çekilemez; en kötü durumda bekleme 25 saate kadar uzayabilir)
///  - Sahibin TEK ayrıcalığı: durdur/devam et (acil fren). Bu düğme parayı hiçbir yere göndermez, yalnız kilitler;
///    bir sızma/saldırı şüphesinde sistemi dondurup sorunu çözene kadar kapalı tutmanın yoludur.
///  - İsteğe bağlı BEKÇİ anahtarı (ayrı, soğuk bir cüzdan/çoklu imza): yalnız durdurabilir ve bekleyen ayar önerisini
///    iptal edebilir; para gönderemez, ayar öneremez. Bir kez atandıktan sonra yalnız bekçinin kendisi değiştirebilir
///    (sahip anahtarı çalınsa bile saldırgan bekçiyi kaldıramaz ya da değiştiremez).
///  - Dağıtıcı anahtarı ve güvenlik sınırları (singleDrawBps/dailyLimitBps/yapımcı cüzdanı) sahip tarafından
///    değiştirilebilir ama DELAY (24 saat) sonra geçerli olur — sahip anahtarı ele geçirilse bile saldırgan
///    dağıtıcıyı kendi anahtarına çevirip hemen boşaltamaz; gerçek sahip bu süre içinde durdurabilir.
/// Not: oyundaki zindan/kolezyum/dünya bossu/karnaval/görev/Fatih/Konsey gibi "kasa" yüzdeleri burada YOK — onlar
/// sunucunun kendi defterinde tutulan sayılardır (bugün de öyle); bu sözleşme yalnız "sunucu kime öde diyorsa
/// zincirde gerçekten gönderen taraf"tır. Bir kasanın yüzdesini değiştirmek bu sözleşmeye hiç dokunmaz.
contract OyunKasasi {
    address public immutable token;         // ASTRA (ERC20)
    address public immutable deadAddress;   // yakım adresi

    address public owner;
    address public pendingOwner;

    uint256 public constant DELAY = 24 hours;
    uint256 public constant MAX_SINGLE_DRAW_BPS = 1000;  // sahip bile tek ödemeyi kasanın %10'undan fazlasına ayarlayamaz
    uint256 public constant MAX_DAILY_LIMIT_BPS = 3000;  // ya da günlük toplamı %30'dan fazlasına
    uint256 private constant BPS = 10000;

    struct Config {
        address dagitici;         // ödeme tetikleme anahtarı
        address creator;          // yapımcı payının gideceği sabit cüzdan
        uint16 singleDrawBps;     // tek ödeme ≤ kasanın bu kadar baz puanı
        uint16 dailyLimitBps;     // 24 saatte toplam ≤ kasanın bu kadar baz puanı
    }

    Config public current;
    Config public pendingConfig;
    uint64 public effectiveAt;   // 0 = bekleyen değişiklik yok

    bool public paused;

    address public guardian;     // 0 = bekçi atanmadı

    // Kayan 24 saat: ödemeler saatlik kovalara yazılır (anahtar = zaman damgası / 1 saat). Herhangi bir 24 saatlik aralık en çok
    // 25 ardışık kovaya değer; sınır bu 25 kovanın toplamına uygulanır, böylece aralıktaki toplam sınırı aşamaz.
    uint256 private constant SLOT_LEN = 1 hours;
    uint256 private constant SLOT_COUNT = 25;
    mapping(uint256 => uint256) private _slotSpent;
    uint256 private _lock = 1;

    event Deposited(address indexed from, uint256 amount);
    event PlayerPaid(address indexed to, uint256 amount, bytes32 indexed ref);
    event Burned(uint256 amount, bytes32 indexed ref);
    event CreatorPaid(uint256 amount, bytes32 indexed ref);
    event PausedSet(bool paused);
    event ConfigProposed(Config cfg, uint64 effectiveAt);
    event ConfigApplied(Config cfg);
    event ConfigCancelled();
    event GuardianSet(address indexed guardian);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotDagitici();
    error NotGuardian();
    error IsPaused();
    error ZeroAddress();
    error ZeroAmount();
    error LimitTooHigh();
    error DrawTooLarge(uint256 requested, uint256 cap);
    error DailyLimitExceeded(uint256 requested, uint256 remaining);
    error TokenTransferFailed();
    error NothingPending();
    error NotYet(uint64 effectiveAt);
    error Reentrancy();

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

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    constructor(address token_, address deadAddress_, Config memory initial) {
        if (token_ == address(0) || deadAddress_ == address(0)) revert ZeroAddress();
        _checkConfig(initial);
        token = token_;
        deadAddress = deadAddress_;
        current = initial;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit ConfigApplied(initial);
    }

    // ── Giriş: herkes gönderebilir (önce approve) — bu, tek giriş yoludur; sözleşmede çıkış fonksiyonu yok ──
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    // ── Üç izinli çıkış yolu (yalnız dağıtıcı, yalnız durmamışken, yalnız hız sınırları içinde) ──
    function payPlayer(address to, uint256 amount, bytes32 ref) external onlyDagitici {
        if (to == address(0)) revert ZeroAddress();
        _payOut(to, amount);
        emit PlayerPaid(to, amount, ref);
    }

    function burn(uint256 amount, bytes32 ref) external onlyDagitici {
        _payOut(deadAddress, amount);
        emit Burned(amount, ref);
    }

    function payCreator(uint256 amount, bytes32 ref) external onlyDagitici {
        _payOut(current.creator, amount);
        emit CreatorPaid(amount, ref);
    }

    modifier onlyDagitici() {
        _settle();
        if (paused) revert IsPaused();
        if (msg.sender != current.dagitici) revert NotDagitici();
        _;
    }

    function _payOut(address to, uint256 amount) private nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _enforceCaps(amount);
        _safeTransfer(to, amount);
    }

    function _enforceCaps(uint256 amount) private {
        uint256 bal = _balance();
        Config memory c = current;                         // onlyDagitici _settle() çağırdı: current güncel
        uint256 singleCap = bal * c.singleDrawBps / BPS;
        if (amount > singleCap) revert DrawTooLarge(amount, singleCap);
        uint256 dailyCap = bal * c.dailyLimitBps / BPS;
        uint256 spent = _spentWindow();
        uint256 remaining = dailyCap > spent ? dailyCap - spent : 0;
        if (amount > remaining) revert DailyLimitExceeded(amount, remaining);
        _slotSpent[block.timestamp / SLOT_LEN] += amount;
    }

    /// @dev Son 25 saatlik kovanın (içinde bulunulan saat dahil) toplamı
    function _spentWindow() private view returns (uint256 sum) {
        uint256 h = block.timestamp / SLOT_LEN;
        for (uint256 i = 0; i < SLOT_COUNT && i <= h; i++) sum += _slotSpent[h - i];
    }

    function _balance() private view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
        if (!ok || data.length < 32) revert TokenTransferFailed();
        return abi.decode(data, (uint256));
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    // ── Görünüm ──
    function activeConfig() public view returns (Config memory) {
        if (effectiveAt != 0 && block.timestamp >= effectiveAt) return pendingConfig;
        return current;
    }

    /// @notice Şu an bir tek ödemenin en fazla ne kadar olabileceği (kasanın güncel bakiyesine göre)
    function singleDrawCap() external view returns (uint256) {
        return _balance() * activeConfig().singleDrawBps / BPS;
    }

    /// @notice Kayan 24 saatlik pencerede şu an ne kadar daha ödenebilir
    function dailyRemaining() external view returns (uint256) {
        uint256 dailyCap = _balance() * activeConfig().dailyLimitBps / BPS;
        uint256 spent = _spentWindow();
        return dailyCap > spent ? dailyCap - spent : 0;
    }

    /// @notice Son 24 saatlik (25 kovalık) penceredeki toplam ödeme
    function spentInWindow() external view returns (uint256) {
        return _spentWindow();
    }

    // ── Yönetim (yalnız sahip) ──
    /// @notice Acil fren: durur/devam eder. Parayı hiçbir yere göndermez, yalnız üç çıkış fonksiyonunu kilitler.
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Bekçi acil freni: yalnız DURDURUR (devam ettirmek sahibin işi). Sahip de çağırabilir.
    function pause() external {
        if (msg.sender != owner && (guardian == address(0) || msg.sender != guardian)) revert NotOwner();
        paused = true;
        emit PausedSet(true);
    }

    /// @notice Bekçi atama. İlk atamayı yalnız sahip yapar; sonrasında yalnız bekçinin kendisi değiştirebilir (kaldırılamaz).
    function setGuardian(address g) external {
        if (guardian == address(0)) {
            if (msg.sender != owner) revert NotOwner();
        } else if (msg.sender != guardian) {
            revert NotGuardian();
        }
        if (g == address(0)) revert ZeroAddress();
        guardian = g;
        emit GuardianSet(g);
    }

    /// @notice Dağıtıcı anahtarı / yapımcı cüzdanı / hız sınırlarını değiştirme önerisi — 24 saat sonra geçerli
    /// olur (önceki bekleyen öneri varsa yerine geçer). Sahip anahtarı ele geçirilse bile saldırgan bu süre
    /// içinde durdurma düğmesiyle engellenebilir.
    function proposeConfig(Config calldata cfg) external onlyOwner {
        _checkConfig(cfg);
        _settle();
        pendingConfig = cfg;
        effectiveAt = uint64(block.timestamp + DELAY);
        emit ConfigProposed(cfg, effectiveAt);
    }

    function cancelConfig() external {
        if (msg.sender != owner && (guardian == address(0) || msg.sender != guardian)) revert NotOwner();
        _settle();
        if (effectiveAt == 0) revert NothingPending();
        effectiveAt = 0;
        emit ConfigCancelled();
    }

    /// @notice Süresi dolan öneriyi kalıcı yap (herkes çağırabilir; çağrılmasa da bir sonraki işlemde kendiliğinden olur)
    function finalizeConfig() external {
        if (effectiveAt == 0) revert NothingPending();
        if (block.timestamp < effectiveAt) revert NotYet(effectiveAt);
        _settle();
    }

    function _settle() private {
        if (effectiveAt != 0 && block.timestamp >= effectiveAt) {
            current = pendingConfig;
            effectiveAt = 0;
            emit ConfigApplied(current);
        }
    }

    function _checkConfig(Config memory cfg) private pure {
        if (cfg.dagitici == address(0) || cfg.creator == address(0)) revert ZeroAddress();
        if (cfg.singleDrawBps == 0 || cfg.singleDrawBps > MAX_SINGLE_DRAW_BPS) revert LimitTooHigh();
        if (cfg.dailyLimitBps == 0 || cfg.dailyLimitBps > MAX_DAILY_LIMIT_BPS) revert LimitTooHigh();
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
