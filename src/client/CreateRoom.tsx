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
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);
  const navigate = useNavigate();

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      navigate(`/room/${room}`);
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

  // 返回首页
  const goToHome = () => {
    navigate('/');
  };

  // 获取短地址显示
  const getShortAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // 获取短房间ID显示
  const getShortRoomId = (roomId: string) => {
    if (isMobile && roomId.length > 12) {
      return `${roomId.slice(0, 6)}...${roomId.slice(-6)}`;
    }
    return roomId;
  };

  const amount = ethers.parseUnits(CHAIN_CONFIG.CREATE_ROOM_AMOUNT, CHAIN_CONFIG.USDT_DECIMALS);
  const notEnough = isConnected && usdtBalance < amount;
  const usdtBalanceFormatted = Number(usdtBalance) / 1e18;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f7fa',
      backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(0, 123, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(40, 167, 69, 0.1) 0%, transparent 50%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: isMobile ? '20px 15px' : '40px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* 返回按钮 */}
      <button
        onClick={goToHome}
        style={{
          position: 'absolute',
          top: isMobile ? '20px' : '30px',
          left: isMobile ? '20px' : '30px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid #e1e5e9',
          borderRadius: '12px',
          padding: '12px 16px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: '500',
          color: '#333',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }}
      >
        ← 返回首页
      </button>

      <div style={{
        maxWidth: isMobile ? '100%' : '600px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
        padding: isMobile ? '30px 20px' : '40px',
        marginTop: isMobile ? '60px' : '0',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* 装饰性背景 */}
        <div style={{
          position: 'absolute',
          top: '-50%',
          right: '-20%',
          width: '200px',
          height: '200px',
          background: 'linear-gradient(135deg, rgba(0, 123, 255, 0.1) 0%, rgba(40, 167, 69, 0.1) 100%)',
          borderRadius: '50%',
          zIndex: 0
        }}></div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* 标题部分 */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '80px',
              height: '80px',
              background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 25px rgba(0, 123, 255, 0.3)'
            }}>
              <span style={{ fontSize: '32px', color: 'white' }}>🏠</span>
            </div>
            <h1 style={{
              fontSize: isMobile ? '24px' : '28px',
              fontWeight: '700',
              color: '#1a1a1a',
              margin: '0 0 12px 0'
            }}>
              创建专属房间
            </h1>
            <p style={{
              fontSize: '16px',
              color: '#666',
              margin: '0',
              lineHeight: '1.5'
            }}>
              支付少量费用，创建您的专属聊天空间
            </p>
          </div>

          {/* 房间信息卡片 */}
          <div style={{
            backgroundColor: '#f8f9fa',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
            border: '1px solid #e9ecef'
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
              margin: '0 0 12px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>🆔</span> 房间信息
            </h3>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid #dee2e6'
            }}>
              <div style={{
                fontSize: '12px',
                color: '#6c757d',
                fontWeight: '500',
                marginBottom: '4px'
              }}>
                房间ID
              </div>
              <div style={{
                fontSize: isMobile ? '14px' : '16px',
                fontWeight: '600',
                color: '#333',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                marginBottom: contractName ? '12px' : '0'
              }}>
                {getShortRoomId(room)}
              </div>
              
              {contractName && contractSymbol && (
                <div style={{
                  paddingTop: '12px',
                  borderTop: '1px solid #e9ecef'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: '#6c757d',
                    fontWeight: '500',
                    marginBottom: '4px'
                  }}>
                    检测到合约
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                      backgroundColor: '#e7f3ff',
                      color: '#0066cc',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {contractSymbol}
                    </span>
                    <span style={{ fontSize: '14px', color: '#333' }}>{contractName}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 费用信息 */}
          <div style={{
            backgroundColor: 'linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            border: '1px solid #f6e58d'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>💰</span>
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#856404',
                margin: '0'
              }}>
                创建费用
              </h3>
            </div>
            <div style={{
              fontSize: isMobile ? '20px' : '24px',
              fontWeight: '700',
              color: '#856404'
            }}>
              {CHAIN_CONFIG.CREATE_ROOM_AMOUNT} USDT
            </div>
            <p style={{
              fontSize: '14px',
              color: '#856404',
              margin: '8px 0 0 0',
              opacity: 0.8
            }}>
              一次性费用，永久拥有房间管理权
            </p>
          </div>

          {/* 钱包连接区域 */}
          {!isConnected ? (
            <div style={{
              textAlign: 'center',
              marginBottom: '24px'
            }}>
              <button 
                onClick={connectWallet}
                style={{
                  background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
                  color: 'white',
                  padding: isMobile ? '16px 32px' : '18px 40px',
                  border: 'none',
                  borderRadius: '50px',
                  cursor: 'pointer',
                  fontSize: isMobile ? '16px' : '18px',
                  fontWeight: '600',
                  boxShadow: '0 8px 25px rgba(0, 123, 255, 0.3)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  margin: '0 auto'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 12px 35px rgba(0, 123, 255, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 123, 255, 0.3)';
                }}
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px'
                }}>
                  🔗
                </div>
                连接MetaMask钱包
              </button>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#e7f3ff',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px',
              border: '1px solid #b3d9ff'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '12px'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '18px',
                  fontWeight: 'bold'
                }}>
                  ✓
                </div>
                <div>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#0066cc',
                    marginBottom: '2px'
                  }}>
                    钱包已连接
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#004d99',
                    fontFamily: 'monospace'
                  }}>
                    {getShortAddress(walletAddress)}
                  </div>
                </div>
              </div>
              
              <div style={{
                borderTop: '1px solid #b3d9ff',
                paddingTop: '12px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{
                    fontSize: '14px',
                    color: '#0066cc',
                    fontWeight: '500'
                  }}>
                    USDT 余额：
                  </span>
                  <span style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: notEnough ? '#dc3545' : '#28a745'
                  }}>
                    {balanceLoading ? (
                      <span style={{ color: '#6c757d' }}>查询中...</span>
                    ) : (
                      `${usdtBalanceFormatted.toFixed(2)} USDT`
                    )}
                  </span>
                </div>
                {notEnough && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#f8d7da',
                    color: '#721c24',
                    borderRadius: '8px',
                    fontSize: '14px',
                    border: '1px solid #f5c6cb'
                  }}>
                    ⚠️ 余额不足，请先充值USDT
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 支付按钮 */}
          <button 
            onClick={handlePay}
            disabled={loading || !isConnected || notEnough || isWaitingConfirmation}
            style={{
              width: '100%',
              background: (loading || !isConnected || notEnough || isWaitingConfirmation) 
                ? 'linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%)'
                : 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
              color: (loading || !isConnected || notEnough || isWaitingConfirmation) ? '#6c757d' : 'white',
              padding: isMobile ? '18px 24px' : '20px 32px',
              border: 'none',
              borderRadius: '16px',
              cursor: (loading || !isConnected || notEnough || isWaitingConfirmation) ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600',
              transition: 'all 0.3s ease',
              boxShadow: (loading || !isConnected || notEnough || isWaitingConfirmation) 
                ? '0 4px 15px rgba(0,0,0,0.1)'
                : '0 8px 25px rgba(40, 167, 69, 0.3)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px'
            }}
            onMouseOver={(e) => {
              if (!loading && isConnected && !notEnough && !isWaitingConfirmation) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 35px rgba(40, 167, 69, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading && isConnected && !notEnough && !isWaitingConfirmation) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(40, 167, 69, 0.3)';
              }
            }}
          >
            {loading && (
              <div style={{
                width: '20px',
                height: '20px',
                border: '2px solid transparent',
                borderTop: '2px solid currentColor',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
            )}
            {isWaitingConfirmation ? "等待区块确认..." : 
             loading ? "支付处理中..." : 
             notEnough ? "USDT余额不足" : 
             !isConnected ? "请先连接钱包" : 
             "💳 支付并创建房间"}
          </button>

          {/* 交易确认状态 */}
          {isWaitingConfirmation && (
            <div style={{
              backgroundColor: '#e7f3ff',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '20px',
              border: '1px solid #b3d9ff',
              textAlign: 'center'
            }}>
              <div style={{
                width: '60px',
                height: '60px',
                background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <span style={{ fontSize: '24px', color: 'white' }}>⏳</span>
                <div style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.3))',
                  borderRadius: '50%',
                  animation: 'spin 2s linear infinite'
                }}></div>
              </div>
              
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#0066cc',
                margin: '0 0 8px 0'
              }}>
                交易确认中
              </h3>
              
              <p style={{
                fontSize: '14px',
                color: '#004d99',
                margin: '0 0 16px 0'
              }}>
                请等待区块链网络确认您的交易
              </p>

              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <span style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#007bff'
                }}>
                  {confirmations}
                </span>
                <span style={{ color: '#6c757d' }}>/</span>
                <span style={{
                  fontSize: '18px',
                  color: '#6c757d'
                }}>
                  {requiredConfirmations}
                </span>
                <span style={{
                  fontSize: '14px',
                  color: '#6c757d',
                  marginLeft: '4px'
                }}>
                  确认
                </span>
              </div>

              {/* 进度条 */}
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#e9ecef',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '12px'
              }}>
                <div style={{
                  width: `${Math.min(100, (confirmations / requiredConfirmations) * 100)}%`,
                  height: '100%',
                  background: confirmations >= requiredConfirmations 
                    ? 'linear-gradient(90deg, #28a745, #20c997)' 
                    : 'linear-gradient(90deg, #007bff, #0056b3)',
                  transition: 'width 0.5s ease',
                  borderRadius: '4px'
                }}></div>
              </div>

              <div style={{
                fontSize: '12px',
                color: '#6c757d',
                fontFamily: 'monospace'
              }}>
                交易哈希: {txHash.slice(0, 8)}...{txHash.slice(-8)}
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {error && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '16px 20px',
              borderRadius: '12px',
              border: '1px solid #f5c6cb',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '2px' }}>错误</div>
                <div style={{ fontSize: '14px' }}>{error}</div>
              </div>
            </div>
          )}

          {/* 说明信息 */}
          <div style={{
            backgroundColor: '#f8f9fa',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #e9ecef'
          }}>
            <h4 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#495057',
              margin: '0 0 8px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>ℹ️</span> 温馨提示
            </h4>
            <ul style={{
              fontSize: '13px',
              color: '#6c757d',
              margin: '0',
              paddingLeft: '16px',
              lineHeight: '1.5'
            }}>
              <li>支付成功后将自动创建专属聊天房间</li>
              <li>您将成为房间管理员，拥有完全控制权</li>
              <li>交易需要15个区块确认，大约需要45秒</li>
              <li>请确保钱包网络已切换到BSC主网</li>
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
} 