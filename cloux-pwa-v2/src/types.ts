export type User = { id: string; name: string; handle: string; avatarColor: string; password: string; status: "online" | "idle" | "dnd" | "offline"; about: string };
export type Server = { id: string; name: string; iconColor: string; ownerId: string; memberIds: string[] };
export type Channel = { id: string; serverId: string; name: string; topic: string; kind: "text" };
export type DM = { id: string; memberIds: string[] };
export type Reaction = { emoji: string; userIds: string[] };
export type Message = { id: string; channelId: string; authorId: string; text: string; createdAt: number; editedAt?: number; replyToId?: string; reactions: Reaction[]; attachmentName?: string };
export type AppData = { users: User[]; servers: Server[]; channels: Channel[]; dms: DM[]; messages: Message[]; currentUserId: string | null; lastReadAt: Record<string, number> };
