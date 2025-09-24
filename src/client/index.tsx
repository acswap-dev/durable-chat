import { createRoot } from "react-dom/client";
import React, { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router";
import { nanoid } from "nanoid";

import Admin from "./Admin";
import CreateRoom from "./CreateRoom";
import Room from "./Room";

// 房间数据类型
interface RoomInfo {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  lastActivity: string;
  isActive: boolean;
}

function HomePage() {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);
  const navigate = useNavigate();

  // 预定义的房间列表
  const [rooms] = useState<RoomInfo[]>([
    {
      id: "0xf5f3dfe314deeea5a8406c6104e32cf988888888",
      name: "马上有钱",
      description: "所有人都可以加入的公共聊天空间",
      memberCount: 156,
      lastActivity: "2分钟前",
      isActive: true
    },
    {
      id: "public-chat",
      name: "公共聊天室",
      description: "免费开放的公共聊天空间，欢迎所有人加入",
      memberCount: 89,
      lastActivity: "5分钟前",
      isActive: true
    },
    {
      id: "general",
      name: "通用讨论",
      description: "各种话题的讨论空间，畅所欲言",
      memberCount: 42,
      lastActivity: "1分钟前",
      isActive: true
    },
    {
      id: "welcome",
      name: "新手欢迎",
      description: "新用户欢迎聊天室，适合初次体验",
      memberCount: 23,
      lastActivity: "10分钟前",
      isActive: true
    }
  ]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 进入房间
  const enterRoom = (roomId: string) => {
    navigate(`/room/${roomId}`);
  };

  // 创建新房间
  const createNewRoom = () => {
    navigate('/create-room');
  };

  // 快速创建免费房间
  const createFreeRoom = async () => {
    const roomId = nanoid(8); // 生成8位随机房间ID
    try {
      const response = await fetch('/api/create-free-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomId })
      });
      
      const result = await response.json();
      if (result.success) {
        alert('免费房间创建成功！');
        navigate(`/room/${roomId}`);
      } else {
        alert(result.error || '创建房间失败');
      }
    } catch (error) {
      console.error('创建免费房间失败:', error);
      alert('创建房间失败，请稍后重试');
    }
  };

  // 随机加入房间
  const joinRandomRoom = () => {
    const randomId = nanoid();
    navigate(`/room/${randomId}`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f7fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: isMobile ? '0' : '20px'
    }}>
      {/* 头部 */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: isMobile ? '20px 15px' : '40px 20px'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: isMobile ? '30px' : '50px'
        }}>
          <h1 style={{
            fontSize: isMobile ? '28px' : '42px',
            fontWeight: '700',
            color: '#1a1a1a',
            margin: '0 0 16px 0',
            background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            🌐 Web3 聊天大厅
          </h1>
          <p style={{
            fontSize: isMobile ? '16px' : '18px',
            color: '#666',
            margin: '0',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto',
            lineHeight: '1.6'
          }}>
            连接你的钱包，加入去中心化的聊天社区，与全球用户实时交流
          </p>
        </div>

        {/* 操作按钮 */}
        {/* <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          marginBottom: isMobile ? '30px' : '40px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={createNewRoom}
            style={{
              background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
              color: 'white',
              padding: isMobile ? '12px 24px' : '14px 28px',
              border: 'none',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: isMobile ? '14px' : '16px',
              fontWeight: '600',
              boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(40, 167, 69, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(40, 167, 69, 0.3)';
            }}
          >
            ➕ 创建房间
          </button>
          
          <button
            onClick={createFreeRoom}
            style={{
              background: 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)',
              color: 'white',
              padding: isMobile ? '12px 24px' : '14px 28px',
              border: 'none',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: isMobile ? '14px' : '16px',
              fontWeight: '600',
              boxShadow: '0 4px 15px rgba(23, 162, 184, 0.3)',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(23, 162, 184, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(23, 162, 184, 0.3)';
            }}
          >
            🆓 免费房间
          </button>
          
          <button
            onClick={joinRandomRoom}
            style={{
              background: 'linear-gradient(135deg, #6f42c1 0%, #563d7c 100%)',
              color: 'white',
              padding: isMobile ? '12px 24px' : '14px 28px',
              border: 'none',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: isMobile ? '14px' : '16px',
              fontWeight: '600',
              boxShadow: '0 4px 15px rgba(111, 66, 193, 0.3)',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(111, 66, 193, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(111, 66, 193, 0.3)';
            }}
          >
            🎲 随机房间
          </button>
        </div> */}

        {/* 房间列表 */}
        <div style={{
          maxWidth: '1000px',
          margin: '0 auto'
        }}>
          <h2 style={{
            fontSize: isMobile ? '22px' : '28px',
            fontWeight: '600',
            color: '#1a1a1a',
            margin: '0 0 24px 0',
            textAlign: 'center'
          }}>
            🏠 推荐房间
          </h2>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '20px',
            padding: '0'
          }}>
            {rooms.map((room) => (
              <div
                key={room.id}
                onClick={() => enterRoom(room.id)}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  border: '1px solid #f0f0f0',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';
                  e.currentTarget.style.borderColor = '#007bff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)';
                  e.currentTarget.style.borderColor = '#f0f0f0';
                }}
              >
                {/* 活跃状态指示器 */}
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: room.isActive ? '#28a745' : '#6c757d',
                    animation: room.isActive ? 'pulse 2s infinite' : 'none'
                  }}></div>
                  <span style={{
                    fontSize: '12px',
                    color: room.isActive ? '#28a745' : '#6c757d',
                    fontWeight: '500'
                  }}>
                    {room.isActive ? '活跃' : '安静'}
                  </span>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{
                    fontSize: isMobile ? '18px' : '20px',
                    fontWeight: '600',
                    color: '#1a1a1a',
                    margin: '0 0 8px 0',
                    paddingRight: '60px'
                  }}>
                    {room.name}
                  </h3>
                  <p style={{
                    fontSize: '14px',
                    color: '#666',
                    margin: '0',
                    lineHeight: '1.5'
                  }}>
                    {room.description}
                  </p>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '16px',
                  borderTop: '1px solid #f0f0f0'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{ fontSize: '16px' }}>👥</span>
                    <span style={{ 
                      fontSize: '14px', 
                      color: '#333',
                      fontWeight: '500'
                    }}>
                      {room.memberCount}
                    </span>
                  </div>
                  
                  <div style={{
                    fontSize: '12px',
                    color: '#999'
                  }}>
                    {room.lastActivity}
                  </div>
                </div>

                <div style={{
                  fontSize: '10px',
                  color: '#ccc',
                  marginTop: '8px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all'
                }}>
                  {isMobile ? `${room.id.slice(0, 8)}...${room.id.slice(-8)}` : room.id}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部信息 */}
        <div style={{
          textAlign: 'center',
          marginTop: isMobile ? '40px' : '60px',
          padding: '30px 20px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{
            fontSize: isMobile ? '18px' : '20px',
            fontWeight: '600',
            color: '#1a1a1a',
            margin: '0 0 12px 0'
          }}>
            🔐 安全 · 去中心化 · 开放
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#666',
            margin: '0',
            lineHeight: '1.6'
          }}>
            使用您的加密钱包连接，享受真正的去中心化聊天体验。<br />
            所有消息都通过区块链网络传输，保障您的隐私和数据安全。
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/create-room" element={<CreateRoom />} />
      <Route path="/room/:room" element={<Room />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>,
);
