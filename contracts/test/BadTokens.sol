// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Yalnız bilgisayardaki denemeler için KÖTÜ NİYETLİ / uyumsuz token taklitleri (gerçek zincire yüklenmez).

/// transfer() hiçbir şey yapmadan false döndürür (bazı uyumsuz tokenlar böyle davranır); transferFrom normal çalışır
contract FalseToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address, uint256) external pure returns (bool) { return false; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// transfer/transferFrom hiçbir şey döndürmez (USDT tarzı); sözleşme bunu başarılı saymalı
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external { allowance[msg.sender][spender] = amount; }
    function transfer(address to, uint256 amount) external { balanceOf[msg.sender] -= amount; balanceOf[to] += amount; }
    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// transfer() sırasında kasaya geri girmeye (deposit) çalışır; sonucu kaydeder
contract ReentrantToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public vault;
    bool public reentryAttempted;
    bool public reentryOk;
    bytes public reentryRet;

    function setVault(address v) external { vault = v; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        if (vault != address(0)) {
            reentryAttempted = true;
            (bool ok, bytes memory ret) = vault.call(abi.encodeWithSignature("deposit(uint256)", uint256(1)));
            reentryOk = ok;
            reentryRet = ret;
        }
        return true;
    }
}

/// Her transfer/transferFrom'da %10 keser ve yakar (ücretli / yakımlı token): gönderenden `amount` düşer, alıcıya %90'ı ulaşır.
/// transfer true döndürür ve olay yayar, yani sözleşmeler başarılı sanır; yalnız ulaşan miktar eksiktir (denetim 2026-10 ikinci tur).
contract FeeToken {
    string public name = "Fee ADASTRA";
    string public symbol = "feeADA";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    uint256 public constant FEE_PERCENT = 10;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        uint256 fee = amount * FEE_PERCENT / 100;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        totalSupply -= fee;
        emit Transfer(from, to, amount - fee);
        if (fee > 0) emit Transfer(from, address(0), fee);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }
}
