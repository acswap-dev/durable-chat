export type ChatMessage = {
  id: string;
  content: string;
  user: string;
  role: "user" | "assistant";
};

export type Message =
  | {
      type: "add";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
    }
  | {
      type: "update";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
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
