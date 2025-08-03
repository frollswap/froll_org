let provider;
let signer;
let userAddress;

// FROLL token & Swap contract (trên mạng VIC)
const FROLL_ADDRESS = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const SWAP_CONTRACT_ADDRESS = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";

// Kết nối ví
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert("Please install MetaMask or use a Web3-enabled browser.");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  userAddress = await signer.getAddress();

  const network = await provider.getNetwork();
  if (network.chainId !== 88) {
    alert("Please switch to the Viction network.");
    return;
  }

  document.getElementById("froll-price").innerText = `Wallet: ${shortenAddress(userAddress)}`;
}

// Rút gọn địa chỉ ví cho đẹp
function shortenAddress(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// Sự kiện hiển thị giao diện SWAP
document.getElementById("show-swap").addEventListener("click", () => {
  document.getElementById("swap-interface").style.display = "block";
  document.getElementById("dice-interface").style.display = "none";
  loadSwapUI();
});

// Sự kiện hiển thị giao diện DICE
document.getElementById("show-dice").addEventListener("click", () => {
  document.getElementById("swap-interface").style.display = "none";
  document.getElementById("dice-interface").style.display = "block";
  loadDiceUI();
});

function loadSwapUI() {
  const container = document.getElementById("swap-interface");
  container.innerHTML = `
    <h2>🔁 Swap VIC ↔ FROLL</h2>
    <p>1 FROLL = 100 VIC &nbsp; | &nbsp; Fee: 0.01 VIC</p>

    <div style="margin-top:15px">
      <input type="number" id="vic-input" placeholder="VIC amount" />
      <button onclick="swapVicToFroll()">Swap VIC → FROLL</button>
    </div>

    <div style="margin-top:15px">
      <input type="number" id="froll-input" placeholder="FROLL amount" />
      <button onclick="swapFrollToVic()">Swap FROLL → VIC</button>
    </div>
  `;
}

// Giao diện đơn giản, không cần ABI đầy đủ – chỉ gọi đúng hàm
const SWAP_ABI = [
  "function swapVicToFroll() payable",
  "function swapFrollToVic(uint256 amount)",
  "function FEE() view returns (uint256)"
];
const frollAbi = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function decimals() public view returns (uint8)"
];

async function swapVicToFroll() {
  const vicAmount = document.getElementById("vic-input").value;
  if (!vicAmount || vicAmount <= 0) return alert("Enter VIC amount");

  const contract = new ethers.Contract(SWAP_CONTRACT_ADDRESS, SWAP_ABI, signer);
  const fee = ethers.utils.parseEther("0.01");
  const value = ethers.utils.parseEther(vicAmount);

  try {
    const tx = await contract.swapVicToFroll({ value: value.add(fee) });
    await tx.wait();
    alert("Swapped VIC → FROLL successfully!");
  } catch (err) {
    console.error(err);
    alert("Swap failed.");
  }
}

async function swapFrollToVic() {
  const frollAmount = document.getElementById("froll-input").value;
  if (!frollAmount || frollAmount <= 0) return alert("Enter FROLL amount");

  const token = new ethers.Contract(FROLL_ADDRESS, frollAbi, signer);
  const contract = new ethers.Contract(SWAP_CONTRACT_ADDRESS, SWAP_ABI, signer);

  const amount = ethers.utils.parseUnits(frollAmount, 18);
  const allowance = await token.allowance(userAddress, SWAP_CONTRACT_ADDRESS);

  try {
    if (allowance.lt(amount)) {
      const txApprove = await token.approve(SWAP_CONTRACT_ADDRESS, amount);
      await txApprove.wait();
    }

    const tx = await contract.swapFrollToVic(amount);
    await tx.wait();
    alert("Swapped FROLL → VIC successfully!");
  } catch (err) {
    console.error(err);
    alert("Swap failed.");
  }
}

function loadDiceUI() {
  const container = document.getElementById("dice-interface");
  container.innerHTML = `
    <h2>🎲 Even or Odd – Bet with FROLL</h2>
    <p>Choose your side and amount, then place your bet:</p>

    <div style="margin-top:15px">
      <select id="bet-choice">
        <option value="even">Even (Chẵn)</option>
        <option value="odd">Odd (Lẻ)</option>
      </select>
    </div>

    <div style="margin-top:10px">
      <input type="number" id="bet-amount" placeholder="Amount in FROLL" />
    </div>

    <div style="margin-top:10px">
      <button onclick="alert('Feature coming soon')">🎮 Place Bet</button>
    </div>

    <p style="margin-top:20px; font-style:italic">* This is a 50:50 fair game using blockchain hash. Results are verifiable.</p>
  `;
}
