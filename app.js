let provider;
let signer;
let contract;
let walletAddress;
let frollTokenAddress = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906"; // Địa chỉ hợp đồng xóc đĩa
let frollToken;
let vicTokenAddress = "0x0..."; // Thêm địa chỉ hợp đồng VIC nếu cần

// Kết nối ví (MetaMask)
async function connectWallet() {
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();
        document.getElementById("walletAddress").innerText = "Address: " + walletAddress;
        
        // Lấy số dư FROLL
        frollToken = new ethers.Contract(frollTokenAddress, [
            "function balanceOf(address owner) view returns (uint256)"
        ], signer);

        let balanceFroll = await frollToken.balanceOf(walletAddress);
        document.getElementById("walletBalanceFROLL").innerText = "FROLL Balance: " + ethers.utils.formatUnits(balanceFroll, 18);

        // Lấy số dư VIC (nếu có hợp đồng VIC)
        if (vicTokenAddress) {
            let vicToken = new ethers.Contract(vicTokenAddress, [
                "function balanceOf(address owner) view returns (uint256)"
            ], signer);
            let balanceVic = await vicToken.balanceOf(walletAddress);
            document.getElementById("walletBalanceVIC").innerText = "VIC Balance: " + ethers.utils.formatUnits(balanceVic, 18);
        }

        document.getElementById("walletInfo").style.display = "block";
        document.getElementById("connectButton").style.display = "none";
        
        // Khởi tạo hợp đồng xóc đĩa
        const abi = [
            // ABI hợp đồng xóc đĩa
            {
                "inputs": [{ "internalType": "address", "name": "_token", "type": "address" }, { "internalType": "address", "name": "_admin", "type": "address" }],
                "stateMutability": "nonpayable",
                "type": "constructor"
            },
            {
                "inputs": [{ "internalType": "uint8", "name": "choice", "type": "uint8" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
                "name": "bet",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "admin",
                "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
                "stateMutability": "view",
                "type": "function"
            }
        ];

        contract = new ethers.Contract(frollTokenAddress, abi, signer);
    } else {
        alert("Please install MetaMask!");
    }
}

// Đặt cược
async function placeBet() {
    const betAmount = document.getElementById("betAmount").value;
    const betChoice = document.getElementById("betChoice").value;

    if (betAmount <= 0) {
        alert("Please enter a valid bet amount.");
        return;
    }

    try {
        // Chuyển FROLL từ người chơi vào hợp đồng
        const tx = await contract.bet(betChoice, ethers.utils.parseUnits(betAmount, 18));
        await tx.wait(); // Đợi giao dịch hoàn tất

        // Hiển thị kết quả
        document.getElementById("betResult").innerText = `You bet ${betAmount} FROLL on ${betChoice === "0" ? "Even" : "Odd"}`;
        document.getElementById("winLossMessage").innerText = "Wait for the result...";

        // Lắng nghe sự kiện BetResult
        contract.on("BetResult", (player, choice, amount, win) => {
            if (player.toLowerCase() === walletAddress.toLowerCase()) {
                document.getElementById("winLossMessage").innerText = win ? "You Win!" : "You Lose!";
            }
        });

    } catch (error) {
        console.error("Transaction failed: ", error);
        alert("Transaction failed. Please try again.");
    }
}
