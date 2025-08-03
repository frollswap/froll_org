let provider;
let signer;
let userAddress;

const VIC_USDT_API = "https://api.binance.com/api/v3/ticker/price?symbol=VICUSDT";

// Kết nối ví
async function connectWallet() {
  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    document.getElementById("walletAddress").innerText = `Connected: ${userAddress}`;
  } else {
    alert("Please install MetaMask or use a Web3 wallet");
  }
}

// Hiển thị giá FROLL theo USD (100 VIC)
async function fetchPrice() {
  try {
    const res = await fetch(VIC_USDT_API);
    const data = await res.json();
    const vicPrice = parseFloat(data.price);
    const frollPrice = vicPrice * 100;
    document.getElementById("priceDisplay").innerText = `1 FROLL = $${frollPrice.toFixed(4)} USD`;
  } catch (err) {
    document.getElementById("priceDisplay").innerText = "Failed to load price.";
  }
}

// Gọi hàm khi trang tải
window.onload = () => {
  fetchPrice();
};

function showSwap() {
  document.getElementById("main-interface").style.display = "none";
  document.getElementById("swap-interface").classList.remove("hidden");
  document.getElementById("dice-interface").classList.add("hidden");
}

function showDice() {
  document.getElementById("main-interface").style.display = "none";
  document.getElementById("dice-interface").classList.remove("hidden");
  document.getElementById("swap-interface").classList.add("hidden");
}

// Địa chỉ hợp đồng Swap và Token
const FROLL_TOKEN = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const SWAP_CONTRACT = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";

// ABI rút gọn
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function decimals() public view returns (uint8)"
];

const SWAP_ABI = [
  "function swapVicToFroll() payable",
  "function swapFrollToVic(uint256 frollAmount)",
  "function FEE() public view returns (uint256)"
];

// Swap xử lý
async function doSwap() {
  if (!signer) {
    alert("Please connect your wallet first.");
    return;
  }

  const direction = document.getElementById("swapDirection").value;
  const amount = parseFloat(document.getElementById("swapAmount").value);
  const status = document.getElementById("swapStatus");
  status.innerText = "Processing...";

  try {
    const swapContract = new ethers.Contract(SWAP_CONTRACT, SWAP_ABI, signer);

    if (direction === "vicToFroll") {
      const fee = await swapContract.FEE();
      const value = ethers.parseEther((amount + parseFloat(ethers.formatEther(fee))).toString());
      const tx = await swapContract.swapVicToFroll({ value });
      await tx.wait();
      status.innerText = "Swap VIC → FROLL successful!";
    } else {
      const token = new ethers.Contract(FROLL_TOKEN, ERC20_ABI, signer);
      const decimals = await token.decimals();
      const amountWithDecimals = ethers.parseUnits(amount.toString(), decimals);

      const allowance = await token.allowance(userAddress, SWAP_CONTRACT);
      if (allowance < amountWithDecimals) {
        const approveTx = await token.approve(SWAP_CONTRACT, amountWithDecimals);
        await approveTx.wait();
      }

      const tx = await swapContract.swapFrollToVic(amountWithDecimals);
      await tx.wait();
      status.innerText = "Swap FROLL → VIC successful!";
    }
  } catch (err) {
    console.error(err);
    status.innerText = "Swap failed.";
  }
}

// Thông tin hợp đồng FrollDice
const DICE_CONTRACT = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";
const DICE_ABI = [
  "function play(uint8 choice, uint256 minBet) public",
  "function getBalance() public view returns (uint256)"
];

let lastChoice = null;
let lastMinBet = 1;

// Đặt cược Chẵn / Lẻ
async function placeBet(choice) {
  if (!signer) {
    alert("Please connect your wallet first.");
    return;
  }

  const minBetInput = document.getElementById("minBet");
  const minBet = parseFloat(minBetInput.value);
  const status = document.getElementById("diceStatus");

  if (isNaN(minBet) || minBet <= 0) {
    alert("Please enter a valid min bet.");
    return;
  }

  status.innerText = "Placing bet...";

  try {
    const token = new ethers.Contract(FROLL_TOKEN, ERC20_ABI, signer);
    const decimals = await token.decimals();
    const amount = ethers.parseUnits(minBet.toString(), decimals);

    const allowance = await token.allowance(userAddress, DICE_CONTRACT);
    if (allowance < amount) {
      const approveTx = await token.approve(DICE_CONTRACT, amount);
      await approveTx.wait();
    }

    const dice = new ethers.Contract(DICE_CONTRACT, DICE_ABI, signer);
    const tx = await dice.play(choice === "even" ? 0 : 1, minBet);
    await tx.wait();

    status.innerText = `Bet ${choice.toUpperCase()} placed successfully!`;
    lastChoice = choice;
    lastMinBet = minBet;
  } catch (err) {
    console.error(err);
    status.innerText = "Bet failed.";
  }
}

// Các nút phụ
function repeatBet() {
  if (lastChoice && lastMinBet) {
    document.getElementById("minBet").value = lastMinBet;
    placeBet(lastChoice);
  }
}

function doubleBet() {
  const input = document.getElementById("minBet");
  input.value = parseFloat(input.value || "1") * 2;
}

function clearBet() {
  document.getElementById("minBet").value = "";
  document.getElementById("diceStatus").innerText = "";
}

function changeTable() {
  const input = document.getElementById("minBet");
  input.value = Math.floor(Math.random() * 10) + 1;
}
