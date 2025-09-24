export type ChatMessage = {
  id: string;
  content: string;
  user: string;
  role: "user" | "assistant";
  timestamp?: string;
  messageType?: "text" | "image" | "audio" | "video" | "file";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  thumbnailUrl?: string; // 用于视频缩略图
  duration?: number; // 用于音频/视频时长（秒）
};

export type OnlineUser = {
  address: string;
  joinTime: number;
  lastActivity: number;
};

export type RoomStats = {
  totalMessages: number;
  uniqueUsers: number;
  onlineUsers: number;
  totalVisitors: number;
  userMessageCounts: Record<string, number>;
  onlineUsersList: OnlineUser[];
};

export type Message =
  | {
      type: "add";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
      timestamp?: string;
      messageType?: "text" | "image" | "audio" | "video" | "file";
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      fileMimeType?: string;
      thumbnailUrl?: string;
      duration?: number;
    }
  | {
      type: "update";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
      timestamp?: string;
      messageType?: "text" | "image" | "audio" | "video" | "file";
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      fileMimeType?: string;
      thumbnailUrl?: string;
      duration?: number;
    }
  | {
      type: "all";
      messages: ChatMessage[];
    }
  | {
      type: "delete";
      id: string;
    }
  | {
      type: "clear";
    }
  | {
      type: "admin";
      action: "delete" | "clear" | "deleteUser" | "getStats";
      messageId?: string;
      user?: string;
    }
  | {
      type: "stats";
      data: {
        totalMessages: number;
        uniqueUsers: number;
        userMessageCounts: Record<string, number>;
        messages: ChatMessage[];
      };
    }
  | {
      type: "userJoin";
      user: string;
    }
  | {
      type: "userLeave";
      user: string;
    }
  | {
      type: "roomStats";
      stats: RoomStats;
    }
  | {
      type: "heartbeat";
      user: string;
    };

export const names = [
  "Alice",
  "Bob",
  "Charlie",
  "David",
  "Eve",
  "Frank",
  "Grace",
  "Heidi",
  "Ivan",
  "Judy",
  "Kevin",
  "Linda",
  "Mallory",
  "Nancy",
  "Oscar",
  "Peggy",
  "Quentin",
  "Randy",
  "Steve",
  "Trent",
  "Ursula",
  "Victor",
  "Walter",
  "Xavier",
  "Yvonne",
  "Zoe",
];
