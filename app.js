let provider, signer, userAddress;
const frollAddress = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const diceAddress = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";
const frollAbi = [ // shortened for clarity
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function decimals() view returns (uint8)"
];
const diceAbi = [
  "function placeBet(uint256 minBet, bool isEven, uint256 amount) external",
  "function getBalance() external view returns (uint256)"
];

async function connectWallet() {
  if (!window.ethereum) {
    alert("Please install MetaMask or use a Web3 browser");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  userAddress = await signer.getAddress();
  document.getElementById("wallet-status").textContent = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
}

function showDice() {
  connectWallet();
  document.getElementById("home").classList.add("hidden");
  document.getElementById("dice-interface").classList.remove("hidden");
}

function showHome() {
  document.getElementById("home").classList.remove("hidden");
  document.getElementById("dice-interface").classList.add("hidden");
}

async function setMinBet() {
  const min = parseFloat(document.getElementById("minBetInput").value);
  if (isNaN(min) || min <= 0) {
    alert("Please enter a valid minimum bet.");
    return;
  }
  alert(`Table set to minimum bet: ${min} FROLL`);
}

async function placeBet(type) {
  const min = parseFloat(document.getElementById("minBetInput").value);
  const amount = parseFloat(document.getElementById("betAmount").value);
  if (!signer || !userAddress) {
    alert("Connect wallet first.");
    return;
  }
  if (isNaN(min) || isNaN(amount) || amount < min || amount <= 0) {
    alert("Invalid bet or minimum value.");
    return;
  }

  const froll = new ethers.Contract(frollAddress, frollAbi, signer);
  const decimals = await froll.decimals();
  const amountInWei = ethers.utils.parseUnits(amount.toString(), decimals);

  const allowance = await froll.allowance(userAddress, diceAddress);
  if (allowance.lt(amountInWei)) {
    const approveTx = await froll.approve(diceAddress, ethers.constants.MaxUint256);
    await approveTx.wait();
  }

  const dice = new ethers.Contract(diceAddress, diceAbi, signer);
  const isEven = type === "even";
  try {
    const tx = await dice.placeBet(
      ethers.utils.parseUnits(min.toString(), decimals),
      isEven,
      amountInWei
    );
    await tx.wait();
    document.getElementById("dice-result").textContent = "🎉 Bet placed successfully!";
  } catch (e) {
    console.error(e);
    document.getElementById("dice-result").textContent = "❌ Bet failed.";
  }
}

function disconnectWallet() {
  provider = null;
  signer = null;
  userAddress = null;
  document.getElementById("wallet-status").textContent = "";
  showHome();
}

function copyText(el) {
  const text = el.textContent;
  navigator.clipboard.writeText(text);
  el.classList.add("copied");
  setTimeout(() => el.classList.remove("copied"), 1500);
}
