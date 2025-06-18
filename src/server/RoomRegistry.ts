export class RoomRegistry {
  ctx: DurableObjectState;
  constructor(ctx: DurableObjectState, env: any) {
    this.ctx = ctx;
  }

  async addRoom(roomId: string) {
    const rooms = (await this.ctx.storage.get("rooms")) as string[] || [];
    if (!rooms.includes(roomId)) {
      rooms.push(roomId);
      await this.ctx.storage.put("rooms", rooms);
    }
  }

  async hasRoom(roomId: string) {
    const rooms = (await this.ctx.storage.get("rooms")) as string[] || [];
    return rooms.includes(roomId);
  }

  async listRooms() {
    return ((await this.ctx.storage.get("rooms")) as string[]) || [];
  }

  // HTTP API 入口
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/add") {
      const { roomId } = await request.json() as any;
      await this.addRoom(roomId);
      return new Response(JSON.stringify({ success: true }));
    }
    if (url.pathname === "/has") {
      const { roomId } = await request.json() as any;
      const exists = await this.hasRoom(roomId);
      return new Response(JSON.stringify({ exists }));
    }
    if (url.pathname === "/list") {
      const rooms = await this.listRooms();
      return new Response(JSON.stringify({ rooms }));
    }
    return new Response("Not found", { status: 404 });
  }
}

export default RoomRegistry; 