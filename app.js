let provider, signer, walletAddress;
let frollTokenContract;

// Kết nối ví
async function connectWallet() {
    if (!window.ethereum) {
        alert("❌ Please install MetaMask or use a Web3 browser!");
        return;
    }

    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();
        console.log("🔗 Connected wallet:", walletAddress);
        
        // Cập nhật địa chỉ ví và số dư
        document.getElementById("wallet-address").textContent = walletAddress;
        
        // Hiển thị số dư FROLL
        frollTokenContract = new ethers.Contract("0xB4d562A8f811CE7F134a1982992Bd153902290BC", ["function balanceOf(address) view returns (uint256)"], provider);
        const frollBalance = await frollTokenContract.balanceOf(walletAddress);
        document.getElementById("froll-balance").textContent = `FROLL Balance: ${ethers.utils.formatUnits(frollBalance, 18)}`;
        
        // Hiển thị số dư VIC
        const vicBalance = await provider.getBalance(walletAddress);
        document.getElementById("vic-balance").textContent = `VIC Balance: ${ethers.utils.formatEther(vicBalance)}`;

        // Hiển thị giao diện xóc đĩa
        document.getElementById("home-page").style.display = "none";
        document.getElementById("dice-interface").style.display = "block";
    } catch (error) {
        console.error("❌ Error connecting wallet:", error);
        alert("❌ Could not connect wallet!");
    }
}

// Chức năng chọn bàn chơi
function setMinBet() {
    const minBet = parseFloat(document.getElementById("minBetInput").value);
    if (isNaN(minBet) || minBet <= 0) {
        alert("❌ Invalid minimum bet!");
        return;
    }
    alert(`✅ Minimum bet set to ${minBet} FROLL`);
}

// Chức năng đặt cược
function placeBet(guess) {
    const minBet = parseFloat(document.getElementById("minBetInput").value);
    const betAmount = parseFloat(document.getElementById("betAmount").value);
    if (isNaN(betAmount) || betAmount < minBet) {
        alert(`❌ Bet must be greater than or equal to ${minBet} FROLL`);
        return;
    }
    
    const diceResult = Math.random() < 0.5 ? "even" : "odd";
    const win = guess === diceResult;
    
    document.getElementById("dice-result").textContent = `Result: ${diceResult} - You ${win ? 'Win' : 'Lose'}!`;
    
    if (win) {
        alert(`✅ You won!`);
    } else {
        alert(`❌ You lost!`);
    }
}

// Chức năng quay lại màn hình chính
function disconnectWallet() {
    document.getElementById("home-page").style.display = "block";
    document.getElementById("dice-interface").style.display = "none";
    document.getElementById("wallet-address").textContent = "Not Connected";
    document.getElementById("froll-balance").textContent = "FROLL Balance: 0";
    document.getElementById("vic-balance").textContent = "VIC Balance: 0";
}

