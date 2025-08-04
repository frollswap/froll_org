// Connect to MetaMask or Viction wallet
let provider;
let signer;
let userAddress;
let frollBalance = 0;
let vicBalance = 0;

const connectWalletBtn = document.getElementById('connect-wallet-btn');
const walletDetails = document.getElementById('wallet-details');
const walletAddress = document.getElementById('wallet-address');
const frollBalanceElement = document.getElementById('froll-balance');
const vicBalanceElement = document.getElementById('vic-balance');
const swapBtn = document.getElementById('swap-btn');
const playBtn = document.getElementById('play-btn');
const tableSelection = document.getElementById('table-selection');
const minBetElement = document.getElementById('min-bet');
const maxBetElement = document.getElementById('max-bet');
const betAmountInput = document.getElementById('bet-amount');
const selectTableBtn = document.getElementById('select-table-btn');

connectWalletBtn.addEventListener('click', connectWallet);
swapBtn.addEventListener('click', openSwap);
playBtn.addEventListener('click', openPlay);
selectTableBtn.addEventListener('click', selectTable);

async function connectWallet() {
  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    const network = await provider.getNetwork();

    if (network.chainId === 56) {
      const frollContract = new ethers.Contract(
        '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // Address of the FROLL contract
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );

      const vicContract = new ethers.Contract(
        '0x9197BF0813e0727df4555E8cb43a0977F4a3A068', // Address of the VIC contract
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );

      frollBalance = await frollContract.balanceOf(userAddress);
      vicBalance = await vicContract.balanceOf(userAddress);

      walletAddress.textContent = userAddress;
      frollBalanceElement.textContent = ethers.utils.formatUnits(frollBalance, 18);
      vicBalanceElement.textContent = ethers.utils.formatUnits(vicBalance, 18);

      walletDetails.style.display = 'block';
      connectWalletBtn.textContent = 'Disconnect Wallet';
      connectWalletBtn.removeEventListener('click', connectWallet);
      connectWalletBtn.addEventListener('click', disconnectWallet);

    } else {
      alert('Please connect to the BNB network.');
    }
  } else {
    alert('Please install MetaMask or Viction to continue.');
  }
}

function disconnectWallet() {
  window.location.reload();
}

function openSwap() {
  alert('Swap FROLL/VIC functionality will be available here!');
}

function openPlay() {
  tableSelection.style.display = 'block';
}

async function selectTable() {
  const minBet = parseFloat(minBetElement.textContent);
  const maxBet = minBet * 50;  // Max bet is 50 times the min bet

  const betAmount = parseFloat(betAmountInput.value);

  if (betAmount < minBet || betAmount > maxBet) {
    alert(`Bet amount must be between ${minBet} and ${maxBet} FROLL.`);
    return;
  }

  if (betAmount > frollBalance) {
    alert('Insufficient FROLL balance.');
    return;
  }

  // Transfer FROLL to the game contract for betting
  const frollContract = new ethers.Contract(
    '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // Address of the FROLL contract
    ['function transfer(address recipient, uint256 amount)'],
    signer
  );

  const tx = await frollContract.transfer(
    '0x85A12591d3BA2A7148d18e9Ca44E0D778e458906', // Corrected contract address for the Dice Game
    ethers.utils.parseUnits(betAmount.toString(), 18)
  );

  await tx.wait();
  alert('Bet placed successfully.');

  // Simulate game result
  simulateGameResult();
}

function simulateGameResult() {
  const randomNumber = Math.floor(Math.random() * 100); // Generate a random number between 0 and 99

  let result = 'Lose';
  if (randomNumber < 50) {
    result = 'Win';
  }

  alert(`Game Result: ${result}`);
}
