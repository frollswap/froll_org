/* ============================================================
   FROLL Dice – app.js (VIC)  —  FIXED CONNECT
   Giao diện web: tiếng Anh | Chú thích: tiếng Việt
   ============================================================ */

/** ===================== [MỤC 1] CẤU HÌNH CHUNG ===================== **/
const CONFIG = {
  chainIdHex: '0x58', // VIC mainnet (88)
  chainIdDec: 88,
  chainName: 'Viction',
  rpcUrl: 'https://rpc.viction.xyz',
  blockExplorer: 'https://vicscan.xyz',
  FROLL: '0xB4d562A8f811CE7F134a1982992Bd153902290BC',
  DICE:  '0x85A12591d3BA2A7148d18e9Ca44E0D778e458906',
  minMinBet: '0.001',
  logsLookbackBlocks: 5000
};

/** ===================== [MỤC 2] ABI TỐI THIỂU ===================== **/
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)'
];
const DICE_ABI = [
  'function selectTable(uint256 _minBet) external',
  'function play(uint256 amount, bool guessEven) external',
  'function withdraw(uint256 amount) external',
  'function getBalance() external view returns (uint256)',
  'function playerTable(address) external view returns (uint256 minBet, uint256 maxBet)',
  'event Played(address indexed player, uint256 amount, bool guessEven, bool resultEven, bool win)'
];

/** ===================== [MỤC 3] BIẾN TRẠNG THÁI ===================== **/
let providerRW, providerRO, signer, user, froll, dice;
let frollDecimals = 18;
let currentSide = 'even';
let currentTable = { min: null, max: null };
let lastRound = null;

/** ===================== [MỤC 4] TIỆN ÍCH CHUNG ===================== **/
const $ = (id) => document.getElementById(id);
const format = (v, digits = 4) => Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
const toWei = (numStr, decimals = 18) => ethers.utils.parseUnits(String(numStr || '0'), decimals);
const fromWei = (wei, decimals = 18, digits = 4) => {
  try { return format(ethers.utils.formatUnits(wei || 0, decimals), digits); } catch { return '0'; }
};
function setStatus(msg) { $('tx-status') && ($('tx-status').textContent = msg || ''); }
function short(s) { return s ? s.slice(0, 6) + '…' + s.slice(-4) : '—'; }
function saveLastRound(o){ try{ localStorage.setItem('froll_dice_last_round', JSON.stringify(o)); }catch{} }
function loadLastRound(){ try{ const s = localStorage.getItem('froll_dice_last_round'); return s?JSON.parse(s):null; }catch{ return null; } }
function saveLastTableMin(min){ try{ localStorage.setItem('froll_dice_last_min', String(min)); }catch{} }
function loadLastTableMin(){ try{ return localStorage.getItem('froll_dice_last_min'); }catch{ return null; } }

/** ===================== [MỤC 5] PHÁT HIỆN VÍ/PROVIDER ===================== **/
// Một số trình duyệt có nhiều injector: chọn MetaMask ưu tiên
function getInjectedProvider() {
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers && Array.isArray(eth.providers)) {
    // Ưu tiên MetaMask nếu có
    const metamask = eth.providers.find(p => p.isMetaMask);
    if (metamask) return metamask;
    // Nếu không có MetaMask, dùng provider đầu tiên
    return eth.providers[0];
  }
  return eth;
}

/** ===================== [MỤC 6] BÁT XÓC & 5 KIỂU MỞ BÁT ===================== **/
function startShake(){ const b=$('bowl'); b && b.classList.add('shaking'); }
function stopShake(){ const b=$('bowl'); b && b.classList.remove('shaking'); }
function variantFromHash(txHash, mod){
  if (!txHash) return 0;
  try { return parseInt(txHash.slice(-4), 16) % mod; } catch { return 0; }
}
function renderCoins({ parityEven, txHash }){
  const coinsEl = $('coins');
  if (!coinsEl) return;
  coinsEl.className = 'coins'; // reset class
  coinsEl.innerHTML = '';

  if (parityEven) {
    const layouts = ['layout-even-0','layout-even-2a','layout-even-4'];
    const cls = layouts[variantFromHash(txHash, layouts.length)];
    coinsEl.classList.add(cls);
    const redsMap = { 'layout-even-0':0, 'layout-even-2a':2, 'layout-even-4':4 };
    const reds = redsMap[cls];
    for (let i=0;i<4;i++){
      const coin = document.createElement('div');
      coin.className = 'coin ' + (i < reds ? 'red' : 'white');
      coinsEl.appendChild(coin);
    }
  } else {
    const layouts = ['layout-odd-1','layout-odd-3a'];
    const cls = layouts[variantFromHash(txHash, layouts.length)];
    coinsEl.classList.add(cls);
    const redsMap = { 'layout-odd-1':1, 'layout-odd-3a':3 };
    const reds = redsMap[cls];
    for (let i=0;i<4;i++){
      const coin = document.createElement('div');
      coin.className = 'coin ' + (i < reds ? 'red' : 'white');
      coinsEl.appendChild(coin);
    }
  }
}

/** ===================== [MỤC 7] KẾT QUẢ & BÀN ===================== **/
function showResult({ resultEven, win, txHash }){
  $('last-outcome').textContent = (resultEven==null) ? '—' : (resultEven ? 'Even' : 'Odd');
  $('last-payout').textContent  = (win==null) ? '—' : (win ? 'Win' : 'Lose');
  $('last-tx').textContent      = txHash || '—';
  if (txHash){
    const el=$('last-tx');
    el.title = txHash;
    el.onclick = () => window.open(`${CONFIG.blockExplorer}/tx/${txHash}`, '_blank');
    el.style.cursor = 'pointer';
  }
  renderCoins({ parityEven: !!resultEven, txHash });
}
function showTable(minWei, maxWei){
  if (!minWei || !maxWei){
    $('current-table').textContent = 'Not set';
    $('limit-min').textContent = '—';
    $('limit-max').textContent = '—';
    currentTable = { min:null, max:null };
    return;
  }
  const minF = fromWei(minWei, frollDecimals);
  const maxF = fromWei(maxWei, frollDecimals);
  $('current-table').textContent = `${minF} – ${maxF} FROLL`;
  $('limit-min').textContent = minF;
  $('limit-max').textContent = maxF;
  currentTable = { min:minWei, max:maxWei };
}

/** ===================== [MỤC 8] ĐỌC DỮ LIỆU CHUẨN BỊ UI ===================== **/
async function refreshBalances(){
  if (!user || !froll || !providerRW) return;
  const [vic, fr, pool] = await Promise.all([
    providerRW.getBalance(user),
    froll.balanceOf(user),
    froll.balanceOf(CONFIG.DICE),
  ]);
  $('vic-balance').textContent   = fromWei(vic, 18);
  $('froll-balance').textContent = fromWei(fr, frollDecimals);
  $('pool-balance').textContent  = fromWei(pool, frollDecimals);
}
async function refreshUserTable(){
  if (!user || !dice) return;
  const t = await dice.playerTable(user);
  const [min, max] = t;
  if (min.gt(0)) showTable(min, max);
}
async function showLatestContractRound(){
  try{
    const ro = providerRO || new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
    const current = await ro.getBlockNumber();
    const from = Math.max(current - CONFIG.logsLookbackBlocks, 0);
    const iface = new ethers.utils.Interface(DICE_ABI);
    const topic0 = iface.getEventTopic('Played');
    const logs = await ro.getLogs({ address:CONFIG.DICE, fromBlock:from, toBlock:current, topics:[topic0] });
    if (!logs.length){ showResult({ resultEven:true, win:null, txHash:null }); return; }
    const last = logs[logs.length-1];
    const parsed = iface.parseLog(last);
    showResult({ resultEven: parsed.args.resultEven, win:null, txHash: last.transactionHash });
  }catch(e){
    console.error('showLatestContractRound error:', e);
    showResult({ resultEven:true, win:null, txHash:null });
  }
}

/** ===================== [MỤC 9] KẾT NỐI VÍ (ĐÃ VÁ) ===================== **/
async function connectWallet(){
  try {
    // Kiểm tra HTTPS (một số ví chặn trên http)
    if (location.protocol !== 'https:'){
      setStatus('This site should be served over HTTPS for wallet connection.');
      console.warn('Non-HTTPS origin may block wallet connection.');
    }

    const injected = getInjectedProvider();
    if (!injected){
      setStatus('No Web3 wallet detected. Please install MetaMask or Viction wallet.');
      alert('No Web3 wallet detected. Please install MetaMask or Viction wallet.');
      return;
    }

    // Tạo provider từ injected
    providerRW = new ethers.providers.Web3Provider(injected, 'any');
    providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);

    // 1) Request accounts
    await providerRW.send('eth_requestAccounts', []);

    // 2) Switch/Add chain
    const currentChainId = await providerRW.send('eth_chainId', []);
    if (currentChainId !== CONFIG.chainIdHex){
      try {
        await providerRW.send('wallet_switchEthereumChain', [{ chainId: CONFIG.chainIdHex }]);
      } catch (switchErr) {
        if (switchErr.code === 4902){
          await providerRW.send('wallet_addEthereumChain', [{
            chainId: CONFIG.chainIdHex,
            chainName: CONFIG.chainName,
            nativeCurrency: { name:'VIC', symbol:'VIC', decimals:18 },
            rpcUrls: [CONFIG.rpcUrl],
            blockExplorerUrls: [CONFIG.blockExplorer]
          }]);
        } else {
          console.error('wallet_switchEthereumChain error:', switchErr);
          throw switchErr;
        }
      }
    }

    // 3) Signer & address
    signer = providerRW.getSigner();
    user = await signer.getAddress();

    // 4) Contracts
    froll = new ethers.Contract(CONFIG.FROLL, ERC20_ABI, signer);
    dice  = new ethers.Contract(CONFIG.DICE,  DICE_ABI,  signer);
    try { frollDecimals = await froll.decimals(); } catch {}

    // 5) UI
    $('btn-connect').classList.add('hidden');
    $('wallet-info').classList.remove('hidden');
    $('addr-short').textContent = short(user);

    // 6) Data
    await Promise.all([refreshBalances(), refreshUserTable()]);
    setStatus('Wallet connected.');

    // 7) Events: account/chain changed
    injected.on?.('accountsChanged', async (accs) => {
      if (!accs || !accs.length){ disconnectWallet(); return; }
      user = accs[0];
      signer = providerRW.getSigner();
      $('addr-short').textContent = short(user);
      await Promise.all([refreshBalances(), refreshUserTable()]);
      setStatus('Account changed.');
    });
    injected.on?.('chainChanged', async (chainId) => {
      if (chainId !== CONFIG.chainIdHex){
        setStatus('Wrong network. Please switch to VIC.');
      } else {
        setStatus('Network OK (VIC).');
        await Promise.all([refreshBalances(), refreshUserTable()]);
      }
    });

  } catch (err){
    console.error('connectWallet error:', err);
    setStatus('Wallet connection failed. Open your wallet and try again.');
    alert('Wallet connection failed. Please try again.');
  }
}
function disconnectWallet(){
  user = null; signer = null; providerRW = null;
  $('btn-connect').classList.remove('hidden');
  $('wallet-info').classList.add('hidden');
  $('addr-short').textContent = '—';
  showTable(null, null);
  setStatus('Disconnected.');
}

/** ===================== [MỤC 10] CHỌN BÀN ===================== **/
function isGTE(numStr, minStr){
  try{
    return ethers.utils.parseUnits(numStr, frollDecimals)
      .gte(ethers.utils.parseUnits(minStr, frollDecimals));
  }catch{ return false; }
}
async function onSetTable(){
  if (!signer || !dice) return alert('Please connect wallet.');
  const minStr = $('minBet').value.trim();
  if (!minStr) return setStatus('Enter a min bet.');
  if (!isGTE(minStr, CONFIG.minMinBet))
    return setStatus(`Min Bet must be at least ${CONFIG.minMinBet} FROLL.`);

  try{
    setStatus('Sending selectTable transaction...');
    const tx = await dice.selectTable(toWei(minStr, frollDecimals));
    await tx.wait(1);
    saveLastTableMin(minStr);
    await refreshUserTable();
    setStatus('Table set successfully.');
  }catch(e){
    console.error('selectTable error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'selectTable failed.');
  }
}

/** ===================== [MỤC 11] APPROVE ===================== **/
async function onApprove(){
  if (!signer || !froll) return alert('Please connect wallet.');
  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  if (!currentTable.min) return setStatus('Please set a table first.');
  const amountWei = toWei(amtStr, frollDecimals);
  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max))
    return setStatus('Bet amount is out of range (min–max).');

  try{
    setStatus('Sending approve...');
    const tx = await froll.approve(CONFIG.DICE, amountWei);
    await tx.wait(1);
    setStatus('Approve successful.');
    await refreshBalances();
  }catch(e){
    console.error('approve error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'Approve failed.');
  }
}

/** ===================== [MỤC 12] CHƠI (PLAY) ===================== **/
async function onPlay(){
  if (!signer || !dice) return alert('Please connect wallet.');
  if (!currentTable.min) return setStatus('Please set a table first.');

  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  const amountWei = toWei(amtStr, frollDecimals);
  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max))
    return setStatus('Bet amount is out of range (min–max).');

  const pool = await froll.balanceOf(CONFIG.DICE);
  if (pool.lt(amountWei.mul(2)))
    return setStatus('Contract pool is insufficient for 2× payout. Try a smaller amount.');

  const allowance = await froll.allowance(user, CONFIG.DICE);
  if (allowance.lt(amountWei))
    return setStatus('Insufficient allowance. Please click "Approve FROLL" first.');

  startShake();
  setStatus('Sending play transaction...');

  try{
    const guessEven = (currentSide === 'even');
    const tx = await dice.play(amountWei, guessEven);
    const receipt = await tx.wait(1);

    // Tìm event Played trong receipt của chính tx này
    let resultEven=null, win=null;
    for (const log of receipt.logs){
      try{
        const parsed = dice.interface.parseLog(log);
        if (parsed.name === 'Played'){
          resultEven = parsed.args.resultEven;
          win = parsed.args.win;
          break;
        }
      }catch{}
    }

    stopShake();
    showResult({ resultEven, win, txHash: tx.hash });

    lastRound = { side: currentSide, amount: amtStr, minBet: fromWei(currentTable.min, frollDecimals), txHash: tx.hash };
    saveLastRound(lastRound);
    await refreshBalances();
    setStatus('Round completed.');
  }catch(e){
    console.error('play error:', e);
    stopShake();
    setStatus(e.data?.message || e.error?.message || e.message || 'Play failed.');
  }
}

/** ===================== [MỤC 13] NÚT TIỆN ÍCH ===================== **/
function onClear(){ $('bet-amount').value=''; setStatus(''); }
function onHalf(){
  const v = parseFloat($('bet-amount').value || '0');
  if (v <= 0) return;
  $('bet-amount').value = String(Math.max(v/2, Number(CONFIG.minMinBet)));
}
function onDouble(){
  const v = parseFloat($('bet-amount').value || '0');
  const max = currentTable.max ? parseFloat(fromWei(currentTable.max, frollDecimals, 18)) : Infinity;
  if (v <= 0){
    if (currentTable.min) $('bet-amount').value = fromWei(currentTable.min, frollDecimals, 18);
    return;
  }
  $('bet-amount').value = String(Math.min(v*2, max));
}
function onRepeat(){
  const saved = loadLastRound();
  if (!saved) return setStatus('No previous round to repeat.');
  currentSide = saved.side === 'odd' ? 'odd' : 'even';
  document.querySelectorAll('.btn.toggle').forEach(b => b.classList.remove('active'));
  (currentSide === 'even' ? $('btn-even') : $('btn-odd')).classList.add('active');
  $('bet-amount').value = saved.amount;
  setStatus('Repeated last round settings (side & amount).');
}

/** ===================== [MỤC 14] CHỌN CHẴN/LẺ & PHÍM TẮT ===================== **/
function bindSideButtons(){
  $('btn-even').addEventListener('click', () => {
    currentSide = 'even';
    $('btn-even').classList.add('active');
    $('btn-odd').classList.remove('active');
  });
  $('btn-odd').addEventListener('click', () => {
    currentSide = 'odd';
    $('btn-odd').classList.add('active');
    $('btn-even').classList.remove('active');
  });
}
function bindHotkeys(){
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key==='r'||e.key==='R') onRepeat();
    if (e.key==='c'||e.key==='C') onClear();
    if (e.key==='d'||e.key==='D') onDouble();
    if (e.key==='e'||e.key==='E') $('btn-even').click();
    if (e.key==='o'||e.key==='O') $('btn-odd').click();
  });
}

/** ===================== [MỤC 15] KHỞI TẠO ỨNG DỤNG ===================== **/
async function init(){
  try{
    // Kiểm tra có tải được ethers chưa (tránh lỗi do CDN)
    if (typeof ethers === 'undefined'){
      setStatus('ethers.js failed to load. Check your internet/CDN.');
      console.error('ethers.js not found. Ensure CDN script is loaded before app.js.');
      return;
    }

    providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
    await showLatestContractRound();

    lastRound = loadLastRound();

    // Gán sự kiện nút
    $('btn-connect')?.addEventListener('click', connectWallet);
    $('btn-disconnect')?.addEventListener('click', disconnectWallet);
    $('btn-set-table')?.addEventListener('click', onSetTable);
    $('btn-approve')?.addEventListener('click', onApprove);
    $('btn-play')?.addEventListener('click', onPlay);
    $('btn-clear')?.addEventListener('click', onClear);
    $('btn-half')?.addEventListener('click', onHalf);
    $('btn-double')?.addEventListener('click', onDouble);
    $('btn-repeat')?.addEventListener('click', onRepeat);

    bindSideButtons();
    bindHotkeys();

    const minSaved = loadLastTableMin();
    if (minSaved) $('minBet').value = minSaved;

    setStatus('Ready.');
  }catch(e){
    console.error('init error:', e);
    setStatus('Initialization failed. Open Console for details.');
  }
}

// Đảm bảo chỉ chạy sau khi DOM sẵn sàng
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
