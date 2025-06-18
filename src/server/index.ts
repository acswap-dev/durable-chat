import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";
import { ethers } from "ethers";
import type { ChatMessage, Message } from "../shared";
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
    // 新表结构：增加 room 字段
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room TEXT,
        user TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    // 只加载本房间消息
    this.messages = this.ctx.storage.sql
      .exec(`SELECT * FROM messages WHERE room = '${this.room}' ORDER BY timestamp ASC`)
      .toArray() as ChatMessage[];
  }

  onConnect(connection: Connection) {
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message),
    );
  }

  saveMessage(message: ChatMessage) {
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return message;
        }
        return m;
      });
    } else {
      this.messages.push(message);
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, room, user, role, content) VALUES ('${
        message.id
      }', '${this.room}', '${message.user}', '${message.role}', ${JSON.stringify(
        message.content,
      )}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
        message.content,
      )}`,
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
    const parsed = JSON.parse(message as string) as Message;
    // ====== 全局管理命令 ======
    if ((parsed as any).type === "admin-global") {
      const adminMessage = parsed as any;
      switch (adminMessage.action) {
        case "getStats":
          connection.send(JSON.stringify({
            type: "stats",
            data: this.getAllMessageStats()
          }));
          break;
        case "delete":
          this.deleteMessageGlobal(adminMessage.messageId);
          connection.send(JSON.stringify({ type: "ok" }));
          break;
        case "clear":
          this.clearAllMessagesGlobal();
          connection.send(JSON.stringify({ type: "ok" }));
          break;
        case "deleteUser":
          this.deleteUserMessagesGlobal(adminMessage.user);
          connection.send(JSON.stringify({ type: "ok" }));
          break;
      }
      return;
    }
    // ====== 普通管理命令 ======
    if (parsed.type === "admin") {
      const adminMessage = parsed as any;
      switch (adminMessage.action) {
        case "delete":
          this.deleteMessage(adminMessage.messageId);
          break;
        case "clear":
          this.clearAllMessages();
          break;
        case "deleteUser":
          this.deleteUserMessages(adminMessage.user);
          break;
        case "getStats":
          connection.send(JSON.stringify({
            type: "stats",
            data: this.getMessageStats()
          }));
          break;
      }
      return;
    }
    // 处理普通消息
    if (parsed.type === "add" || parsed.type === "update") {
      this.saveMessage(parsed);
    }
    // 广播消息给其他用户
    this.broadcast(message);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
