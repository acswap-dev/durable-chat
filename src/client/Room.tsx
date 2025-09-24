import { usePartySocket } from "partysocket/react";
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { nanoid } from "nanoid";
import { ethers } from "ethers";

import { type ChatMessage, type Message, type RoomStats } from "../shared";

// 扩展Window接口以包含ethereum属性
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}

function Room() {
  const [name, setName] = useState<string>("");
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [roomStats, setRoomStats] = useState<RoomStats | null>(null);
  const [contractName, setContractName] = useState<string>("");
  const [contractSymbol, setContractSymbol] = useState<string>("");
  const { room } = useParams();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const heartbeatIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);

  // 将完整地址转换为短地址用于显示
  const getShortAddress = (address: string) => {
    if (address.includes('...')) {
      return address; // 已经是短地址格式
    }
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // 检查是否是当前用户的消息
  const isCurrentUser = (messageUser: string) => {
    return messageUser === walletAddress;
  };

  // 获取用户头像颜色
  const getUserAvatarColor = (address: string) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化时长
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 获取合约信息
  const fetchContractInfo = async (contractAddress: string) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
      return;
    }
    
    try {
      const ERC20_ABI = [
        "function name() view returns (string)",
        "function symbol() view returns (string)"
      ];
      
      // 使用BSC RPC
      const provider = new ethers.JsonRpcProvider("https://binance.llamarpc.com");
      const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
      
      const [name, symbol] = await Promise.all([
        contract.name(),
        contract.symbol()
      ]);
      
      setContractName(name);
      setContractSymbol(symbol);
      console.log('合约信息获取成功:', { name, symbol });
    } catch (error) {
      console.log('获取合约信息失败:', error);
      setContractName("");
      setContractSymbol("");
    }
  };

  // 文件上传处理
  const handleFileUpload = async (file: File) => {
    if (!isConnected || !walletAddress) {
      alert('请先连接钱包');
      return;
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('room', room || '');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (!result.success) {
        alert(result.error || '文件上传失败');
        return;
      }

      // 创建多媒体消息
      const chatMessage: ChatMessage = {
        id: nanoid(8),
        content: result.messageType === 'image' ? '[图片]' : 
                result.messageType === 'audio' ? '[音频]' : 
                result.messageType === 'video' ? '[视频]' : 
                `[文件] ${result.fileName}`,
        user: walletAddress,
        role: "user",
        messageType: result.messageType,
        fileUrl: result.fileUrl,
        fileName: result.fileName,
        fileSize: result.fileSize,
        fileMimeType: result.fileMimeType
      };

      setMessages((messages) => [...messages, chatMessage]);

      socket.send(
        JSON.stringify({
          type: "add",
          ...chatMessage,
        } satisfies Message),
      );

    } catch (error) {
      console.error('文件上传错误:', error);
      alert('文件上传失败');
    } finally {
      setUploadingFile(false);
    }
  };

  // 文件选择处理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
    // 清空input，允许重复选择同一文件
    event.target.value = '';
  };

  // 渲染多媒体消息内容
  const renderMessageContent = (message: ChatMessage) => {
    if (!message.messageType || message.messageType === 'text') {
      return <span>{message.content}</span>;
    }

    const commonStyle = {
      maxWidth: '100%',
      borderRadius: '12px',
      marginTop: '8px'
    };

    switch (message.messageType) {
      case 'image':
        return (
          <div>
            <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.8 }}>
              📷 {message.fileName}
            </div>
            <img 
              src={message.fileUrl} 
              alt={message.fileName}
              style={{
                ...commonStyle,
                maxHeight: '300px',
                cursor: 'pointer'
              }}
              onClick={() => window.open(message.fileUrl, '_blank')}
            />
          </div>
        );

      case 'audio':
        return (
          <div>
            <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.8 }}>
              🎵 {message.fileName}
              {message.fileSize && <span> • {formatFileSize(message.fileSize)}</span>}
            </div>
            <audio 
              controls 
              style={{ ...commonStyle, width: '100%', height: '40px' }}
              preload="metadata"
            >
              <source src={message.fileUrl} type={message.fileMimeType} />
              您的浏览器不支持音频播放
            </audio>
          </div>
        );

      case 'video':
        return (
          <div>
            <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.8 }}>
              🎬 {message.fileName}
              {message.fileSize && <span> • {formatFileSize(message.fileSize)}</span>}
            </div>
            <video 
              controls 
              style={{
                ...commonStyle,
                maxHeight: '300px',
                width: '100%'
              }}
              preload="metadata"
            >
              <source src={message.fileUrl} type={message.fileMimeType} />
              您的浏览器不支持视频播放
            </video>
          </div>
        );

      case 'file':
        return (
          <div>
            <a 
              href={message.fileUrl} 
              download={message.fileName}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '12px',
                textDecoration: 'none',
                color: 'inherit',
                marginTop: '8px',
                transition: 'background 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              }}
            >
              <div style={{ 
                fontSize: '24px',
                width: '40px',
                textAlign: 'center'
              }}>
                📄
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>
                  {message.fileName}
                </div>
                {message.fileSize && (
                  <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>
                    {formatFileSize(message.fileSize)}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '16px', opacity: 0.7 }}>
                ⬇️
              </div>
            </a>
          </div>
        );

      default:
        return <span>{message.content}</span>;
    }
  };

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 获取合约信息
  useEffect(() => {
    if (room) {
      fetchContractInfo(room);
    }
  }, [room]);

  // 自动检测和监听钱包账户变化（第一个地址变化时就刷新）
  useEffect(() => {
    function updateAccount(accounts: string[]) {
      const newAddress = accounts[0] || "";
      if (newAddress !== walletAddress) {
        setWalletAddress(newAddress);
        const shortAddress = getShortAddress(newAddress);
        setName(shortAddress);
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

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 当消息更新时自动滚动
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 连接钱包函数
  const connectWallet = async () => {
    try {
      // 检查是否安装了MetaMask
      if (typeof window.ethereum !== 'undefined') {
        // 请求连接钱包
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        if (accounts.length > 0) {
          const address = accounts[0];
          setWalletAddress(address);
          // 将钱包地址设置为用户名，显示前4位和后4位
          const shortAddress = getShortAddress(address);
          setName(shortAddress);
          setIsConnected(true);
        }
      } else {
        alert('请安装MetaMask钱包');
      }
    } catch (error) {
      console.error('连接钱包失败:', error);
      alert('连接钱包失败');
    }
  };

  const socket = usePartySocket({
    party: "chat",
    room,
    onMessage: (evt) => {
      const message = JSON.parse(evt.data as string) as Message;
      if (message.type === "add") {
        const foundIndex = messages.findIndex((m) => m.id === message.id);
        if (foundIndex === -1) {
          // probably someone else who added a message
          setMessages((messages) => [
            ...messages,
            {
              id: message.id,
              content: message.content,
              user: message.user,
              role: message.role,
            },
          ]);
        } else {
          // this usually means we ourselves added a message
          // and it was broadcasted back
          // so let's replace the message with the new message
          setMessages((messages) => {
            return messages
              .slice(0, foundIndex)
              .concat({
                id: message.id,
                content: message.content,
                user: message.user,
                role: message.role,
              })
              .concat(messages.slice(foundIndex + 1));
          });
        }
      } else if (message.type === "update") {
        setMessages((messages) =>
          messages.map((m) =>
            m.id === message.id
              ? {
                  id: message.id,
                  content: message.content,
                  user: message.user,
                  role: message.role,
                }
              : m,
          ),
        );
      } else if (message.type === "all") {
        setMessages(message.messages);
      } else if (message.type === "delete") {
        setMessages((messages) => messages.filter((m) => m.id !== message.id));
      } else if (message.type === "clear") {
        setMessages([]);
      } else if (message.type === "roomStats") {
        setRoomStats(message.stats);
      } else if (message.type === "userJoin") {
        console.log("用户加入:", message.user);
      } else if (message.type === "userLeave") {
        console.log("用户离开:", message.user);
      }
    },
  });

  // 捕获WebSocket连接失败，自动尝试创建免费房间
  useEffect(() => {
    if (socket) {
      socket.addEventListener("error", async (e) => {
        console.log('WebSocket连接错误:', e);
        // 尝试创建免费房间
        await tryCreateFreeRoom();
      });
      socket.addEventListener("close", async (e) => {
        console.log('WebSocket连接关闭:', e);
        // 可根据e.reason判断是否未注册
        if (e.reason && e.reason.includes("未注册")) {
          await tryCreateFreeRoom();
        }
      });
    }
  }, [socket, room, navigate]);

  // 尝试创建免费房间
  const tryCreateFreeRoom = async () => {
    if (!room) return;
    
    try {
      console.log('尝试创建免费房间:', room);
      const response = await fetch('/api/create-free-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room })
      });
      
      const result = await response.json();
      if (result.success) {
        console.log('免费房间创建成功，重新连接...');
        // 重新加载页面以重新建立WebSocket连接
        window.location.reload();
      } else {
        console.log('免费房间创建失败:', result.error);
        // 如果免费房间创建失败，跳转到付费创建页面
        navigate(`/create-room?room=${room}`);
      }
    } catch (error) {
      console.error('创建免费房间时出错:', error);
      // 出错时跳转到付费创建页面
      navigate(`/create-room?room=${room}`);
    }
  };

  // 发送心跳保持在线状态
  useEffect(() => {
    if (isConnected && walletAddress && socket) {
      // 发送加入房间消息
      socket.send(JSON.stringify({
        type: "userJoin",
        user: walletAddress
      } satisfies Message));

      // 启动心跳定时器
      heartbeatIntervalRef.current = setInterval(() => {
        if (socket && walletAddress) {
          socket.send(JSON.stringify({
            type: "heartbeat",
            user: walletAddress
          } satisfies Message));
        }
      }, 30000); // 每30秒发送心跳

      return () => {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
      };
    }
  }, [isConnected, walletAddress, socket]);

  // 返回首页
  const goToHome = () => {
    navigate('/');
  };

  // 格式化时间
  const formatTime = (timestamp?: string) => {
    if (timestamp) {
      return new Date(timestamp).toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    return new Date().toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: isMobile ? '0' : '20px',
      display: 'flex',
      alignItems: isMobile ? 'stretch' : 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        top: '0%',
        left: '0%',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
        animation: 'float 20s ease-in-out infinite',
        zIndex: 0
      }}></div>

      <div style={{
        width: '100%',
        maxWidth: isMobile ? '100%' : '1200px',
        height: isMobile ? '100vh' : '85vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: isMobile ? '0' : '24px',
        boxShadow: isMobile ? 'none' : '0 25px 80px rgba(0,0,0,0.15), 0 10px 30px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1
      }}>
        {/* 聊天窗口头部 */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)',
          backdropFilter: 'blur(15px)',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          padding: isMobile ? '16px 15px' : '20px 24px',
          boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
          zIndex: 10,
          borderTopLeftRadius: isMobile ? '0' : '24px',
          borderTopRightRadius: isMobile ? '0' : '24px',
          position: 'relative'
        }}>
          {/* 顶部装饰线 */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, #667eea, #764ba2, #667eea)',
            backgroundSize: '200% 100%',
            animation: 'gradient 3s ease infinite'
          }}></div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={goToHome}
                style={{
                  background: 'rgba(103, 126, 234, 0.1)',
                  border: '1px solid rgba(103, 126, 234, 0.2)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#667eea',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(103, 126, 234, 0.15)';
                  e.currentTarget.style.transform = 'translateX(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(103, 126, 234, 0.1)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
                title="返回首页"
              >
               &lt;
              </button>
              <div>
                <h2 style={{ 
                  margin: '0', 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontSize: isMobile ? '20px' : '24px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ 
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}>💬</span>
                  {contractSymbol ? `${contractSymbol} 聊天室` : contractName ? `${contractName} 聊天室` : 'Web3 聊天室'}
                </h2>
                <div style={{ 
                  fontSize: '13px', 
                  color: '#8b95a7',
                  marginTop: '2px',
                  fontWeight: '500'
                }}>
                  房间: {isMobile && typeof room === 'string' && room.length > 12
                    ? `${room.slice(0, 6)}...${room.slice(-6)}`
                    : room}
                </div>
                {roomStats && (
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#667eea',
                    marginTop: '4px',
                    fontWeight: '500',
                    display: 'flex',
                    gap: isMobile ? '8px' : '12px',
                    flexWrap: 'wrap'
                  }}>
                    <span>🟢 在线 {roomStats.onlineUsers}</span>
                    <span>👥 访客 {roomStats.totalVisitors}</span>
                    <span>💬 消息 {roomStats.totalMessages}</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* 钱包连接区域 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {!isConnected ? (
                <button 
                  onClick={connectWallet}
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    padding: isMobile ? '10px 18px' : '12px 24px',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: isMobile ? '13px' : '14px',
                    fontWeight: '600',
                    boxShadow: '0 8px 25px rgba(102, 126, 234, 0.3)',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 35px rgba(102, 126, 234, 0.4)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.3)';
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px'
                  }}>
                    🔗
                  </div>
                  连接钱包
                </button>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: 'rgba(40, 167, 69, 0.1)',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: '1px solid rgba(40, 167, 69, 0.2)',
                  backdropFilter: 'blur(10px)'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)'
                  }}>
                    ✓
                  </div>
                  {!isMobile && (
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ 
                        fontSize: '13px', 
                        color: '#28a745',
                        fontWeight: '600',
                        lineHeight: '1.2'
                      }}>
                        {name}
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#6c757d',
                        fontWeight: '500'
                      }}>
                        已连接
                      </div>
                    </div>
                  )}
                
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 消息区域 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: isMobile ? '20px 15px' : '24px',
          background: 'linear-gradient(180deg, rgba(247,250,252,0.8) 0%, rgba(255,255,255,0.9) 100%)',
          position: 'relative',
          minHeight: '400px'
        }}>
          {/* 聊天背景装饰 */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.05) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(118, 75, 162, 0.05) 0%, transparent 50%)',
            pointerEvents: 'none'
          }}></div>

          <div style={{
            maxWidth: '100%',
            margin: '0 auto',
            position: 'relative',
            zIndex: 1
          }}>
            {messages.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: isMobile ? '80px 20px' : '120px 40px',
                color: '#8b95a7',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <div style={{
                  width: isMobile ? '100px' : '140px',
                  height: isMobile ? '100px' : '140px',
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 30px',
                  fontSize: isMobile ? '40px' : '60px',
                  animation: 'pulse 2s ease-in-out infinite',
                  border: '3px solid rgba(102, 126, 234, 0.1)',
                  position: 'relative'
                }}>
                  💬
                  {/* 装饰性圆环 */}
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '-10px',
                    right: '-10px',
                    bottom: '-10px',
                    border: '2px solid rgba(102, 126, 234, 0.1)',
                    borderRadius: '50%',
                    animation: 'pulse 2s ease-in-out infinite 0.5s'
                  }}></div>
                </div>
                <h3 style={{ 
                  margin: '0 0 16px 0', 
                  color: '#667eea', 
                  fontSize: isMobile ? '22px' : '28px',
                  fontWeight: '700',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  {isConnected ? '开始您的Web3对话！' : '欢迎来到Web3聊天室'}
                </h3>
                <p style={{ 
                  margin: '0 auto 24px', 
                  fontSize: isMobile ? '15px' : '17px',
                  lineHeight: '1.6',
                  maxWidth: '400px',
                  color: '#8b95a7'
                }}>
                  {isConnected ? '发送第一条消息，开启去中心化聊天体验，与志同道合的朋友交流' : '连接您的加密钱包，加入Web3聊天社区，体验真正的去中心化交流'}
                </p>
                {!isConnected && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
                    padding: '16px 24px',
                    borderRadius: '16px',
                    border: '1px solid rgba(102, 126, 234, 0.2)',
                    fontSize: '14px',
                    color: '#667eea',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '18px' }}>🔗</span>
                    点击右上角"连接钱包"开始聊天
                  </div>
                )}
                {isConnected && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(40, 167, 69, 0.1) 0%, rgba(32, 201, 151, 0.1) 100%)',
                    padding: '16px 24px',
                    borderRadius: '16px',
                    border: '1px solid rgba(40, 167, 69, 0.2)',
                    fontSize: '14px',
                    color: '#28a745',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '18px' }}>✨</span>
                    您的钱包已连接，可以开始聊天了！
                  </div>
                )}
                
                {/* 房间统计信息 */}
                {roomStats && (
                  <div style={{
                    marginTop: '24px',
                    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
                    padding: '20px',
                    borderRadius: '16px',
                    border: '1px solid rgba(102, 126, 234, 0.1)',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                    gap: '16px',
                    textAlign: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: '#28a745' }}>
                        {roomStats.onlineUsers}
                      </div>
                      <div style={{ fontSize: '12px', color: '#8b95a7', marginTop: '4px' }}>
                        🟢 当前在线
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: '#667eea' }}>
                        {roomStats.totalVisitors}
                      </div>
                      <div style={{ fontSize: '12px', color: '#8b95a7', marginTop: '4px' }}>
                        👥 总访客数
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: '#764ba2' }}>
                        {roomStats.totalMessages}
                      </div>
                      <div style={{ fontSize: '12px', color: '#8b95a7', marginTop: '4px' }}>
                        💬 总消息数
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: '#f39c12' }}>
                        {roomStats.uniqueUsers}
                      </div>
                      <div style={{ fontSize: '12px', color: '#8b95a7', marginTop: '4px' }}>
                        👤 参与用户
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              messages.map((message, index) => {
                const isOwn = isCurrentUser(message.user);
                const avatarColor = getUserAvatarColor(message.user);
                
                return (
                  <div key={message.id} style={{
                    marginBottom: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: `slideUp 0.4s ease-out ${index * 0.1}s both`
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '12px',
                      justifyContent: isOwn ? 'flex-end' : 'flex-start'
                    }}>
                      {!isOwn && (
                        <div style={{
                          width: isMobile ? '40px' : '46px',
                          height: isMobile ? '40px' : '46px',
                          borderRadius: '50%',
                          backgroundColor: avatarColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: isMobile ? '13px' : '15px',
                          fontWeight: 'bold',
                          flexShrink: 0,
                          boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                          border: '3px solid rgba(255,255,255,0.9)',
                          position: 'relative'
                        }}>
                          {getShortAddress(message.user).slice(0, 2).toUpperCase()}
                          {/* 在线状态指示器 */}
                          <div style={{
                            position: 'absolute',
                            bottom: '-3px',
                            right: '-3px',
                            width: '14px',
                            height: '14px',
                            backgroundColor: '#28a745',
                            borderRadius: '50%',
                            border: '3px solid white',
                            animation: 'pulse 2s infinite'
                          }}></div>
                        </div>
                      )}
                      
                      <div style={{
                        maxWidth: isMobile ? '80%' : '65%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isOwn ? 'flex-end' : 'flex-start'
                      }}>
                        {/* 用户名和时间 */}
                        <div style={{
                          fontSize: '12px',
                          color: '#8b95a7',
                          marginBottom: '6px',
                          fontWeight: '500',
                          paddingLeft: isOwn ? '0' : '6px',
                          paddingRight: isOwn ? '6px' : '0'
                        }}>
                          {getShortAddress(message.user)} • {formatTime(message.timestamp)}
                        </div>
                        
                        {/* 消息气泡 */}
                        <div style={{
                          background: isOwn 
                            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                            : 'rgba(255, 255, 255, 0.95)',
                          color: isOwn ? 'white' : '#2c3e50',
                          padding: isMobile ? '14px 18px' : '16px 20px',
                          borderRadius: '22px',
                          wordWrap: 'break-word',
                          boxShadow: isOwn 
                            ? '0 10px 30px rgba(102, 126, 234, 0.3)'
                            : '0 6px 25px rgba(0,0,0,0.1)',
                          borderBottomRightRadius: isOwn ? '0px' : '22px',
                          borderBottomLeftRadius: isOwn ? '22px' : '0px',
                          position: 'relative',
                          backdropFilter: 'blur(15px)',
                          border: isOwn ? 'none' : '1px solid rgba(0,0,0,0.08)',
                          fontSize: isMobile ? '15px' : '16px',
                          lineHeight: '1.5',
                          fontWeight: '500',
                          maxWidth: '100%',
                          transition: 'transform 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        >
                          {renderMessageContent(message)}
                          
                          {/* 消息尾巴 */}
                          <div style={{
                            position: 'absolute',
                            bottom: '0',
                            [isOwn ? 'right' : 'left']: '-8px',
                            width: '0',
                            height: '0',
                            borderLeft: isOwn ? 'none' : '8px solid transparent',
                            borderRight: isOwn ? '8px solid transparent' : 'none',
                            borderBottom: isOwn 
                              ? '8px solid #764ba2'
                              : '8px solid rgba(255, 255, 255, 0.95)'
                          }}></div>
                        </div>
                      </div>
                      
                      {isOwn && (
                        <div style={{
                          width: isMobile ? '40px' : '46px',
                          height: isMobile ? '40px' : '46px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: isMobile ? '10px' : '12px',
                          fontWeight: 'bold',
                          flexShrink: 0,
                          boxShadow: '0 6px 20px rgba(102, 126, 234, 0.3)',
                          border: '3px solid rgba(255,255,255,0.9)',
                          position: 'relative'
                        }}>
                          {getShortAddress(message.user).slice(-4).toUpperCase()}
                          <div style={{
                            position: 'absolute',
                            bottom: '-3px',
                            right: '-3px',
                            width: '14px',
                            height: '14px',
                            backgroundColor: '#28a745',
                            borderRadius: '50%',
                            border: '3px solid white'
                          }}></div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 输入区域 */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.95) 100%)',
          backdropFilter: 'blur(25px)',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          padding: isMobile ? '20px 15px' : '24px',
          boxShadow: '0 -15px 40px rgba(0,0,0,0.1)',
          borderBottomLeftRadius: isMobile ? '0' : '24px',
          borderBottomRightRadius: isMobile ? '0' : '24px'
        }}>
          <div style={{
            maxWidth: '100%',
            margin: '0 auto'
          }}>
            {isTyping && (
              <div style={{
                marginBottom: '16px',
                color: '#8b95a7',
                fontSize: '13px',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingLeft: '4px'
              }}>
                <div style={{
                  display: 'flex',
                  gap: '3px'
                }}>
                  <div style={{
                    width: '5px',
                    height: '5px',
                    backgroundColor: '#667eea',
                    borderRadius: '50%',
                    animation: 'typing 1.4s ease-in-out infinite'
                  }}></div>
                  <div style={{
                    width: '5px',
                    height: '5px',
                    backgroundColor: '#667eea',
                    borderRadius: '50%',
                    animation: 'typing 1.4s ease-in-out infinite 0.2s'
                  }}></div>
                  <div style={{
                    width: '5px',
                    height: '5px',
                    backgroundColor: '#667eea',
                    borderRadius: '50%',
                    animation: 'typing 1.4s ease-in-out infinite 0.4s'
                  }}></div>
                </div>
                正在输入消息...
              </div>
            )}
            
            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept="image/*,audio/*,video/*"
              onChange={handleFileSelect}
            />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!isConnected) {
                  alert('请先连接钱包');
                  return;
                }
                
                const content = e.currentTarget.elements.namedItem(
                  "content",
                ) as HTMLInputElement;
                
                if (!content.value.trim()) return;
                
                const chatMessage: ChatMessage = {
                  id: nanoid(8),
                  content: content.value,
                  user: walletAddress,
                  role: "user",
                  messageType: "text"
                };
                setMessages((messages) => [...messages, chatMessage]);

                socket.send(
                  JSON.stringify({
                    type: "add",
                    ...chatMessage,
                  } satisfies Message),
                );

                content.value = "";
                setIsTyping(false);
              }}
              style={{
                display: 'flex',
                gap: isMobile ? '8px' : '12px',
                alignItems: 'flex-end',
                background: 'rgba(255,255,255,0.7)',
                padding: '8px',
                borderRadius: '28px',
                border: '2px solid rgba(102, 126, 234, 0.1)',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
              }}
              onFocus={(e) => {
                if (isConnected) {
                  e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.3)';
                  e.currentTarget.style.boxShadow = '0 4px 25px rgba(102, 126, 234, 0.15)';
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.05)';
              }}
            >
              {/* 文件上传按钮 */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || uploadingFile}
                style={{
                  background: isConnected && !uploadingFile
                    ? 'rgba(102, 126, 234, 0.1)'
                    : 'rgba(139, 149, 167, 0.1)',
                  color: isConnected && !uploadingFile ? '#667eea' : '#8b95a7',
                  padding: isMobile ? '14px' : '16px',
                  border: '1px solid rgba(102, 126, 234, 0.2)',
                  borderRadius: '20px',
                  cursor: isConnected && !uploadingFile ? 'pointer' : 'not-allowed',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease',
                  minWidth: isMobile ? '48px' : '52px',
                  height: isMobile ? '48px' : '52px'
                }}
                onMouseOver={(e) => {
                  if (isConnected && !uploadingFile) {
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.15)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseOut={(e) => {
                  if (isConnected && !uploadingFile) {
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
                title={uploadingFile ? "正在上传..." : "发送图片、音频或视频"}
              >
                {uploadingFile ? (
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid #667eea',
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                ) : (
                  '📎'
                )}
              </button>

              <div style={{ 
                flex: 1,
                position: 'relative'
              }}>
                <input
                  type="text"
                  name="content"
                  placeholder={isConnected ? `💬 输入您的消息...` : "请先连接钱包开始聊天..."}
                  autoComplete="off"
                  disabled={!isConnected}
                  onChange={(e) => {
                    setIsTyping(e.target.value.length > 0);
                  }}
                  style={{
                    width: '100%',
                    padding: isMobile ? '14px 22px' : '16px 26px',
                    border: 'none',
                    borderRadius: '22px',
                    fontSize: isMobile ? '15px' : '16px',
                    outline: 'none',
                    backgroundColor: isConnected ? 'transparent' : 'rgba(248,249,250,0.5)',
                    color: isConnected ? '#2c3e50' : '#8b95a7',
                    fontWeight: '500',
                    transition: 'all 0.3s ease'
                  }}
                />
                {!isConnected && (
                  <div style={{
                    position: 'absolute',
                    right: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '18px',
                    opacity: 0.5
                  }}>
                    🔒
                  </div>
                )}
              </div>
              <button 
                type="submit" 
                disabled={!isConnected}
                style={{
                  background: isConnected 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'rgba(139, 149, 167, 0.3)',
                  color: isConnected ? 'white' : '#8b95a7',
                  padding: isMobile ? '14px 22px' : '16px 26px',
                  border: 'none',
                  borderRadius: '22px',
                  cursor: isConnected ? 'pointer' : 'not-allowed',
                  fontSize: isMobile ? '15px' : '16px',
                  fontWeight: '600',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: isConnected 
                    ? '0 4px 20px rgba(102, 126, 234, 0.3)'
                    : 'none',
                  minWidth: 'auto'
                }}
                onMouseOver={(e) => {
                  if (isConnected) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.4)';
                  }
                }}
                onMouseOut={(e) => {
                  if (isConnected) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.3)';
                  }
                }}
              >
                发送 
                <span style={{ 
                  fontSize: '16px',
                  transform: 'rotate(45deg)',
                  display: 'inline-block'
                }}>
                  ✈️
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-12px) rotate(1deg); }
          66% { transform: translateY(6px) rotate(-1deg); }
        }
        
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        @keyframes pulse {
          0%, 100% { 
            transform: scale(1); 
            opacity: 1; 
            box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.3);
          }
          50% { 
            transform: scale(1.05); 
            opacity: 0.9;
            box-shadow: 0 0 0 10px rgba(102, 126, 234, 0);
          }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-8px);
            opacity: 1;
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes shimmer {
          0% {
            background-position: -200px 0;
          }
          100% {
            background-position: 200px 0;
          }
        }
        
        /* 滚动条样式 */
        ::-webkit-scrollbar {
          width: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.05);
          border-radius: 4px;
          margin: 4px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.2);
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #5a6fd8, #6b4190);
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }
        
        /* 输入框焦点效果 */
        .input-focus {
          animation: fadeIn 0.3s ease-out;
        }
        
        /* 消息气泡悬停效果 */
        .message-bubble:hover {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 8px 30px rgba(0,0,0,0.15) !important;
        }
        
        /* 连接状态指示器动画 */
        .online-indicator {
          animation: pulse 2s infinite;
        }
        
        /* 背景装饰动画 */
        .floating-decoration {
          animation: float 20s ease-in-out infinite;
        }
        
        /* 旋转动画 */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* 按钮波纹效果 */
        .button-ripple {
          position: relative;
          overflow: hidden;
        }
        
        .button-ripple::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }
        
        .button-ripple:active::after {
          width: 300px;
          height: 300px;
        }
      `}</style>
    </div>
  );
}

export default Room; 