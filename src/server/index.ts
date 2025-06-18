import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onStart() {
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    );

    // load the messages from the database
    this.messages = this.ctx.storage.sql
      .exec(`SELECT * FROM messages ORDER BY timestamp ASC`)
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
      `INSERT INTO messages (id, user, role, content) VALUES ('${
        message.id
      }', '${message.user}', '${message.role}', ${JSON.stringify(
        message.content,
      )}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
        message.content,
      )}`,
    );
  }

  // 删除单条消息
  deleteMessage(messageId: string) {
    this.messages = this.messages.filter((m) => m.id !== messageId);
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id = '${messageId}'`);
    
    // 广播删除消息给所有客户端
    this.broadcastMessage({
      type: "delete",
      id: messageId,
    } as any);
  }

  // 清空所有消息
  clearAllMessages() {
    this.messages = [];
    this.ctx.storage.sql.exec(`DELETE FROM messages`);
    
    // 广播清空消息给所有客户端
    this.broadcastMessage({
      type: "clear",
    } as any);
  }

  // 获取消息统计
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
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE user = '${user}'`);
    
    return deletedCount;
  }

  onMessage(connection: Connection, message: WSMessage) {
    const parsed = JSON.parse(message as string) as Message;
    
    // 处理管理命令
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
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
