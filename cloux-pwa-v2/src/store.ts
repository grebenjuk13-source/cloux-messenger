import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { AppData, Channel, DM, Message, Reaction, Server, User } from "./types";

const KEY = "cloux.v1";
const uid = () => crypto.randomUUID();
const demoUsers: User[] = [
  { id: "user-marko", name: "Марко", handle: "marko", avatarColor: "#8eabb8", password: "cloux", status: "online", about: "Створюю затишний простір для друзів." },
  { id: "user-sofia", name: "Софія", handle: "sofia", avatarColor: "#bd9d91", password: "cloux", status: "idle", about: "Люблю ідеї, книги та довгі розмови." },
  { id: "user-lev", name: "Лев", handle: "lev", avatarColor: "#a1ae94", password: "cloux", status: "dnd", about: "На зв’язку трохи пізніше." },
];
const demoServers: Server[] = [
  { id: "server-workshop", name: "Майстерня", iconColor: "#a7bbc0", ownerId: "user-marko", memberIds: ["user-marko", "user-sofia", "user-lev"] },
  { id: "server-night", name: "Нічна зміна", iconColor: "#b4a58f", ownerId: "user-lev", memberIds: ["user-marko", "user-lev"] },
];
const demoChannels: Channel[] = [
  { id: "channel-general", serverId: "server-workshop", name: "загальне", topic: "Знайомимось, ділимося новинами й просто балакаємо." , kind: "text" },
  { id: "channel-ideas", serverId: "server-workshop", name: "ідеї", topic: "Місце для задумів, начерків і натхнення.", kind: "text" },
  { id: "channel-offtopic", serverId: "server-workshop", name: "поза-темою", topic: "Усе цікаве, що не вкладається в інші канали.", kind: "text" },
  { id: "channel-shift", serverId: "server-night", name: "чергування", topic: "Нотатки нічної зміни.", kind: "text" },
  { id: "channel-links", serverId: "server-night", name: "посилання", topic: "Корисне з інтернету.", kind: "text" },
];
const fixedMessages = (channelId: string, rows: [string, string, number][]): Message[] => rows.map(([authorId, text, offset], i) => ({ id: `demo-${channelId}-${i}`, channelId, authorId, text, createdAt: Date.now() - offset, reactions: [] }));
const seed = (): AppData => ({
  users: demoUsers, servers: demoServers, channels: demoChannels,
  dms: [{ id: "dm-marko-sofia", memberIds: ["user-marko", "user-sofia"] }], currentUserId: null, lastReadAt: {},
  messages: [
    ...fixedMessages("channel-general", [["user-marko", "Ласкаво просимо до Майстерні! Тут збираємося, щоб вигадувати й творити.", 86_400_000], ["user-sofia", "Дякую за запрошення. Уже маю кілька ідей ✨", 80_000_000], ["user-lev", "Привіт усім! Радію бути тут.", 70_000_000], ["user-marko", "Почнімо з малого: що хочемо зробити цього тижня?", 60_000_000], ["user-sofia", "Можемо зібрати невеличкий список проєктів.", 50_000_000], ["user-lev", "Я за! Додам свої пропозиції в #ідеї.", 40_000_000], ["user-marko", "Чудово, а посилання на нотатки залишу трохи згодом.", 30_000_000], ["user-sofia", "Домовились. Гарного всім дня!", 20_000_000]]),
    ...fixedMessages("channel-ideas", [["user-sofia", "Ідея: зробити спільну добірку маленьких проєктів.", 8_000_000], ["user-lev", "Можна додати прості ескізи й короткий опис.", 7_000_000]]),
    ...fixedMessages("channel-shift", [["user-lev", "Зміна почалась. Усе спокійно.", 3_000_000]]),
    ...fixedMessages("dm-marko-sofia", [["user-marko", "Привіт! Як тобі новий простір?", 6_000_000], ["user-sofia", "Дуже затишно. Вже хочеться запросити друзів.", 5_000_000], ["user-marko", "Чудово! Можемо зібрати ідеї в Майстерні.", 4_000_000], ["user-sofia", "Я саме туди йду 🙂", 3_000_000]]),
  ],
});

function isData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<AppData>;
  return Array.isArray(v.users) && Array.isArray(v.servers) && Array.isArray(v.channels) && Array.isArray(v.dms) && Array.isArray(v.messages) && !!v.lastReadAt && typeof v.lastReadAt === "object";
}
function read(): AppData {
  try { const raw = localStorage.getItem(KEY); if (raw) { const parsed: unknown = JSON.parse(raw); if (isData(parsed)) return parsed; } }
  catch { /* Restore the demo if storage is malformed or unavailable. */ }
  return seed();
}
let state = read();
const listeners = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Keep the session usable if browser storage is full. */ } listeners.forEach(fn => fn()); }
const DataContext = createContext<AppData | null>(null);
export function AppDataProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => state);
  return createElement(DataContext.Provider, { value }, children);
}
export function useAppData<T>(selector: (data: AppData) => T): T {
  const value = useContext(DataContext);
  if (!value) throw new Error("useAppData має викликатися всередині AppDataProvider");
  return selector(value);
}
export const snapshot = () => state;
export const getUser = (id: string) => state.users.find(u => u.id === id);
export const newId = uid;
export function setCurrentUser(id: string | null) { state = { ...state, currentUserId: id }; persist(); }
export function login(handle: string, password: string): boolean { const user = state.users.find(u => u.handle.toLowerCase() === handle.trim().replace(/^@/, "").toLowerCase() && u.password === password); if (!user) return false; state = { ...state, users: state.users.map(u => u.id === user.id ? { ...u, status: "online" } : u), currentUserId: user.id }; persist(); return true; }
export function signup(name: string, password: string): User | null {
  const clean = name.trim().replace(/\s+/g, " "); if (clean.length < 2 || password.length < 4) return null;
  const base = clean.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") || "friend";
  let handle = base, suffix = 2; while (state.users.some(u => u.handle === handle)) handle = `${base}${suffix++}`;
  const user: User = { id: uid(), name: clean.slice(0, 32), handle, avatarColor: ["#a8b7c2", "#b4a38f", "#a7b19a", "#b29da8"][state.users.length % 4]!, password, status: "online", about: "Щойно приєднався до Cloux." };
  state = { ...state, users: [...state.users, user], currentUserId: user.id }; persist(); return user;
}
export function createServer(name: string, userId: string): string { const id = uid(); const server: Server = { id, name: name.trim().slice(0, 36) || "Новий сервер", iconColor: "#aebbc1", ownerId: userId, memberIds: [userId] }; const channel: Channel = { id: uid(), serverId: id, name: "загальне", topic: "Ласкаво просимо до вашого простору.", kind: "text" }; state = { ...state, servers: [...state.servers, server], channels: [...state.channels, channel] }; persist(); return id; }
export function createChannel(serverId: string, name: string, topic: string): string | null { const server = state.servers.find(s => s.id === serverId); if (!server || server.ownerId !== state.currentUserId) return null; const channel: Channel = { id: uid(), serverId, name: name.trim().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 40) || "новий-канал", topic: topic.trim().slice(0, 140), kind: "text" }; state = { ...state, channels: [...state.channels, channel] }; persist(); return channel.id; }
export function leaveServer(serverId: string, userId: string) { state = { ...state, servers: state.servers.map(s => s.id === serverId ? { ...s, memberIds: s.memberIds.filter(id => id !== userId) } : s) }; persist(); }
export function deleteServer(serverId: string) { if (state.servers.find(s => s.id === serverId)?.ownerId !== state.currentUserId) return; const channelIds = state.channels.filter(c => c.serverId === serverId).map(c => c.id); state = { ...state, servers: state.servers.filter(s => s.id !== serverId), channels: state.channels.filter(c => c.serverId !== serverId), messages: state.messages.filter(m => !channelIds.includes(m.channelId)), lastReadAt: Object.fromEntries(Object.entries(state.lastReadAt).filter(([key]) => !channelIds.some(id => key.endsWith(`:${id}`)))) }; persist(); }
export function createDM(first: string, second: string): string | null { const ids = [first, second].sort(); const existing = state.dms.find(d => d.memberIds.length === 2 && [...d.memberIds].sort().join("|") === ids.join("|")); if (existing) return existing.id; const dm: DM = { id: uid(), memberIds: ids }; state = { ...state, dms: [...state.dms, dm] }; persist(); return dm.id; }
export function sendMessage(channelId: string, authorId: string, text: string, replyToId?: string, attachmentName?: string) { const message: Message = { id: uid(), channelId, authorId, text, createdAt: Date.now(), reactions: [], ...(replyToId ? { replyToId } : {}), ...(attachmentName ? { attachmentName } : {}) }; state = { ...state, messages: [...state.messages, message] }; persist(); markRead(channelId, authorId); }
export function markRead(channelId: string, userId: string) { const key = `${userId}:${channelId}`; state = { ...state, lastReadAt: { ...state.lastReadAt, [key]: Date.now() } }; persist(); }
export function editMessage(id: string, userId: string, text: string) { state = { ...state, messages: state.messages.map(m => m.id === id && m.authorId === userId ? { ...m, text, editedAt: Date.now() } : m) }; persist(); }
export function removeMessage(id: string, userId: string) { state = { ...state, messages: state.messages.filter(m => !(m.id === id && m.authorId === userId)) }; persist(); }
export function toggleReaction(id: string, userId: string, emoji: string) { state = { ...state, messages: state.messages.map(m => { if (m.id !== id) return m; const found = m.reactions.find(r => r.emoji === emoji); let reactions: Reaction[]; if (!found) reactions = [...m.reactions, { emoji, userIds: [userId] }]; else if (found.userIds.includes(userId)) reactions = m.reactions.map(r => r.emoji === emoji ? { ...r, userIds: r.userIds.filter(x => x !== userId) } : r).filter(r => r.userIds.length); else reactions = m.reactions.map(r => r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r); return { ...m, reactions }; }) }; persist(); }
export function updateUser(id: string, changes: Partial<Pick<User, "about" | "status">>) { state = { ...state, users: state.users.map(u => u.id === id ? { ...u, ...changes } : u) }; persist(); }
export function resetDemo() { localStorage.removeItem(KEY); state = seed(); window.location.hash = ""; window.location.reload(); }
