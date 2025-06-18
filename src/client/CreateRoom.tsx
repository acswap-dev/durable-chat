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

  // 页面加载时自动检测当前账户，并监听钱包切换自动刷新状态
  useEffect(() => {
    function updateAccount(accounts: string[]) {
      console.log('[autoDetectOrChanged]', accounts);
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setIsConnected(true);
      } else {
        setWalletAddress("");
        setIsConnected(false);
      }
    }
    if (window.ethereum) {
      // 页面加载时自动检测
      window.ethereum.request({ method: 'eth_accounts' }).then(updateAccount);
      // 监听切换
      window.ethereum.on('accountsChanged', updateAccount);
      return () => {
        window.ethereum && window.ethereum.removeListener('accountsChanged', updateAccount);
      };
    }
  }, []);

  // 只要walletAddress或isConnected变化就自动查余额，并打印log
  useEffect(() => {
    async function fetchBalance() {
      console.log('[fetchBalance] isConnected:', isConnected, 'walletAddress:', walletAddress);
      if (!isConnected || !walletAddress) {
        setUsdtBalance(0n);
        return;
      }
      setBalanceLoading(true);
      try {
        const usdt = new ethers.Contract(CHAIN_CONFIG.USDT_ADDRESS, usdtAbi, fallbackProvider);
        const balance: bigint = await usdt.balanceOf(walletAddress);
        console.log('[fetchBalance] USDT余额:', balance.toString());
        setUsdtBalance(balance);
      } catch (e) {
        console.log('[fetchBalance] 查询失败', e);
        setUsdtBalance(0n);
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
      // 检查余额（用 fallbackProvider）
      const usdtRead = new ethers.Contract(CHAIN_CONFIG.USDT_ADDRESS, usdtAbi, fallbackProvider);
      const balance: bigint = await usdtRead.balanceOf(walletAddress);
      if (balance < amount) throw new Error("USDT余额不足");
      const tx = await usdt.transfer(CHAIN_CONFIG.RECEIVER, amount);
      await tx.wait();
      // 通知后端校验
      const res = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room,
          txHash: tx.hash,
          wallet: await signer.getAddress()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "支付校验失败");
      alert("房间创建成功！");
      navigate(`/${room}`);
    } catch (e: any) {
      setError(e.message || "发生错误");
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
        disabled={loading || !isConnected || notEnough} 
        style={{ padding: "0px 24px", fontSize: 18 }}>
        {loading ? "支付中..." : notEnough ? "USDT余额不足" : "支付并创建房间"}
      </button>
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
    </div>
  );
} 