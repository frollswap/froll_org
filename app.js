// === app.js — FROLL.org (Phần 1/3) ===

// --- Cấu hình địa chỉ và ABI ---
const frollTokenAddress = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const frollSwapAddress = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";
const frollDiceAddress = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";

// --- Khai báo ABI rút gọn ---
const frollTokenAbi = [
  { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "approve", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "address", "name": "spender", "type": "address" }], "name": "allowance", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }
];

const frollSwapAbi = [
  { "inputs": [], "name": "swapVicToFroll", "outputs": [], "stateMutability": "payable", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "frollAmount", "type": "uint256" }], "name": "swapFrollToVic", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "getContractBalances", "outputs": [{ "internalType": "uint256", "name": "vicBalance", "type": "uint256" }, { "internalType": "uint256", "name": "frollBalance", "type": "uint256" }], "stateMutability": "view", "type": "function" }
];

// --- Biến toàn cục ---
let provider, signer, userAddress;
let frollToken, frollSwap;

// --- Kết nối ví ---
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert("Please install MetaMask to use this app.");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  userAddress = await signer.getAddress();

  const network = await provider.getNetwork();
  if (network.chainId !== 88) {
    alert("Please switch to Viction Network (Chain ID: 88)");
    return;
  }

  frollToken = new ethers.Contract(frollTokenAddress, frollTokenAbi, signer);
  frollSwap = new ethers.Contract(frollSwapAddress, frollSwapAbi, signer);

  updateWalletInfo();
}

// --- Cập nhật thông tin ví ---
async function updateWalletInfo() {
  document.querySelector(".price-container").insertAdjacentHTML(
    "beforeend",
    `<p style="margin-top:10px;font-size:0.9em;">Wallet: <span style="font-weight:bold">${userAddress}</span></p>`
  );

  const vicBalance = await provider.getBalance(userAddress);
  const frollBalance = await frollToken.balanceOf(userAddress);

  document.querySelector(".price-container").insertAdjacentHTML(
    "beforeend",
    `<p style="font-size:0.95em;">VIC: ${ethers.utils.formatEther(vicBalance)} | FROLL: ${ethers.utils.formatUnits(frollBalance, 18)}</p>`
  );
}

// --- Xử lý giao diện chuyển đổi ---
document.getElementById("show-swap").addEventListener("click", () => {
  document.getElementById("swap-interface").style.display = "block";
  document.getElementById("dice-interface").style.display = "none";
  document.querySelector(".token-info").style.display = "none";
  document.querySelector(".game-banner").style.display = "none";
  document.querySelectorAll(".guide").forEach(el => el.style.display = "none");
});

document.getElementById("show-dice").addEventListener("click", () => {
  document.getElementById("swap-interface").style.display = "none";
  document.getElementById("dice-interface").style.display = "block";
  document.querySelector(".token-info").style.display = "none";
  document.querySelector(".game-banner").style.display = "none";
  document.querySelectorAll(".guide").forEach(el => el.style.display = "none");
});

// --- Kết nối ví khi tải trang ---
window.addEventListener("load", () => {
  connectWallet();
});

// === Dice Game – Even or Odd ===

// Thêm giao diện vào #dice-interface
function renderDiceGame() {
  const diceDiv = document.getElementById("dice-interface");
  diceDiv.innerHTML = `
    <h2>🎲 Play Dice – Even or Odd</h2>
    <div style="max-width:400px;margin:0 auto;text-align:left;">
      <label for="betAmount"><strong>Bet Amount (FROLL):</strong></label>
      <input type="number" id="betAmount" placeholder="e.g. 1" style="width:100%;padding:8px;margin:10px 0;" min="0.001" step="0.001" />
      <div style="display:flex;justify-content:space-between;margin:15px 0;">
        <button class="button" onclick="placeDiceBet(0)">Bet on Even</button>
        <button class="button" onclick="placeDiceBet(1)">Bet on Odd</button>
      </div>
      <div id="dice-result" style="margin-top:20px;font-weight:bold;"></div>
    </div>
  `;
}
renderDiceGame();

// Gọi contract FrollDice
const frollDiceAbi = [
  {
    "inputs": [
      { "internalType": "uint8", "name": "choice", "type": "uint8" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "bet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "player", "type": "address" },
      { "indexed": false, "internalType": "uint8", "name": "choice", "type": "uint8" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "bool", "name": "win", "type": "bool" }
    ],
    "name": "BetResult",
    "type": "event"
  }
];

let frollDice = new ethers.Contract(frollDiceAddress, frollDiceAbi, signer);

// Xử lý đặt cược
async function placeDiceBet(choice) {
  const amountInput = document.getElementById("betAmount");
  const amount = parseFloat(amountInput.value);
  const resultDiv = document.getElementById("dice-result");

  if (!amount || amount <= 0) {
    alert("Please enter a valid bet amount.");
    return;
  }

  const betAmount = ethers.utils.parseUnits(amount.toString(), 18);

  try {
    // Check allowance
    const allowance = await frollToken.allowance(userAddress, frollDiceAddress);
    if (allowance.lt(betAmount)) {
      const approveTx = await frollToken.approve(frollDiceAddress, betAmount);
      resultDiv.innerText = "Approving FROLL...";
      await approveTx.wait();
    }

    // Gọi hàm bet
    const tx = await frollDice.bet(choice, betAmount);
    resultDiv.innerText = "Placing bet... Waiting for confirmation...";
    await tx.wait();
    resultDiv.innerText = "Bet confirmed! Waiting for result...";

    // Đợi sự kiện trả về
    listenForBetResult();

  } catch (err) {
    console.error(err);
    alert("Error placing bet.");
  }
}

// Nghe sự kiện kết quả
function listenForBetResult() {
  const resultDiv = document.getElementById("dice-result");
  frollDice.once("BetResult", (player, choice, amount, win) => {
    const betSide = choice === 0 ? "Even" : "Odd";
    const outcome = win ? "🎉 You WON!" : "😢 You lost.";
    resultDiv.innerText = `You bet on ${betSide} – ${outcome}`;
    updateWalletInfo(); // cập nhật lại số dư
  });
}

// === Swap FROLL <=> VIC ===

// Tạo giao diện swap
function renderSwapUI() {
  const swapDiv = document.getElementById("swap-interface");
  swapDiv.innerHTML = `
    <h2>🔁 Swap FROLL ↔ VIC</h2>
    <div style="max-width:400px;margin:0 auto;text-align:left;">
      <p style="font-size:0.95em;">Swap is fixed at <strong>1 FROLL = 100 VIC</strong><br>Fee: <strong>0.01 VIC</strong> per swap</p>

      <div style="margin-top:20px;">
        <label><strong>Swap VIC → FROLL</strong></label><br>
        <input type="number" id="vicToFrollInput" placeholder="e.g. 1 VIC" style="width:100%;padding:8px;margin:8px 0;" min="0.02" step="0.01" />
        <button class="button" onclick="swapVicToFroll()">Swap Now</button>
      </div>

      <hr style="margin:20px 0;" />

      <div>
        <label><strong>Swap FROLL → VIC</strong></label><br>
        <input type="number" id="frollToVicInput" placeholder="e.g. 1 FROLL" style="width:100%;padding:8px;margin:8px 0;" min="0.01" step="0.001" />
        <button class="button" onclick="swapFrollToVic()">Swap Now</button>
      </div>

      <div id="swap-status" style="margin-top:20px;font-weight:bold;"></div>
    </div>
  `;
}
renderSwapUI();

// Swap VIC → FROLL
async function swapVicToFroll() {
  const amount = parseFloat(document.getElementById("vicToFrollInput").value);
  const status = document.getElementById("swap-status");

  if (!amount || amount <= 0.01) {
    alert("Enter a VIC amount greater than 0.01 (fee).");
    return;
  }

  const value = ethers.utils.parseEther(amount.toString());

  try {
    const tx = await frollSwap.swapVicToFroll({ value });
    status.innerText = "Swapping... Please wait.";
    await tx.wait();
    status.innerText = "✅ Swap successful!";
    updateWalletInfo();
  } catch (err) {
    console.error(err);
    alert("Swap failed.");
  }
}

// Swap FROLL → VIC
async function swapFrollToVic() {
  const amount = parseFloat(document.getElementById("frollToVicInput").value);
  const status = document.getElementById("swap-status");

  if (!amount || amount <= 0) {
    alert("Enter a valid FROLL amount.");
    return;
  }

  const frollAmount = ethers.utils.parseUnits(amount.toString(), 18);

  try {
    const allowance = await frollToken.allowance(userAddress, frollSwapAddress);
    if (allowance.lt(frollAmount)) {
      const approveTx = await frollToken.approve(frollSwapAddress, frollAmount);
      status.innerText = "Approving FROLL...";
      await approveTx.wait();
    }

    const tx = await frollSwap.swapFrollToVic(frollAmount);
    status.innerText = "Swapping... Please wait.";
    await tx.wait();
    status.innerText = "✅ Swap successful!";
    updateWalletInfo();
  } catch (err) {
    console.error(err);
    alert("Swap failed.");
  }
}

