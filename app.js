// ==============================
// 🔹 KẾT NỐI VÍ & CẬP NHẬT SỐ DƯ VIC & FROLL (Trade FROLL)
// ==============================

document.addEventListener("DOMContentLoaded", function () {
    // Lấy các phần tử quan trọng từ giao diện
    const tradeButton = document.getElementById("trade-froll-btn");  // Nút "Swap FROLL/VIC"
    const swapInterface = document.getElementById("swap-interface"); // Giao diện Swap
    const walletAddressEl = document.getElementById("wallet-address"); // Khu vực hiển thị địa chỉ ví
    const disconnectButton = document.getElementById("disconnect-wallet"); // Nút "Disconnect"
    const swapDirectionButton = document.getElementById("swap-direction"); // Nút đảo hướng swap
    const fromTokenSymbol = document.getElementById("from-token-symbol");
    const toTokenSymbol = document.getElementById("to-token-symbol");
    const fromTokenLogo = document.getElementById("from-token-logo");
    const toTokenLogo = document.getElementById("to-token-logo");
    const fromBalance = document.getElementById("from-balance");
    const toBalance = document.getElementById("to-balance");
    
    let provider, signer, walletAddress;
    let frollTokenContract;
    let fromToken = "VIC";
    let toToken = "FROLL";
    const balances = { VIC: 0, FROLL: 0 };

    const FROLL_CONTRACT_ADDRESS = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
    const FROLLSWAP_CONTRACT_ADDRESS = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";

    // 📌 ABI của FROLL Token (Chỉ lấy phần cần thiết)
    const frollABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ];

    // 📌 ABI của Hợp đồng Swap FROLL/VIC
    const frollSwapABI = [
        "function swapVicToFroll() payable",
        "function swapFrollToVic(uint256 frollAmount) external"
    ];

    // 📌 Kết nối ví
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

            console.log("🔗 Wallet connected successfully, address:", walletAddress);

            frollTokenContract = new ethers.Contract(FROLL_CONTRACT_ADDRESS, frollABI, provider);

            await updateBalances();
            
            // Ẩn các giao diện khác, hiển thị Swap Interface
            document.querySelectorAll("#home-page, .results, .check-hash, .guide-section, #check-ticket-section, .froll-info, .winning-hash, .lottery-froll, .lotto-froll, .roulette-froll, footer").forEach(section => {
                section.style.display = "none";
            });
            swapInterface.classList.remove("hidden");
            swapInterface.style.display = "block";
            walletAddressEl.textContent = walletAddress;
        } catch (error) {
            console.error("❌ Error connecting wallet:", error);
            alert("❌ Unable to connect wallet. Please try again!");
        }
    }

    // 📌 Xử lý khi người dùng bấm nút "Swap FROLL/VIC"
    if (tradeButton) {
        tradeButton.addEventListener("click", connectWallet);
    }

    // 📌 Xử lý khi người dùng bấm nút "Disconnect Wallet"
    disconnectButton.addEventListener("click", function () {
        swapInterface.style.display = "none";
        document.querySelectorAll("#home-page, .results, .check-hash, .guide-section, #check-ticket-section, .froll-info, .winning-hash, .lottery-froll, .lotto-froll, .roulette-froll, footer").forEach(section => {
            section.style.display = "block";
        });
        walletAddressEl.textContent = "Not Connected";
        console.log("🔴 Wallet disconnected.");
        alert("❌ Wallet disconnected!");
    });

    // 📌 Cập nhật số dư VIC & FROLL (Hiển thị đủ 18 số thập phân)
    async function updateBalances() {
        if (!walletAddress || !provider) return;

        // Lấy số dư VIC và FROLL
        const vicBalance = await provider.getBalance(walletAddress);
        const frollBalance = await frollTokenContract.balanceOf(walletAddress);

        // Định dạng số dư với 18 chữ số thập phân
        balances.VIC = ethers.utils.formatEther(vicBalance);
        balances.FROLL = ethers.utils.formatUnits(frollBalance, 18);

        // Cập nhật số dư lên giao diện
        fromBalance.textContent = parseFloat(balances[fromToken]).toFixed(18);
        toBalance.textContent = parseFloat(balances[toToken]).toFixed(18);

        console.log("✅ Balances updated:", balances);
    }

    // 📌 Xử lý hoán đổi chiều swap
    swapDirectionButton.addEventListener("click", async () => {
        console.log("🔄 Swap direction...");
        [fromToken, toToken] = [toToken, fromToken];
        fromTokenSymbol.textContent = fromToken;
        toTokenSymbol.textContent = toToken;
        [fromTokenLogo.src, toTokenLogo.src] = [toTokenLogo.src, fromTokenLogo.src];
        
        await updateBalances();
    });

    // 🚀 Tự động kết nối nếu trước đó đã kết nối
    document.addEventListener("DOMContentLoaded", async () => {
        if (window.ethereum && (await window.ethereum.request({ method: "eth_accounts" })).length > 0) {
            await connectWallet();
        }
    });
});

// 📌 Xử lý khi người dùng nhập số lượng hoặc bấm nút Max
const fromAmountInput = document.getElementById("from-amount");
const toAmountInput = document.getElementById("to-amount");
const maxButton = document.getElementById("max-button");

// ✅ Hàm cập nhật số token nhận được
function updateSwapOutput() {
    let fromTokenSymbol = document.getElementById("from-token-symbol").textContent.trim(); // Token đang swap
    let inputAmount = parseFloat(fromAmountInput.value) || 0; // Số lượng token muốn đổi
    let outputAmount = 0; // Số lượng token nhận

    // ✅ Tính số lượng token nhận theo hợp đồng (1 FROLL = 100 VIC, trừ phí 0.01 VIC)
    if (fromTokenSymbol === "VIC") {
        let netVic = inputAmount - 0.01; // Trừ phí swap
        outputAmount = netVic >= 0.001 ? netVic / 100 : 0; // Đảm bảo chỉ hiện nếu >= 0.001 FROLL
    } else {
        let vicAmount = inputAmount * 100; // Quy đổi sang VIC
        outputAmount = vicAmount > 0.01 ? vicAmount - 0.01 : 0; // Trừ phí swap
    }

    // ✅ Hiển thị đúng 18 số thập phân
    toAmountInput.value = outputAmount > 0 ? outputAmount.toFixed(18) : "0.000000000000000000";
}

// 📌 Khi người dùng nhập số lượng token muốn đổi
fromAmountInput.addEventListener("input", updateSwapOutput);

// 📌 Khi bấm nút Max, nhập toàn bộ số dư token vào ô nhập
maxButton.addEventListener("click", async () => {
    let fromTokenSymbol = document.getElementById("from-token-symbol").textContent.trim(); // Token đang swap
    let maxAmount = parseFloat(document.getElementById("from-balance").textContent.trim()) || 0; // Số dư hiện tại

    if (maxAmount > 0) {
        fromAmountInput.value = maxAmount.toFixed(18); // Điền số dư tối đa vào ô nhập với độ chính xác 18 số thập phân
        updateSwapOutput(); // Cập nhật số lượng token nhận
    }
});

// ==============================
// 🔹 HANDLE SWAP TRANSACTION WHEN "SWAP NOW" BUTTON IS CLICKED
// ==============================

document.addEventListener("DOMContentLoaded", function () {
    const swapNowButton = document.getElementById("swap-now");
    const fromAmountInput = document.getElementById("from-amount");
    const toAmountInput = document.getElementById("to-amount");
    const fromTokenSymbol = document.getElementById("from-token-symbol");
    const fromBalance = document.getElementById("from-balance");
    const toBalance = document.getElementById("to-balance");
    const maxButton = document.getElementById("max-button");

    let walletAddress;
    let provider;
    let signer;

    if (!swapNowButton) {
        console.error("❌ Swap Now button not found.");
        return;
    }

    // 📌 Connect Wallet & Get Signer
    async function connectWallet() {
        if (!window.ethereum) {
            alert("❌ Please connect your MetaMask wallet first.");
            return;
        }
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();
    }

    // 📌 Swap Now Click Event
    swapNowButton.addEventListener("click", async function () {
        try {
            await connectWallet();

            let fromAmount = parseFloat(fromAmountInput.value);
            if (isNaN(fromAmount) || fromAmount <= 0) {
                alert("❌ Please enter a valid amount.");
                return;
            }

            console.log(`🔄 Swapping: ${fromAmount} ${fromTokenSymbol.textContent.trim()}`);

            // ✅ Connect to Swap Contract
            const frollSwapContract = new ethers.Contract(FROLLSWAP_CONTRACT_ADDRESS, frollSwapABI, signer);

            let tx;
            if (fromTokenSymbol.textContent.trim() === "VIC") {
                if (fromAmount < 0.011) {
                    alert("❌ Minimum swap amount for VIC is 0.011 VIC.");
                    return;
                }
                // ✅ Swap VIC → FROLL (deducting 0.01 VIC fee)
                tx = await frollSwapContract.swapVicToFroll({ 
                    value: ethers.utils.parseEther(fromAmount.toString()) 
                });
            } else {
                if (fromAmount < 0.00011) {
                    alert("❌ Minimum swap amount for FROLL is 0.00011 FROLL.");
                    return;
                }
                // ✅ Swap FROLL → VIC (approval required first)
                const frollTokenContract = new ethers.Contract(FROLL_CONTRACT_ADDRESS, ["function approve(address spender, uint256 amount) external returns (bool)"], signer);

                // ✅ Approve before swapping
                const frollAmount = ethers.utils.parseUnits(fromAmount.toString(), 18);
                console.log("🔄 Approving FROLL for swap...");
                const approveTx = await frollTokenContract.approve(FROLLSWAP_CONTRACT_ADDRESS, frollAmount);
                await approveTx.wait();
                console.log("✅ Approval successful!");

                // ✅ Swap FROLL → VIC
                tx = await frollSwapContract.swapFrollToVic(frollAmount);
            }

            await tx.wait();
            console.log("✅ Swap completed:", tx.hash);

            // ✅ Show success alert and update balances when clicking OK
            alert("✅ Swap successful!");
            await updateBalances();
            console.log("✅ Balance updated successfully!");
        } catch (error) {
            console.error("❌ Swap failed:", error);
            alert("❌ Swap failed! Please try again.");
        }
    });
});
