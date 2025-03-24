document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const connectWalletButton = document.getElementById('connect-wallet');
    const disconnectWalletButton = document.getElementById('disconnect-wallet');
    const walletAddressDisplay = document.getElementById('wallet-address');
    const fromAmountInput = document.getElementById('from-amount');
    const toAmountInput = document.getElementById('to-amount');
    const fromTokenInfo = document.getElementById('from-token-info');
    const toTokenInfo = document.getElementById('to-token-info');
    const fromTokenLogo = document.getElementById('from-token-logo');
    const toTokenLogo = document.getElementById('to-token-logo');
    const swapDirectionButton = document.getElementById('swap-direction');
    const maxButton = document.getElementById('max-button');
    const swapNowButton = document.getElementById('swap-now');
    const gasFeeDisplay = document.getElementById('gas-fee');
    const frollToUsdDisplay = document.getElementById('froll-to-usd');

    // Blockchain Config
    let provider, signer;
    const frollSwapAddress = "0xE4CDc0F67537d7546F637c88eE9E5280BAE8448d";
    const frollTokenAddress = "0x7783cBC17d43F936DA1C1D052E4a33a9FfF774c1";
    const RATE = 0.039; // 1 FROLL = 0.039 BNB
    const frollSwapABI = [
        {
            "inputs": [{ "internalType": "uint256", "name": "frollAmount", "type": "uint256" }],
            "name": "swapFROLLForBNB",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "swapBNBForFROLL",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
        }
    ];

    const frollTokenABI = [
        {
            "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
            "name": "balanceOf",
            "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                { "internalType": "address", "name": "spender", "type": "address" },
                { "internalType": "uint256", "name": "amount", "type": "uint256" }
            ],
            "name": "approve",
            "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
            "stateMutability": "nonpayable",
            "type": "function"
        }
    ];

    let frollSwapContract, frollTokenContract;
    let walletAddress = null;
    let balances = { FROLL: 0, BNB: 0 };
    let fromToken = 'FROLL';
    let toToken = 'BNB';
    // Ensure Wallet Connected
    async function ensureWalletConnected() {
        try {
            if (!window.ethereum) {
                alert('MetaMask is not installed. Please install MetaMask to use this application.');
                return false;
            }

            await window.ethereum.request({ method: "eth_requestAccounts" });

            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            walletAddress = await signer.getAddress();

            return true;
        } catch (error) {
            console.error("Failed to connect wallet:", error);
            alert('Failed to connect wallet. Please try again.');
            return false;
        }
    }

    // Fetch BNB/USD price from BSC API
    async function fetchBnbToUsdPrice() {
        try {
            const response = await fetch(
                `https://api.bscscan.com/api?module=stats&action=bnbprice&apikey=BIEGUCY7A9NPF2M2KPYZRMRFABVCVJ9D3V`
            );
            const data = await response.json();
            return parseFloat(data.result.ethusd); // Giá BNB/USD từ API
        } catch (error) {
            console.error("Failed to fetch BNB price:", error);
            return null;
        }
    }

    // Calculate FROLL/USD price
    async function calculateFrollPrice() {
        try {
            const bnbToUsd = await fetchBnbToUsdPrice();
            if (!bnbToUsd) return;

            const frollToUsd = (RATE * bnbToUsd).toFixed(2); // Tính giá FROLL/USD
            frollToUsdDisplay.textContent = frollToUsd; // Cập nhật giá trên giao diện
        } catch (error) {
            console.error("Failed to calculate FROLL price:", error);
        }
    }

    // Fetch Balances
    async function updateBalances() {
        try {
            balances.BNB = parseFloat(ethers.utils.formatEther(await provider.getBalance(walletAddress)));
            balances.FROLL = parseFloat(
                ethers.utils.formatUnits(
                    await frollTokenContract.balanceOf(walletAddress),
                    18
                )
            );

            updateTokenDisplay();
        } catch (error) {
            console.error('Error fetching balances:', error);
        }
    }

    // Update Token Display
    function updateTokenDisplay() {
        fromTokenInfo.textContent = `${fromToken}: ${balances[fromToken].toFixed(4)}`;
        toTokenInfo.textContent = `${toToken}: ${balances[toToken].toFixed(4)}`;
    }
    // Max Button
    maxButton.addEventListener('click', async () => {
        const connected = await ensureWalletConnected();
        if (!connected) return;

        fromAmountInput.value = balances[fromToken];
        calculateToAmount();
    });

    // Calculate To Amount
    fromAmountInput.addEventListener('input', calculateToAmount);
    function calculateToAmount() {
        const fromAmount = parseFloat(fromAmountInput.value);
        if (isNaN(fromAmount) || fromAmount <= 0) {
            toAmountInput.value = '';
            return;
        }

        let toAmount;
        if (fromToken === 'FROLL') {
            toAmount = (fromAmount * RATE).toFixed(4);
        } else {
            toAmount = (fromAmount / RATE).toFixed(4);
        }

        toAmountInput.value = toAmount;
        gasFeeDisplay.textContent = `Estimated Gas Fee: ~0.0005 BNB`;
    }

    // Swap Direction
    swapDirectionButton.addEventListener('click', () => {
        [fromToken, toToken] = [toToken, fromToken];
        [fromTokenLogo.src, toTokenLogo.src] = [toTokenLogo.src, fromTokenLogo.src];
        updateTokenDisplay();
        clearInputs();
    });

    // Clear Inputs
    function clearInputs() {
        fromAmountInput.value = '';
        toAmountInput.value = '';
    }
    // Swap Tokens
    swapNowButton.addEventListener('click', async () => {
        try {
            const fromAmount = parseFloat(fromAmountInput.value);

            if (isNaN(fromAmount) || fromAmount <= 0) {
                alert('Please enter a valid amount to swap.');
                return;
            }

            if (fromToken === 'FROLL') {
                const fromAmountInWei = ethers.utils.parseUnits(fromAmount.toString(), 18);

                const approveTx = await frollTokenContract.approve(frollSwapAddress, fromAmountInWei);
                await approveTx.wait();

                const tx = await frollSwapContract.swapFROLLForBNB(fromAmountInWei);
                await tx.wait();
                alert('Swap FROLL to BNB successful.');
            } else {
                const tx = await frollSwapContract.swapBNBForFROLL({ value: ethers.utils.parseEther(fromAmount.toString()) });
                await tx.wait();
                alert('Swap BNB to FROLL successful.');
            }

            await updateBalances();
        } catch (error) {
            console.error("Swap failed:", error);
            alert(`Swap failed: ${error.reason || error.message}`);
        }
    });

    // Connect Wallet
    connectWalletButton.addEventListener('click', async () => {
        const connected = await ensureWalletConnected();
        if (!connected) return;

        try {
            frollSwapContract = new ethers.Contract(frollSwapAddress, frollSwapABI, signer);
            frollTokenContract = new ethers.Contract(frollTokenAddress, frollTokenABI, signer);

            walletAddressDisplay.textContent = walletAddress;
            await updateBalances();
            calculateFrollPrice(); // Cập nhật giá FROLL/USD khi kết nối ví
            showSwapInterface();
        } catch (error) {
            console.error('Failed to initialize wallet:', error);
            alert(`Failed to initialize wallet: ${error.message}`);
        }
    });

    // Disconnect Wallet
    disconnectWalletButton.addEventListener('click', async () => {
        walletAddress = null;
        balances = { FROLL: 0, BNB: 0 };
        frollSwapContract = null;
        frollTokenContract = null;

        walletAddressDisplay.textContent = '';
        clearInputs();
        showConnectInterface();

        alert('Wallet disconnected successfully.');
    });

    // Show/Hide Interfaces
    function showSwapInterface() {
        document.getElementById('swap-interface').style.display = 'block';
        document.getElementById('connect-interface').style.display = 'none';
    }

    function showConnectInterface() {
        document.getElementById('swap-interface').style.display = 'none';
        document.getElementById('connect-interface').style.display = 'block';
    }

    // Initialize Interface
    showConnectInterface();
});
// Chặn chuột phải và F12 (DevTools)
document.addEventListener("contextmenu", function (event) {
    event.preventDefault();
});

document.addEventListener("keydown", function (event) {
    if (event.key === "F12" || (event.ctrlKey && event.shiftKey && event.key === "I")) {
        event.preventDefault();
    }
});

// Chặn Ctrl+U (Xem nguồn trang)
document.addEventListener("keydown", function (event) {
    if (event.ctrlKey && event.key === "u") {
        event.preventDefault();
    }
});

// Cho phép sao chép duy nhất địa chỉ hợp đồng FROLL
document.getElementById("froll-contract").addEventListener("copy", function (event) {
    event.preventDefault(); // Chặn sao chép thông thường
    const contractAddress = "0x7783cBC17d43F936DA1C1D052E4a33a9FfF774c1";
    navigator.clipboard.writeText(contractAddress).then(() => {
        alert("FROLL contract address copied successfully!");
    });
});
