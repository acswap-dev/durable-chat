import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { ethers } from "ethers";
import usdtAbi from "../abi/usdt.json";
import { CHAIN_CONFIG } from "../shared.config";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

// 多个BSC RPC节点
const BSC_RPC_URLS = CHAIN_CONFIG.BSC_RPC_URLS;
const fallbackProvider = new ethers.FallbackProvider(BSC_RPC_URLS.map(url => new ethers.JsonRpcProvider(url)));

export default function CreateRoom() {
  const [searchParams] = useSearchParams();
  const room = searchParams.get("room") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [usdtBalance, setUsdtBalance] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [contractName, setContractName] = useState<string>("");
  const [contractSymbol, setContractSymbol] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [confirmations, setConfirmations] = useState<number>(0);
  const [requiredConfirmations] = useState<number>(15);
  const [isWaitingConfirmation, setIsWaitingConfirmation] = useState<boolean>(false);
  const navigate = useNavigate();

  // 连接钱包逻辑
  const connectWallet = async () => {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setIsConnected(true);
        }
      } else {
        alert('请安装MetaMask钱包');
      }
    } catch (error) {
      setError('连接钱包失败');
    }
  };

  // 页面加载时自动检测当前账户，并监听钱包切换自动刷新状态（第一个钱包地址变化时就刷新）
  useEffect(() => {
    function updateAccount(accounts: string[]) {
    //   console.log('[autoDetectOrChanged]', accounts);
      const newAddress = accounts[0] || "";
      if (newAddress !== walletAddress) {
        setWalletAddress(newAddress);
        setIsConnected(!!newAddress);
      }
    }
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(updateAccount);
      window.ethereum.on('accountsChanged', updateAccount);
      return () => {
        window.ethereum && window.ethereum.removeListener('accountsChanged', updateAccount);
      };
    }
  }, [walletAddress]);

  // 只要walletAddress或isConnected变化就自动查余额，并打印log
  useEffect(() => {
    async function fetchBalance() {
      console.log('[fetchBalance] isConnected:', isConnected, 'walletAddress:', walletAddress);
      if (!isConnected || !walletAddress || !window.ethereum) {
        setUsdtBalance(0n);
        return;
      }
      setBalanceLoading(true);
      try {
        // 使用钱包的RPC提供者，确保数据实时更新
        const provider = new ethers.BrowserProvider(window.ethereum);
        const usdt = new ethers.Contract(CHAIN_CONFIG.USDT_ADDRESS, usdtAbi, provider);
        const balance: bigint = await usdt.balanceOf(walletAddress);
        console.log('[fetchBalance] USDT余额:', balance.toString());
        setUsdtBalance(balance);
      } catch (e) {
        console.log('[fetchBalance] 查询失败，尝试使用fallback provider', e);
        // 如果钱包RPC失败，回退到公共RPC
        try {
          const usdt = new ethers.Contract(CHAIN_CONFIG.USDT_ADDRESS, usdtAbi, fallbackProvider);
          const balance: bigint = await usdt.balanceOf(walletAddress);
          console.log('[fetchBalance] 使用fallback provider查询成功:', balance.toString());
          setUsdtBalance(balance);
        } catch (fallbackError) {
          console.log('[fetchBalance] 所有查询方式都失败', fallbackError);
          setUsdtBalance(0n);
        }
      } finally {
        setBalanceLoading(false);
      }
    }
    fetchBalance();
  }, [isConnected, walletAddress]);

  // 获取合约名称和符号
  useEffect(() => {
    async function fetchContractInfo() {
      if (/^0x[a-fA-F0-9]{40}$/.test(room)) {
        try {
          const contract = new ethers.Contract(room, ERC20_ABI, fallbackProvider);
          const name = await contract.name();
          const symbol = await contract.symbol();
          setContractName(name);
          setContractSymbol(symbol);
        } catch {
          setContractName("");
          setContractSymbol("");
        }
      } else {
        setContractName("");
        setContractSymbol("");
      }
    }
    fetchContractInfo();
  }, [room]);

  // 轮询确认数
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    async function checkConfirmations() {
      if (!txHash || !isWaitingConfirmation) return;
      
      try {
        if (!window.ethereum) return;
        const provider = new ethers.BrowserProvider(window.ethereum);
        const tx = await provider.getTransaction(txHash);
        if (tx && tx.blockNumber) {
          const currentBlock = await provider.getBlockNumber();
          const confirmationCount = currentBlock - tx.blockNumber + 1;
          setConfirmations(Math.max(0, confirmationCount));
          
          // 达到要求的确认数后，进行后端验证
          if (confirmationCount >= requiredConfirmations) {
            setIsWaitingConfirmation(false);
            await verifyPaymentWithBackend();
          }
        }
      } catch (error) {
        console.error('检查确认数失败:', error);
      }
    }

    if (isWaitingConfirmation && txHash) {
      // 立即检查一次
      checkConfirmations();
      // 每5秒检查一次
      interval = setInterval(checkConfirmations, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [txHash, isWaitingConfirmation, requiredConfirmations]);

  // 后端验证支付
  async function verifyPaymentWithBackend() {
    try {
      if (!window.ethereum) throw new Error("MetaMask未连接");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const res = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room,
          txHash,
          wallet: await signer.getAddress()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "支付校验失败");
      alert("房间创建成功！");
      navigate(`/${room}`);
    } catch (e: any) {
      setError(e.message || "后端验证失败");
      setLoading(false);
    }
  }

  async function handlePay() {
    setError("");
    setLoading(true);
    try {
      if (!window.ethereum) throw new Error("请安装MetaMask");
      if (!isConnected) throw new Error("请先连接钱包");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const usdt = new ethers.Contract(CHAIN_CONFIG.USDT_ADDRESS, usdtAbi, signer);
      const amount = ethers.parseUnits(CHAIN_CONFIG.CREATE_ROOM_AMOUNT, CHAIN_CONFIG.USDT_DECIMALS);
      // 检查余额（优先使用钱包RPC，确保最新余额）
      let balance: bigint;
      try {
        const usdtRead = new ethers.Contract(CHAIN_CONFIG.USDT_ADDRESS, usdtAbi, provider);
        balance = await usdtRead.balanceOf(walletAddress);
      } catch (e) {
        console.log('使用钱包RPC查询余额失败，回退到公共RPC', e);
        const usdtRead = new ethers.Contract(CHAIN_CONFIG.USDT_ADDRESS, usdtAbi, fallbackProvider);
        balance = await usdtRead.balanceOf(walletAddress);
      }
      if (balance < amount) throw new Error("USDT余额不足");
      const tx = await usdt.transfer(CHAIN_CONFIG.RECEIVER, amount);
      // 设置交易哈希并开始监控确认数
      setTxHash(tx.hash);
      setIsWaitingConfirmation(true);
      setConfirmations(0);
      // 等待交易上链
      await tx.wait();
    } catch (e: any) {
      setError(e.message || "发生错误");
      // 出错时重置确认状态
      setIsWaitingConfirmation(false);
      setTxHash("");
      setConfirmations(0);
    } finally {
      setLoading(false);
    }
  }

  const amount = ethers.parseUnits(CHAIN_CONFIG.CREATE_ROOM_AMOUNT, CHAIN_CONFIG.USDT_DECIMALS);
  const notEnough = isConnected && usdtBalance < amount;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <h2>创建房间：{room}</h2>
      {contractName && contractSymbol && (
        <div style={{ color: '#666', marginBottom: 8 }}>合约名称：{contractName}（{contractSymbol}）</div>
      )}
      <p>需支付 <b>{CHAIN_CONFIG.CREATE_ROOM_AMOUNT} USDT</b> 到指定地址后才能创建房间。</p>
      {!isConnected ? (
        <button onClick={connectWallet} style={{ padding: "0px 24px", fontSize: 18, marginBottom: 16 }}>
          连接钱包
        </button>
      ) : (
        <div style={{ marginBottom: 16, color: '#007bff' }}>已连接钱包：{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}<br/>
          {balanceLoading ? 'USDT余额查询中...' : `USDT余额：${Number(usdtBalance) / 1e18}`}
        </div>
      )}
      <button 
        onClick={handlePay} 
        disabled={loading || !isConnected || notEnough || isWaitingConfirmation} 
        style={{ padding: "0px 24px", fontSize: 18 }}>
        {isWaitingConfirmation ? "等待确认中..." : loading ? "支付中..." : notEnough ? "USDT余额不足" : "支付并创建房间"}
      </button>
      {isWaitingConfirmation && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{ color: '#007bff', marginBottom: 8 }}>
            交易已提交，等待确认中...
          </div>
          <div style={{ color: '#28a745', fontSize: 18, fontWeight: 'bold' }}>
            确认数：{confirmations}/{requiredConfirmations}
          </div>
          <div style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
            交易哈希：{txHash.slice(0, 10)}...{txHash.slice(-8)}
          </div>
          <div style={{ 
            marginTop: 8, 
            width: '200px', 
            height: '6px', 
            backgroundColor: '#e9ecef', 
            borderRadius: '3px',
            margin: '8px auto',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(100, (confirmations / requiredConfirmations) * 100)}%`,
              height: '100%',
              backgroundColor: confirmations >= requiredConfirmations ? '#28a745' : '#007bff',
              transition: 'width 0.3s ease'
            }}></div>
          </div>
        </div>
      )}
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
    </div>
  );
} 