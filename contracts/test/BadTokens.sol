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
