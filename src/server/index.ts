import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";
import { ethers } from "ethers";
import type { ChatMessage, Message, OnlineUser, RoomStats } from "../shared";
import { CHAIN_CONFIG } from "../shared.config";
import usdtAbi from "../abi/usdt.json";

interface Env {
  RoomRegistry: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const fallbackProvider = new ethers.FallbackProvider(
  CHAIN_CONFIG.BSC_RPC_URLS.map(url => new ethers.JsonRpcProvider(url))
);

async function verifyPayment(txHash: string, wallet: string) {
  console.log('[verifyPayment] 开始验证支付:', { txHash, wallet });
  
  // 用BscScan API校验交易状态
  const statusUrl = `https://api.bscscan.com/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=${CHAIN_CONFIG.BSC_SCAN_API_KEY}`;
  console.log('[verifyPayment] 状态查询URL:', statusUrl);
  const statusRes = await fetch(statusUrl);
  const statusData = (await statusRes.json()) as any;
  console.log('[verifyPayment] 状态查询结果:', statusData);
  
  if (statusData.status === "1" && statusData.result.status === "1") {
    // 交易成功，获取该交易的详细收据信息
    const receiptUrl = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${CHAIN_CONFIG.BSC_SCAN_API_KEY}`;
    console.log('[verifyPayment] 收据查询URL:', receiptUrl);
    const receiptRes = await fetch(receiptUrl);
    const receiptData = (await receiptRes.json()) as any;
    console.log('[verifyPayment] 收据查询结果:', receiptData);
    
    if (receiptData.status === "1" && receiptData.result) {
      const receipt = receiptData.result;
      // 检查交易的日志，寻找USDT转账事件
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const fromAddress = '0x' + wallet.replace('0x','').padStart(64,'0');
      const toAddress = '0x' + CHAIN_CONFIG.RECEIVER.replace('0x','').padStart(64,'0');
      const expectedAmount = BigInt(ethers.parseUnits(CHAIN_CONFIG.CREATE_ROOM_AMOUNT, CHAIN_CONFIG.USDT_DECIMALS)).toString(16).padStart(64, '0');
      
      console.log('[verifyPayment] 验证参数:', {
        transferTopic,
        fromAddress,
        toAddress,
        expectedAmount,
        usdtAddress: CHAIN_CONFIG.USDT_ADDRESS,
        receiver: CHAIN_CONFIG.RECEIVER,
        amount: CHAIN_CONFIG.CREATE_ROOM_AMOUNT
      });
      
      // 在该交易的日志中查找USDT转账事件
      console.log('[verifyPayment] 交易日志数量:', receipt.logs?.length);
      
      // 输出所有日志用于调试
      receipt.logs?.forEach((log: any, index: number) => {
        console.log(`[verifyPayment] 日志 ${index}:`, {
          address: log.address,
          topics: log.topics,
          data: log.data
        });
      });
      
      const transferLog = receipt.logs?.find((log: any) => {
        const addressMatch = log.address.toLowerCase() === CHAIN_CONFIG.USDT_ADDRESS.toLowerCase();
        const topicMatch = log.topics[0] === transferTopic;
        const fromMatch = log.topics[1]?.toLowerCase() === fromAddress.toLowerCase();
        const toMatch = log.topics[2]?.toLowerCase() === toAddress.toLowerCase();
        const dataMatch = log.data.toLowerCase() === '0x' + expectedAmount;
        
        console.log('[verifyPayment] 日志匹配检查:', {
          addressMatch,
          topicMatch,
          fromMatch,
          toMatch,
          dataMatch,
          logAddress: log.address,
          logTopic0: log.topics[0],
          logTopic1: log.topics[1],
          logTopic2: log.topics[2],
          logData: log.data
        });
        
        return addressMatch && topicMatch && fromMatch && toMatch && dataMatch;
      });
      
      if (transferLog) {
        console.log('[verifyPayment] 找到匹配的转账日志');
        return { success: true };
      } else {
        console.log('[verifyPayment] 未找到匹配的转账日志');
        return { success: false, message: "交易中未找到正确的USDT转账记录" };
      }
    } else {
      return { success: false, message: "无法获取交易收据" };
    }
  } else {
    return { success: false, message: "交易未上链或失败" };
  }
}

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];
  room = "";
  onlineUsers = new Map<string, OnlineUser>(); // 在线用户列表
  userConnections = new Map<string, Connection>(); // 用户连接映射
  heartbeatInterval: NodeJS.Timeout | null = null;

  async onStart() {
    // 校验房间号是否已注册
    this.room = this.ctx.id.name || this.ctx.id.toString();
    const id = this.env.RoomRegistry.idFromName("global");
    const stub = this.env.RoomRegistry.get(id);
    const res = await stub.fetch("http://dummy/has", {
      method: "POST",
      body: JSON.stringify({ roomId: this.room }),
      headers: { "Content-Type": "application/json" }
    });
    const { exists } = (await res.json()) as { exists: boolean };
    if (!exists) {
      throw new Error("房间未注册，禁止访问");
    }
    
    // 创建消息表
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_type TEXT DEFAULT 'text',
        file_url TEXT,
        file_name TEXT,
        file_size INTEGER,
        file_mime_type TEXT,
        thumbnail_url TEXT,
        duration REAL
      )`,
    );

    // 添加新列（如果不存在）- 数据库迁移
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'`);
    } catch (e) {
      // 列已存在，忽略错误
    }
    
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN file_url TEXT`);
    } catch (e) {
      // 列已存在，忽略错误
    }
    
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN file_name TEXT`);
    } catch (e) {
      // 列已存在，忽略错误
    }
    
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN file_size INTEGER`);
    } catch (e) {
      // 列已存在，忽略错误
    }
    
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN file_mime_type TEXT`);
    } catch (e) {
      // 列已存在，忽略错误
    }
    
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN thumbnail_url TEXT`);
    } catch (e) {
      // 列已存在，忽略错误
    }
    
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN duration REAL`);
    } catch (e) {
      // 列已存在，忽略错误
    }
    
    // 创建访客统计表
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS visitors (
        address TEXT PRIMARY KEY,
        first_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
        visit_count INTEGER DEFAULT 1
      )`,
    );
    
          // 加载所有消息（兼容旧数据库结构）
      this.messages = this.ctx.storage.sql
        .exec(`SELECT 
          id, 
          user, 
          role, 
          content, 
          timestamp,
          COALESCE(message_type, 'text') as messageType,
          file_url as fileUrl,
          file_name as fileName,
          file_size as fileSize,
          file_mime_type as fileMimeType,
          thumbnail_url as thumbnailUrl,
          duration
        FROM messages ORDER BY timestamp ASC`)
        .toArray() as ChatMessage[];

    // 启动心跳检测，每30秒清理不活跃用户
    this.startHeartbeatCheck();
  }

  startHeartbeatCheck() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 60秒超时
      
      // 清理超时用户
      for (const [address, user] of this.onlineUsers.entries()) {
        if (now - user.lastActivity > timeout) {
          this.removeOnlineUser(address);
        }
      }
    }, 30000); // 每30秒检查一次
  }

  addOnlineUser(address: string, connection: Connection) {
    const now = Date.now();
    
    // 记录访客
    this.ctx.storage.sql.exec(
      `INSERT INTO visitors (address, first_visit, last_visit, visit_count) 
       VALUES (?, datetime('now'), datetime('now'), 1)
       ON CONFLICT(address) DO UPDATE SET 
       last_visit = datetime('now'), 
       visit_count = visit_count + 1`,
      address
    );

    // 添加到在线用户列表
    if (!this.onlineUsers.has(address)) {
      this.onlineUsers.set(address, {
        address,
        joinTime: now,
        lastActivity: now
      });
      
      // 通知其他用户有新用户加入
      this.broadcastMessage({
        type: "userJoin",
        user: address
      } as Message, [address]);
    }
    
    this.userConnections.set(address, connection);
    this.updateUserActivity(address);
    this.broadcastRoomStats();
  }

  removeOnlineUser(address: string) {
    if (this.onlineUsers.has(address)) {
      this.onlineUsers.delete(address);
      this.userConnections.delete(address);
      
      // 通知其他用户有用户离开
      this.broadcastMessage({
        type: "userLeave",
        user: address
      } as Message);
      
      this.broadcastRoomStats();
    }
  }

  updateUserActivity(address: string) {
    const user = this.onlineUsers.get(address);
    if (user) {
      user.lastActivity = Date.now();
    }
  }

  getRoomStats(): RoomStats {
    const totalMessages = this.messages.length;
    const uniqueUsers = new Set(this.messages.map(m => m.user)).size;
    const onlineUsers = this.onlineUsers.size;
    
    // 获取总访客数
    const totalVisitorsResult = this.ctx.storage.sql.exec(
      `SELECT COUNT(*) as count FROM visitors`
    ).toArray();
    const totalVisitors = Number(totalVisitorsResult[0]?.count) || 0;
    
    // 用户消息统计
    const userMessageCounts: Record<string, number> = {};
    this.messages.forEach(message => {
      userMessageCounts[message.user] = (userMessageCounts[message.user] || 0) + 1;
    });

    return {
      totalMessages,
      uniqueUsers,
      onlineUsers,
      totalVisitors,
      userMessageCounts,
      onlineUsersList: Array.from(this.onlineUsers.values())
    };
  }

  broadcastRoomStats() {
    const stats = this.getRoomStats();
    this.broadcastMessage({
      type: "roomStats",
      stats
    } as Message);
  }

  onConnect(connection: Connection) {
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message),
    );
  }

  onClose(connection: Connection) {
    // 找到断开连接的用户
    for (const [address, conn] of this.userConnections.entries()) {
      if (conn === connection) {
        this.removeOnlineUser(address);
        break;
      }
    }
  }

  saveMessage(message: ChatMessage) {
    // 添加时间戳（如果没有的话）
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }
    
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return { ...message, timestamp: message.timestamp };
        }
        return m;
      });
    } else {
      this.messages.push({ ...message, timestamp: message.timestamp });
    }
    
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content, timestamp, message_type, file_url, file_name, file_size, file_mime_type, thumbnail_url, duration) 
       VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET 
         content = ?, 
         timestamp = datetime('now'),
         message_type = ?,
         file_url = ?,
         file_name = ?,
         file_size = ?,
         file_mime_type = ?,
         thumbnail_url = ?,
         duration = ?`,
      message.id, 
      message.user, 
      message.role, 
      message.content,
      message.messageType || 'text',
      message.fileUrl || null,
      message.fileName || null,
      message.fileSize || null,
      message.fileMimeType || null,
      message.thumbnailUrl || null,
      message.duration || null,
      // ON CONFLICT UPDATE values
      message.content,
      message.messageType || 'text',
      message.fileUrl || null,
      message.fileName || null,
      message.fileSize || null,
      message.fileMimeType || null,
      message.thumbnailUrl || null,
      message.duration || null
    );
  }

  // 删除单条消息
  deleteMessage(messageId: string) {
    this.messages = this.messages.filter((m) => m.id !== messageId);
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id = '${messageId}' AND room = '${this.room}'`);
    // 广播删除消息给所有客户端
    this.broadcastMessage({
      type: "delete",
      id: messageId,
    } as any);
  }

  // 清空所有消息
  clearAllMessages() {
    this.messages = [];
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE room = '${this.room}'`);
    // 广播清空消息给所有客户端
    this.broadcastMessage({
      type: "clear",
    } as any);
  }

  // 获取本房间消息统计
  getMessageStats() {
    const totalMessages = this.messages.length;
    const uniqueUsers = new Set(this.messages.map(m => m.user)).size;
    const userMessageCounts = this.messages.reduce((acc, msg) => {
      acc[msg.user] = (acc[msg.user] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return {
      totalMessages,
      uniqueUsers,
      userMessageCounts,
      messages: this.messages
    };
  }

  // 删除指定用户的消息
  deleteUserMessages(user: string) {
    const deletedCount = this.messages.filter(m => m.user === user).length;
    this.messages = this.messages.filter((m) => m.user !== user);
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE user = '${user}' AND room = '${this.room}'`);
    return deletedCount;
  }

  // ====== 全局管理 ======
  // 获取所有房间的消息统计
  getAllMessageStats() {
    const all = this.ctx.storage.sql.exec(`SELECT * FROM messages ORDER BY timestamp ASC`).toArray() as any[];
    const totalMessages = all.length;
    const uniqueUsers = new Set(all.map(m => m.user)).size;
    const userMessageCounts = all.reduce((acc, msg) => {
      acc[msg.user] = (acc[msg.user] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    // 按房间分组
    const rooms = {} as Record<string, ChatMessage[]>;
    all.forEach(m => {
      if (!rooms[m.room]) rooms[m.room] = [];
      rooms[m.room].push(m);
    });
    return {
      totalMessages,
      uniqueUsers,
      userMessageCounts,
      messages: all,
      rooms,
    };
  }

  // 全局删除单条消息
  deleteMessageGlobal(messageId: string) {
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id = '${messageId}'`);
  }

  // 全局清空所有消息
  clearAllMessagesGlobal() {
    this.ctx.storage.sql.exec(`DELETE FROM messages`);
  }

  // 全局删除指定用户的消息
  deleteUserMessagesGlobal(user: string) {
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE user = '${user}'`);
  }

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onMessage(connection: Connection, message: WSMessage) {
    const data = JSON.parse(message as string) as Message;
    console.log("收到消息:", data);

    if (data.type === "add") {
      // 用户发送消息时，自动加入在线列表
      this.addOnlineUser(data.user, connection);
      
      const chatMessage: ChatMessage = {
        id: data.id,
        content: data.content,
        user: data.user,
        role: data.role,
        timestamp: new Date().toISOString(),
        messageType: data.messageType,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileMimeType: data.fileMimeType,
        thumbnailUrl: data.thumbnailUrl,
        duration: data.duration
      };
      this.saveMessage(chatMessage);
      
      // 广播消息时也包含时间戳
      this.broadcastMessage({
        ...data,
        timestamp: chatMessage.timestamp
      } as Message);
      this.updateUserActivity(data.user);
      
    } else if (data.type === "userJoin") {
      // 用户主动加入房间
      this.addOnlineUser(data.user, connection);
      
    } else if (data.type === "heartbeat") {
      // 心跳消息，更新用户活动时间
      this.updateUserActivity(data.user);
      
    } else if (data.type === "admin") {
      if (data.action === "getStats") {
        const stats = this.getMessageStats();
        connection.send(
          JSON.stringify({
            type: "stats",
            data: stats,
          } satisfies Message),
        );
      } else if (data.action === "delete" && data.messageId) {
        this.deleteMessage(data.messageId);
      } else if (data.action === "clear") {
        this.clearAllMessages();
      } else if (data.action === "deleteUser" && data.user) {
        this.deleteUserMessages(data.user);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 文件上传API
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const room = formData.get("room") as string;
        
        if (!file || !room) {
          return new Response(JSON.stringify({ error: "缺少文件或房间信息" }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // 检查文件大小 (最大50MB)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
          return new Response(JSON.stringify({ error: "文件大小超过50MB限制" }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // 检查文件类型
        const allowedTypes = [
          // 图片
          'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
          // 音频
          'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
          // 视频
          'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov'
        ];

        if (!allowedTypes.includes(file.type)) {
          return new Response(JSON.stringify({ error: "不支持的文件类型" }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // 生成文件名
        const timestamp = Date.now();
        const extension = file.name.split('.').pop() || '';
        const fileName = `${room}_${timestamp}.${extension}`;
        
        // 在实际生产环境中，这里应该上传到对象存储服务（如AWS S3、CloudFlare R2等）
        // 现在我们模拟返回一个URL
        const fileUrl = `https://your-storage.com/uploads/${fileName}`;
        
        // 确定消息类型
        let messageType: "image" | "audio" | "video" | "file" = "file";
        if (file.type.startsWith('image/')) {
          messageType = "image";
        } else if (file.type.startsWith('audio/')) {
          messageType = "audio";
        } else if (file.type.startsWith('video/')) {
          messageType = "video";
        }

        return new Response(JSON.stringify({
          success: true,
          fileUrl,
          fileName: file.name,
          fileSize: file.size,
          fileMimeType: file.type,
          messageType
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error('文件上传错误:', error);
        return new Response(JSON.stringify({ error: "文件上传失败" }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    // 支付校验API
    if (url.pathname === "/api/verify-payment" && request.method === "POST") {
      const { room, txHash, wallet } = (await request.json()) as { room: string; txHash: string; wallet: string };
      const result = await verifyPayment(txHash, wallet);
      if (!result.success) {
        return new Response(JSON.stringify(result), { status: 400 });
      }
      // 注册房间
      const id = env.RoomRegistry.idFromName("global");
      const stub = env.RoomRegistry.get(id);
      await stub.fetch("http://dummy/add", {
        method: "POST",
        body: JSON.stringify({ roomId: room }),
        headers: { "Content-Type": "application/json" }
      });
      return new Response(JSON.stringify({ success: true }));
    }
    
    // 其他请求走原有逻辑
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;

export { RoomRegistry } from "./RoomRegistry";
