const FROLL_ADDRESS = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const SWAP_ADDRESS = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";
const DICE_ADDRESS = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";
const FROLL_ABI = [
  "function approve(address spender, uint amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() view returns (uint8)"
];
const SWAP_ABI = [
  "function swapVicToFroll(uint256 amount) external payable",
  "function swapFrollToVic(uint256 amount) external",
  "function addLiquidity() external payable",
  "function withdraw() external",
  "function getContractBalances() external view returns (uint256 vicBalance, uint256 frollBalance)"
];
const DICE_ABI = [
  "function placeBet(uint8 choice, uint256 amount) external",
  "function setMinBet(uint256 _minBet) external",
  "function getBalance() external view returns (uint256)",
  "function withdraw() external",
  "event Played(address indexed player, bool win, uint256 amount, uint8 result, uint8 choice)"
];

let provider, signer, froll, swap, dice, user;

async function connect() {
  if (!window.ethereum) return alert("Please install MetaMask or Viction Wallet.");
  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  user = await signer.getAddress();

  froll = new ethers.Contract(FROLL_ADDRESS, FROLL_ABI, signer);
  swap = new ethers.Contract(SWAP_ADDRESS, SWAP_ABI, signer);
  dice = new ethers.Contract(DICE_ADDRESS, DICE_ABI, signer);
}

function showHome() {
  document.getElementById("swap-interface").classList.add("hidden");
  document.getElementById("dice-interface").classList.add("hidden");
}

function showSwap() {
  document.getElementById("swap-interface").classList.remove("hidden");
  document.getElementById("dice-interface").classList.add("hidden");
  connect();
}

function showDice() {
  document.getElementById("dice-interface").classList.remove("hidden");
  document.getElementById("swap-interface").classList.add("hidden");
  connect();
}

function hideDice() {
  document.getElementById("dice-interface").classList.add("hidden");
}

function disconnectWallet() {
  provider = null;
  signer = null;
  froll = null;
  swap = null;
  dice = null;
  user = null;
}

// Swap logic
async function calculateSwapOutput() {
  const amount = parseFloat(document.getElementById("swap-amount").value);
  const direction = document.getElementById("swap-direction").value;
  if (isNaN(amount) || amount <= 0) {
    document.getElementById("swap-result").textContent = "0";
    return;
  }

  let result = 0;
  if (direction === "vic-to-froll") {
    result = (amount - 0.01) / 100;
  } else {
    result = (amount * 100) - 0.01;
  }

  document.getElementById("swap-result").textContent = result > 0 ? result.toFixed(4) : "0";
}

async function executeSwap() {
  await connect();
  const amount = parseFloat(document.getElementById("swap-amount").value);
  const direction = document.getElementById("swap-direction").value;
  if (!amount || amount <= 0) return alert("Enter valid amount");

  const decimals = await froll.decimals();
  const amt = ethers.utils.parseUnits(amount.toString(), decimals);

  if (direction === "vic-to-froll") {
    const tx = await swap.swapVicToFroll(amt, { value: ethers.utils.parseEther(amount.toString()) });
    await tx.wait();
    alert("Swap VIC → FROLL successful!");
  } else {
    const allowance = await froll.allowance(user, SWAP_ADDRESS);
    if (allowance.lt(amt)) {
      const tx1 = await froll.approve(SWAP_ADDRESS, ethers.constants.MaxUint256);
      await tx1.wait();
    }
    const tx2 = await swap.swapFrollToVic(amt);
    await tx2.wait();
    alert("Swap FROLL → VIC successful!");
  }
}

// Dice game logic
function setMinBet() {
  const minBet = parseFloat(document.getElementById("minBetInput").value);
  if (!minBet || minBet <= 0) return alert("Enter min bet amount");
  connect().then(async () => {
    const decimals = await froll.decimals();
    const amt = ethers.utils.parseUnits(minBet.toString(), decimals);
    const tx = await dice.setMinBet(amt);
    await tx.wait();
    alert("Min bet set");
  });
}

function placeBet(choiceStr) {
  const betAmount = parseFloat(document.getElementById("betAmount").value);
  if (!betAmount || betAmount <= 0) return alert("Enter bet amount");

  const choice = choiceStr === "even" ? 0 : 1;
  connect().then(async () => {
    const decimals = await froll.decimals();
    const amt = ethers.utils.parseUnits(betAmount.toString(), decimals);
    const allowance = await froll.allowance(user, DICE_ADDRESS);
    if (allowance.lt(amt)) {
      const tx1 = await froll.approve(DICE_ADDRESS, ethers.constants.MaxUint256);
      await tx1.wait();
    }
    const tx2 = await dice.placeBet(choice, amt);
    await tx2.wait();
    document.getElementById("dice-result").textContent = "Bet placed. Result will appear on chain shortly.";
  });
}

// Utility
function copyText(el) {
  const temp = document.createElement("textarea");
  temp.value = el.textContent;
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  document.body.removeChild(temp);
  alert("Copied: " + temp.value);
}
