import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router";
import { nanoid } from "nanoid";
import { ethers } from "ethers";

import { names, type ChatMessage, type Message } from "../shared";

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

function App() {
  const [name, setName] = useState<string>("");
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);
  const { room } = useParams();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;
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

  // 断开钱包连接
  const disconnectWallet = () => {
    setWalletAddress("");
    setName("");
    setIsConnected(false);
  };

  // 监听钱包账户变化
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          const address = accounts[0];
          setWalletAddress(address);
          const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;
          setName(shortAddress);
          setIsConnected(true);
        } else {
          disconnectWallet();
        }
      });
    }
  }, []);

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
      } else {
        setMessages(message.messages);
      }
    },
  });

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#f5f5f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: isMobile ? '0' : '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: isMobile ? '100%' : '1000px',
        height: isMobile ? '100vh' : '80vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        borderRadius: isMobile ? '0' : '16px',
        boxShadow: isMobile ? 'none' : '0 10px 40px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* 聊天窗口头部 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e1e5e9',
          padding: '16px 20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          zIndex: 10,
          borderTopLeftRadius: isMobile ? '0' : '16px',
          borderTopRightRadius: isMobile ? '0' : '16px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ 
                margin: '0', 
                color: '#1a1a1a', 
                fontSize: isMobile ? '18px' : '20px',
                fontWeight: '600'
              }}>
                💬 Web3 聊天室
              </h2>
              <div style={{ 
                fontSize: '14px', 
                color: '#666',
                marginTop: '4px'
              }}>
                房间: {room}
              </div>
            </div>
            
            {/* 钱包连接区域 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              {!isConnected ? (
                <button 
                  onClick={connectWallet}
                  style={{
                    backgroundColor: '#007bff',
                    color: 'white',
                    padding: isMobile ? '8px 16px' : '10px 20px',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: isMobile ? '12px' : '14px',
                    fontWeight: '500',
                    boxShadow: '0 2px 8px rgba(0,123,255,0.3)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#0056b3';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#007bff';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🔗 连接钱包
                </button>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  backgroundColor: '#f8f9fa',
                  padding: isMobile ? '6px 12px' : '8px 16px',
                  borderRadius: '20px',
                  border: '1px solid #e9ecef'
                }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      fontSize: isMobile ? '12px' : '14px', 
                      color: '#495057',
                      fontWeight: '500'
                    }}>
                      {name}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6c757d'
                    }}>
                      已连接
                    </div>
                  </div>
                  <button 
                    onClick={disconnectWallet}
                    style={{
                      backgroundColor: '#dc3545',
                      color: 'white',
                      padding: isMobile ? '4px 8px' : '6px 12px',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: isMobile ? '10px' : '12px',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#c82333';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#dc3545';
                    }}
                  >
                    断开
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 消息区域 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: isMobile ? '15px' : '20px',
          backgroundColor: '#ffffff',
          backgroundImage: 'linear-gradient(45deg, #f8f9fa 25%, transparent 25%), linear-gradient(-45deg, #f8f9fa 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8f9fa 75%), linear-gradient(-45deg, transparent 75%, #f8f9fa 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
        }}>
          <div style={{
            maxWidth: '100%',
            margin: '0 auto'
          }}>
            {messages.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: isMobile ? '40px 15px' : '60px 20px',
                color: '#666'
              }}>
                <div style={{ fontSize: isMobile ? '36px' : '48px', marginBottom: '16px' }}>💬</div>
                <h3 style={{ margin: '0 0 8px 0', color: '#333', fontSize: isMobile ? '18px' : '20px' }}>
                  {isConnected ? '开始聊天吧！' : '请先连接钱包'}
                </h3>
                <p style={{ margin: '0', fontSize: '14px' }}>
                  {isConnected ? '发送第一条消息开始对话' : '连接钱包后即可开始聊天'}
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={message.id} style={{
                  marginBottom: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'fadeInUp 0.3s ease-out'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    justifyContent: message.user === name ? 'flex-end' : 'flex-start'
                  }}>
                    {message.user !== name && (
                      <div style={{
                        width: isMobile ? '40px' : '48px',
                        height: isMobile ? '40px' : '48px',
                        borderRadius: '50%',
                        backgroundColor: '#6c757d',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: isMobile ? '10px' : '12px',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        flexDirection: 'column',
                        lineHeight: '1'
                      }}>
                        {message.user.includes('...') ? (
                          <>
                            <div>{message.user.split('...')[0]}</div>
                            <div>{message.user.split('...')[1]}</div>
                          </>
                        ) : (
                          message.user.slice(0, 2).toUpperCase()
                        )}
                      </div>
                    )}
                    <div style={{
                      backgroundColor: message.user === name ? '#007bff' : '#f8f9fa',
                      color: message.user === name ? 'white' : '#333',
                      padding: isMobile ? '10px 12px' : '12px 16px',
                      borderRadius: '18px',
                      maxWidth: isMobile ? '85%' : '70%',
                      wordWrap: 'break-word',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      borderBottomRightRadius: message.user === name ? '4px' : '18px',
                      borderBottomLeftRadius: message.user === name ? '18px' : '4px'
                    }}>
                      <div style={{
                        fontSize: isMobile ? '10px' : '12px',
                        opacity: 0.8,
                        marginBottom: '4px',
                        fontWeight: '500'
                      }}>
                        {message.user}
                      </div>
                      <div style={{ fontSize: isMobile ? '13px' : '14px', lineHeight: '1.4' }}>
                        {message.content}
                      </div>
                    </div>
                    {message.user === name && (
                      <div style={{
                        width: isMobile ? '40px' : '48px',
                        height: isMobile ? '40px' : '48px',
                        borderRadius: '50%',
                        backgroundColor: '#007bff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: isMobile ? '10px' : '12px',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        flexDirection: 'column',
                        lineHeight: '1'
                      }}>
                        {message.user.includes('...') ? (
                          <>
                            <div>{message.user.split('...')[0]}</div>
                            <div>{message.user.split('...')[1]}</div>
                          </>
                        ) : (
                          message.user.slice(0, 2).toUpperCase()
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 输入区域 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e1e5e9',
          padding: isMobile ? '15px' : '20px',
          boxShadow: '0 -2px 4px rgba(0,0,0,0.1)',
          borderBottomLeftRadius: isMobile ? '0' : '16px',
          borderBottomRightRadius: isMobile ? '0' : '16px'
        }}>
          <div style={{
            maxWidth: '100%',
            margin: '0 auto'
          }}>
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
                const chatMessage: ChatMessage = {
                  id: nanoid(8),
                  content: content.value,
                  user: name,
                  role: "user",
                };
                setMessages((messages) => [...messages, chatMessage]);
                // we could broadcast the message here

                socket.send(
                  JSON.stringify({
                    type: "add",
                    ...chatMessage,
                  } satisfies Message),
                );

                content.value = "";
              }}
              style={{
                display: 'flex',
                gap: isMobile ? '8px' : '12px',
                alignItems: 'flex-end'
              }}
            >
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  name="content"
                  placeholder={isConnected ? `输入消息...` : "请先连接钱包..."}
                  autoComplete="off"
                  disabled={!isConnected}
                  style={{
                    width: '100%',
                    padding: isMobile ? '10px 14px' : '12px 16px',
                    border: '1px solid #e1e5e9',
                    borderRadius: '24px',
                    fontSize: isMobile ? '13px' : '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                    backgroundColor: isConnected ? '#ffffff' : '#f8f9fa',
                    color: isConnected ? '#333' : '#999'
                  }}
                  onFocus={(e) => {
                    if (isConnected) {
                      e.target.style.borderColor = '#007bff';
                    }
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e1e5e9';
                  }}
                />
              </div>
              <button 
                type="submit" 
                disabled={!isConnected}
                style={{
                  backgroundColor: isConnected ? '#007bff' : '#e9ecef',
                  color: isConnected ? 'white' : '#999',
                  padding: isMobile ? '10px 16px' : '12px 20px',
                  border: 'none',
                  borderRadius: '24px',
                  cursor: isConnected ? 'pointer' : 'not-allowed',
                  fontSize: isMobile ? '12px' : '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onMouseOver={(e) => {
                  if (isConnected) {
                    e.currentTarget.style.backgroundColor = '#0056b3';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseOut={(e) => {
                  if (isConnected) {
                    e.currentTarget.style.backgroundColor = '#007bff';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                📤 发送
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
      <Route path="/:room" element={<App />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>,
);
