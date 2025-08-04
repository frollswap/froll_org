let provider;
let signer;
let contract;
let walletAddress;
let frollTokenAddress = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906"; // Địa chỉ hợp đồng xóc đĩa

// Kết nối ví (MetaMask)
async function connectWallet() {
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();
        document.getElementById("walletAddress").innerText = "Address: " + walletAddress;
        
        const balance = await signer.getBalance();
        document.getElementById("walletBalance").innerText = "Balance: " + ethers.utils.formatEther(balance) + " ETH";
        
        document.getElementById("walletInfo").style.display = "block";
        document.getElementById("connectButton").style.display = "none";
        
        // Khởi tạo hợp đồng xóc đĩa
        const abi = [
            // ABI hợp đồng xóc đĩa mà bạn đã cung cấp
            {
                "inputs": [{ "internalType": "address", "name": "_token", "type": "address" }, { "internalType": "address", "name": "_admin", "type": "address" }],
                "stateMutability": "nonpayable",
                "type": "constructor"
            },
            {
                "anonymous": false,
                "inputs": [{ "indexed": true, "internalType": "address", "name": "player", "type": "address" }, { "indexed": false, "internalType": "uint8", "name": "choice", "type": "uint8" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }, { "indexed": false, "internalType": "bool", "name": "win", "type": "bool" }],
                "name": "BetResult",
                "type": "event"
            },
            {
                "inputs": [],
                "name": "admin",
                "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
                "stateMutability": "view",
                "type": "function"
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
                "name": "token",
                "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "withdraw",
                "outputs": [],
                "stateMutability": "nonpayable",
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
        const tx = await contract.bet(betChoice, ethers.utils.parseEther(betAmount));
        await tx.wait(); // Đợi giao dịch hoàn thành

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
