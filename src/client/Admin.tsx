import React, { useState, useEffect, useMemo } from "react";
import { usePartySocket } from "partysocket/react";
import { nanoid } from "nanoid";
import type { ChatMessage, Message } from "../shared";

interface AdminStats {
  totalMessages: number;
  uniqueUsers: number;
  userMessageCounts: Record<string, number>;
  messages: ChatMessage[];
}

function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [room, setRoom] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 只有登录后且 room 有值时才初始化 socket
  const socket = useMemo(() => {
    if (!isLoggedIn || !room) return null;
    return usePartySocket({
      party: "chat",
      room,
      onMessage: (evt) => {
        const message = JSON.parse(evt.data as string) as Message;
        if (message.type === "stats") {
          setStats(message.data);
          setMessages(message.data.messages);
        } else if (message.type === "all") {
          setMessages(message.messages);
        } else if (message.type === "delete") {
          setMessages((messages) => messages.filter((m) => m.id !== message.id));
        } else if (message.type === "clear") {
          setMessages([]);
        }
      },
    });
    // eslint-disable-next-line
  }, [isLoggedIn, room]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "admin" && password === "123456" && room) {
      setIsLoggedIn(true);
      // 登录后再请求统计
      setTimeout(() => {
        socket?.send && socket.send(JSON.stringify({
          type: "admin",
          action: "getStats"
        }));
      }, 100);
    } else {
      alert("用户名、房间或密码错误！");
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    socket?.send && socket.send(JSON.stringify({
      type: "admin",
      action: "delete",
      messageId
    }));
  };

  const handleClearAllMessages = () => {
    if (confirm("确定要清空所有消息吗？")) {
      socket?.send && socket.send(JSON.stringify({
        type: "admin",
        action: "clear"
      }));
    }
  };

  const handleDeleteUserMessages = (user: string) => {
    if (confirm(`确定要删除用户 ${user} 的所有消息吗？`)) {
      socket?.send && socket.send(JSON.stringify({
        type: "admin",
        action: "deleteUser",
        user
      }));
    }
  };

  const getShortAddress = (address: string) => {
    if (address.includes('...')) {
      return address;
    }
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (!isLoggedIn) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: isMobile ? '20px' : '0'
      }}>
        <div style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : '400px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
          padding: isMobile ? '30px 20px' : '40px',
        }}>
          <div style={{
            textAlign: 'center',
            marginBottom: '30px'
          }}>
            <h1 style={{
              margin: '0 0 10px 0',
              color: '#1a1a1a',
              fontSize: isMobile ? '24px' : '28px',
              fontWeight: '700'
            }}>
              🔐 管理员登录
            </h1>
            <p style={{
              margin: '0',
              color: '#666',
              fontSize: '14px'
            }}>
              请输入管理员凭据
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                color: '#333',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #e1e5e9',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                placeholder="请输入用户名"
                required
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                color: '#333',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                房间ID
              </label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #e1e5e9',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                placeholder="请输入房间ID"
                required
              />
            </div>

            <div style={{ marginBottom: '30px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                color: '#333',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #e1e5e9',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                placeholder="请输入密码"
                required
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
                color: 'white',
                padding: '14px 20px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 123, 255, 0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              登录
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: isMobile ? '10px' : '20px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {/* 头部 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          gap: '10px'
        }}>
          <div>
            <h1 style={{
              margin: '0 0 5px 0',
              color: '#1a1a1a',
              fontSize: isMobile ? '20px' : '24px',
              fontWeight: '700'
            }}>
              🛠️ 管理员控制台
            </h1>
            <p style={{
              margin: '0',
              color: '#666',
              fontSize: '14px'
            }}>
              房间: {room}
            </p>
          </div>
          
          <div style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => {
                socket?.send?.(JSON.stringify({
                  type: "admin",
                  action: "getStats"
                }));
              }}
              style={{
                background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                color: 'white',
                padding: '10px 16px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              🔄 刷新统计
            </button>
            
            <button
              onClick={() => setIsLoggedIn(false)}
              style={{
                background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                color: 'white',
                padding: '10px 16px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              🚪 退出登录
            </button>
          </div>
        </div>

        {/* 统计信息 */}
        {stats && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{
              margin: '0 0 20px 0',
              color: '#1a1a1a',
              fontSize: '20px',
              fontWeight: '600'
            }}>
              📊 房间统计
            </h2>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px'
            }}>
              <div style={{
                backgroundColor: '#f8f9fa',
                padding: '20px',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '32px',
                  fontWeight: '700',
                  color: '#007bff',
                  marginBottom: '8px'
                }}>
                  {stats.totalMessages}
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#666'
                }}>
                  总消息数
                </div>
              </div>
              
              <div style={{
                backgroundColor: '#f8f9fa',
                padding: '20px',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '32px',
                  fontWeight: '700',
                  color: '#28a745',
                  marginBottom: '8px'
                }}>
                  {stats.uniqueUsers}
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#666'
                }}>
                  活跃用户数
                </div>
              </div>
            </div>

            {/* 用户消息统计 */}
            {Object.keys(stats.userMessageCounts).length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h3 style={{
                  margin: '0 0 15px 0',
                  color: '#1a1a1a',
                  fontSize: '16px',
                  fontWeight: '600'
                }}>
                  用户消息统计
                </h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '10px'
                }}>
                  {Object.entries(stats.userMessageCounts).map(([user, count]) => (
                    <div key={user} style={{
                      backgroundColor: '#f8f9fa',
                      padding: '15px',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#333',
                          marginBottom: '4px'
                        }}>
                          {getShortAddress(user)}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#666'
                        }}>
                          {count} 条消息
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteUserMessages(user)}
                        style={{
                          background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                          color: 'white',
                          padding: '6px 12px',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        删除用户消息
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 管理操作 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            color: '#1a1a1a',
            fontSize: '20px',
            fontWeight: '600'
          }}>
            ⚙️ 管理操作
          </h2>
          
          <div style={{
            display: 'flex',
            gap: '15px',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={handleClearAllMessages}
              style={{
                background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                color: 'white',
                padding: '12px 20px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              🗑️ 清空所有消息
            </button>
            
            <button
              onClick={() => {
                socket?.send?.(JSON.stringify({
                  type: "admin",
                  action: "getStats"
                }));
              }}
              style={{
                background: 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)',
                color: 'white',
                padding: '12px 20px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              📋 导出消息记录
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            color: '#1a1a1a',
            fontSize: '20px',
            fontWeight: '600'
          }}>
            💬 消息列表 ({messages.length})
          </h2>
          
          {messages.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#666'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
              <p>暂无消息</p>
            </div>
          ) : (
            <div style={{
              maxHeight: '500px',
              overflowY: 'auto'
            }}>
              {messages.map((message, index) => (
                <div key={message.id} style={{
                  border: '1px solid #e1e5e9',
                  borderRadius: '8px',
                  padding: '15px',
                  marginBottom: '10px',
                  backgroundColor: '#f8f9fa'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '10px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#333',
                        marginBottom: '4px'
                      }}>
                        {getShortAddress(message.user)}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#666'
                      }}>
                        ID: {message.id} | 时间: {new Date().toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteMessage(message.id)}
                      style={{
                        background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                        color: 'white',
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}
                    >
                      删除
                    </button>
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#333',
                    lineHeight: '1.5'
                  }}>
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Admin; 