import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowDown, ArrowLeft, Check, CircleHelp, FilePlus2, Hash, LogOut, MessageCircle, MoreHorizontal, Plus, Search, Send, Settings2, Trash2, Users, X } from "lucide-react";
import Avatar from "./components/Avatar";
import { createChannel, createDM, createServer, deleteServer, editMessage, getUser, leaveServer, login, markRead, removeMessage, resetDemo, sendMessage, setCurrentUser, signup, snapshot, toggleReaction, updateUser, useAppData } from "./store";
import type { User } from "./types";

type ModalMode = "server" | "channel" | "dm" | "settings" | "profile" | null;
const emojis = ["❤️", "👍", "😂", "✨", "👀", "🎉", "🔥", "🙏"];
const timeLabel = (stamp: number) => new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(stamp);
function LinkText({ text }: { text: string }) {
  const chunks = text.split(/(https?:\/\/[^\s<>]+)/g);
  return <>{chunks.map((chunk, i) => /^https?:\/\//.test(chunk) ? <a key={i} href={chunk} target="_blank" rel="noreferrer">{chunk}</a> : chunk)}</>;
}
function StatusDot({ status }: { status: User["status"] }) { return <span className={`status-dot status-${status}`} title={status} />; }

export default function App() {
  const data = useAppData(d => d);
  const me = data.users.find(u => u.id === data.currentUserId);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [modalText, setModalText] = useState("");
  const [modalExtra, setModalExtra] = useState("");
  const [newDmId, setNewDmId] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [mobilePane, setMobilePane] = useState<"rooms" | "chat">("rooms");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authHandle, setAuthHandle] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileUser, setProfileUser] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);

  const servers = useMemo(() => data.servers.filter(s => !!me && s.memberIds.includes(me.id)), [data.servers, me]);
  const activeServer = servers.find(s => s.id === activeServerId) ?? null;
  const activeChannel = data.channels.find(c => c.id === activeRoomId) ?? null;
  const activeDM = data.dms.find(d => d.id === activeRoomId) ?? null;
  const isHome = !activeServerId;
  const roomTitle = activeChannel ? `# ${activeChannel.name}` : activeDM ? (data.users.find(u => u.id === activeDM.memberIds.find(id => id !== me?.id))?.name ?? "Діалог") : "Обери розмову";
  const roomTopic = activeChannel?.topic ?? (activeDM ? "Особистий діалог між вами" : "Твій простір для розмов");
  const members = activeServer ? activeServer.memberIds.map(id => data.users.find(u => u.id === id)).filter((u): u is User => !!u) : activeDM ? activeDM.memberIds.map(id => data.users.find(u => u.id === id)).filter((u): u is User => !!u) : [];
  const messages = useMemo(() => data.messages.filter(m => m.channelId === activeRoomId).filter(m => !search.trim() || m.text.toLowerCase().includes(search.toLowerCase())), [data.messages, activeRoomId, search]);

  useEffect(() => {
    if (!activeRoomId || !me) return;
    markRead(activeRoomId, me.id);
  }, [activeRoomId, me?.id]);
  useEffect(() => { if (feedRef.current && !search) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [messages.length, activeRoomId]);
  useEffect(() => {
    const onHash = () => {
      const match = window.location.hash.match(/^#\/server\/([^/]+)\/([^/]+)/);
      if (match) { setActiveServerId(match[1]!); setActiveRoomId(match[2]!); }
      else if (window.location.hash.startsWith("#/dm/")) { setActiveServerId(null); setActiveRoomId(window.location.hash.slice(5)); }
      else if (window.location.hash === "#/home") { setActiveServerId(null); setActiveRoomId(null); }
    };
    window.addEventListener("hashchange", onHash); onHash(); return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!me || activeRoomId) return;
    const firstServer = data.servers.find(s => s.memberIds.includes(me.id));
    const firstChannel = firstServer && data.channels.find(c => c.serverId === firstServer.id);
    if (firstChannel && !window.location.hash) { setActiveServerId(firstServer.id); setActiveRoomId(firstChannel.id); }
  }, [me?.id, activeRoomId]);
  const goRoom = (id: string | null, serverId: string | null = null) => {
    setActiveRoomId(id); setActiveServerId(serverId); setSearch(""); setReplyTo(undefined); setMobilePane("chat");
    window.location.hash = id && serverId ? `/server/${serverId}/${id}` : id ? `/dm/${id}` : "/home";
  };
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(""), 2600); };
  const openModal = (mode: ModalMode) => { setModal(mode); setModalText(mode === "profile" ? me?.about ?? "" : ""); setModalExtra(mode === "profile" ? me?.status ?? "" : ""); setNewDmId(""); };
  const unread = (roomId: string) => {
    if (!me) return 0;
    const seen = data.lastReadAt[`${me.id}:${roomId}`] ?? 0;
    return data.messages.filter(m => m.channelId === roomId && m.authorId !== me.id && m.createdAt > seen).length;
  };
  const commitModal = () => {
    if (!me) return;
    if (modal === "server") { const id = createServer(modalText || "Мій сервер", me.id); setActiveServerId(id); const channel = snapshot().channels.find(c => c.serverId === id); goRoom(channel?.id ?? null, id); }
    if (modal === "channel" && activeServer) { const id = createChannel(activeServer.id, modalText, modalExtra); if (id) goRoom(id, activeServer.id); }
    if (modal === "dm" && newDmId) { const id = createDM(me.id, newDmId); if (id) goRoom(id, null); }
    if (modal === "settings" && activeServer) {
      if (modalText === "delete") { if (window.confirm(`Видалити сервер «${activeServer.name}» і всі його повідомлення?`)) { deleteServer(activeServer.id); goRoom(null, null); } }
      if (modalText === "leave") { leaveServer(activeServer.id, me.id); goRoom(null, null); }
    }
    if (modal === "profile") { updateUser(me.id, { about: modalText.slice(0, 140), status: (modalExtra || me.status) as User["status"] }); showNotice("Профіль оновлено"); }
    setModal(null);
  };
  const submit = () => {
    if (!me || !activeRoomId) return;
    const value = draft.trim(); if (!value) return;
    if (value.length > 2000) { showNotice("Повідомлення має бути до 2000 символів"); return; }
    sendMessage(activeRoomId, me.id, value, replyTo); setDraft(""); setReplyTo(undefined); setTyping(false);
  };
  const onDraft = (value: string) => { setDraft(value.slice(0, 2000)); setTyping(!!value.trim()); window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => setTyping(false), 1500); };
  const handleAuth = (event: FormEvent) => {
    event.preventDefault(); setAuthError("");
    if (authMode === "login") { if (!login(authHandle, authPassword)) { setAuthError("Не знайшов такий акаунт або пароль."); return; } }
    else { const user = signup(authHandle, authPassword); if (!user) { setAuthError("Ім’я має бути від 2 символів, пароль — від 4."); return; } }
    setAuthPassword("");
  };
  const logInDemo = (handle: string) => { login(handle, "cloux"); setAuthError(""); };
  const memberOfDM = data.dms.filter(d => !!me && d.memberIds.includes(me.id));
  const textRooms = activeServer ? data.channels.filter(c => c.serverId === activeServer.id) : [];

  if (!me) return <main className="auth-screen"><div className="auth-card"><div className="brand-mark"><img src="/cloux.svg" alt="" /></div><p className="eyebrow">ПРИВАТНИЙ ПРОСТІР ДЛЯ СПІЛЬНОТ</p><h1>Зустрінемось у <span>Cloux</span></h1><p className="muted auth-copy">Створи локальний акаунт або зайди в демо, щоб побачити, як усе працює.</p>
    <div className="auth-tabs"><button className={authMode === "login" ? "selected" : ""} onClick={() => setAuthMode("login")}>Увійти</button><button className={authMode === "signup" ? "selected" : ""} onClick={() => setAuthMode("signup")}>Створити акаунт</button></div>
    <form onSubmit={handleAuth}><label>{authMode === "login" ? "Нікнейм" : "Твоє ім’я"}<input required minLength={2} autoComplete="username" value={authHandle} onChange={e => setAuthHandle(e.target.value)} placeholder={authMode === "login" ? "наприклад, marko" : "Як до тебе звертатися?"}/></label><label>Пароль<input required minLength={4} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Щонайменше 4 символи"/></label>{authError && <p className="form-error">{authError}</p>}<button className="primary full" type="submit">{authMode === "login" ? "Увійти" : "Створити акаунт"}<ArrowDown size={16}/></button></form>
    <div className="demo-box"><div className="demo-title"><span>Спробувати демо</span><span className="demo-password">пароль: cloux</span></div><div className="demo-users">{["marko", "sofia", "lev"].map(handle => { const user = data.users.find(u => u.handle === handle); return user && <button key={handle} onClick={() => logInDemo(handle)}><Avatar user={user} size="sm"/><span>{user.name}</span><span className="handle">@{handle}</span><ArrowLeft size={14}/></button>; })}</div></div>
    <p className="security-note"><CircleHelp size={15}/> Демо-версія: паролі зберігаються у localStorage. Це не справжній захищений акаунт; дані доступні лише в цьому браузері.</p><button className="reset-link" onClick={resetDemo}>Скинути демо</button></div></main>;

  return <main className="app-shell">
    <aside className="server-rail"><button className={`rail-logo ${isHome ? "active" : ""}`} title="Особисті діалоги" onClick={() => goRoom(null, null)}><img src="/cloux.svg" alt="Cloux"/></button><div className="rail-divider"/><div className="server-list">{servers.map(server => <button key={server.id} title={server.name} onClick={() => { const channel = data.channels.find(c => c.serverId === server.id); goRoom(channel?.id ?? null, server.id); }} className={`server-icon ${activeServerId === server.id ? "active" : ""}`} style={{ "--server-color": server.iconColor } as CSSProperties}>{server.name.slice(0, 2).toUpperCase()}</button>)}</div><button className="rail-add" title="Створити сервер" onClick={() => openModal("server")}><Plus size={20}/></button><div className="rail-spacer"/><button className="rail-help" title="Скинути демо" onClick={resetDemo}><CircleHelp size={18}/></button><button className="rail-user" title="Профіль" onClick={() => openModal("profile")}><Avatar user={me} size="sm"/><StatusDot status={me.status}/></button></aside>
    <aside className={`room-sidebar ${mobilePane === "chat" ? "mobile-hidden" : ""}`}>
      <header className="sidebar-head"><div className="sidebar-heading"><div><span className="eyebrow">{isHome ? "ТВОЄ КОЛО" : "СПІЛЬНОТА"}</span><h2>{activeServer?.name ?? "Діалоги"}</h2></div>{activeServer && <button className="icon-button" aria-label="Параметри сервера" onClick={() => openModal("settings")}><MoreHorizontal size={20}/></button>}</div>{isHome ? <button className="wide-action" onClick={() => openModal("dm")}><Plus size={16}/> Новий діалог</button> : <div className="sidebar-label"><span>ТЕКСТОВІ КАНАЛИ</span>{activeServer?.ownerId === me.id && <button className="tiny-add" title="Створити канал" onClick={() => openModal("channel")}><Plus size={16}/></button>}</div>}</header>
      <div className="room-list">{isHome ? <>{memberOfDM.length === 0 && <div className="empty-sidebar">Тут з’являться твої діалоги з іншими локальними користувачами.</div>}{memberOfDM.map(dm => { const other = data.users.find(u => u.id === dm.memberIds.find(id => id !== me.id)); if (!other) return null; const count = unread(dm.id); return <button key={dm.id} className={`room-row ${activeRoomId === dm.id ? "selected" : ""}`} onClick={() => goRoom(dm.id)}><Avatar user={other} size="md"/><span className="room-meta"><strong>{other.name}</strong><small>@{other.handle}</small></span>{count > 0 && <span className="unread">{count}</span>}</button>; })}</> : <>{textRooms.map(channel => { const count = unread(channel.id); return <button key={channel.id} className={`channel-row ${activeRoomId === channel.id ? "selected" : ""}`} onClick={() => goRoom(channel.id, activeServer?.id ?? null)}><Hash size={17}/><span>{channel.name}</span>{count > 0 && <span className="unread">{count}</span>}</button>; })}<div className="server-card"><div className="server-card-icon" style={{ background: activeServer?.iconColor }}>✳</div><div><strong>{activeServer?.memberIds.length ?? 0} учасників</strong><small>Твоя спільнота</small></div><button className="icon-button" title="Учасники" onClick={() => showNotice("Учасників видно у правій колонці") }><Users size={16}/></button></div></>}</div>
      <footer className="account-bar"><Avatar user={me} size="sm" onClick={() => openModal("profile")}/><div className="account-id"><strong>{me.name}</strong><small>@{me.handle}</small></div><button title="Вийти" className="icon-button" onClick={() => { updateUser(me.id, { status: "offline" }); setCurrentUser(null); }}><LogOut size={17}/></button></footer>
    </aside>
    <section className={`chat-panel ${mobilePane === "rooms" ? "mobile-hidden" : ""}`}>
      {activeRoomId ? <><header className="chat-head"><button className="back-mobile icon-button" onClick={() => setMobilePane("rooms")}><ArrowLeft size={19}/></button><div className="room-glyph">{activeChannel ? <Hash size={19}/> : <MessageCircle size={18}/>}</div><div className="chat-title"><strong>{roomTitle}</strong><small>{roomTopic}</small></div><div className="chat-head-actions"><label className="search-field"><Search size={16}/><input placeholder="Шукати в розмові" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch("")}><X size={14}/></button>}</label><button className="icon-button mobile-members" onClick={() => showNotice("Учасники відображаються праворуч") } title="Учасники"><Users size={18}/></button></div></header>
      <div className="topic-banner"><span className="topic-dot"/><span>{roomTopic}</span><button onClick={() => activeServer ? openModal("settings") : setProfileUser(activeDM?.memberIds.find(id => id !== me.id) ?? null)}>Деталі</button></div>
      <div className="message-feed" ref={feedRef}>{messages.length === 0 ? <div className="welcome-room"><div className="welcome-icon">{activeChannel ? <Hash size={28}/> : <MessageCircle size={26}/>}</div><h2>{search ? "Нічого не знайдено" : `Це початок ${roomTitle}`}</h2><p>{search ? "Спробуй інший пошуковий запит." : "Тут поки тихо. Напиши перше повідомлення."}</p></div> : messages.map((message, index) => {
        const author = data.users.find(u => u.id === message.authorId); const prev = messages[index - 1]; const grouped = !!prev && prev.authorId === message.authorId && message.createdAt - prev.createdAt < 300_000; const reply = message.replyToId ? data.messages.find(m => m.id === message.replyToId) : undefined;
        return <article key={message.id} className={`message ${grouped ? "grouped" : ""}`} onMouseEnter={() => setHovered(message.id)} onMouseLeave={() => setHovered(null)}>
          {!grouped && <Avatar user={author} size="md" onClick={() => author && setProfileUser(author.id)}/>}<div className="message-body">{!grouped && <div className="message-meta"><button onClick={() => author && setProfileUser(author.id)}>{author?.name ?? "Невідомий користувач"}</button><time>{timeLabel(message.createdAt)}</time></div>}
          {reply && <button className="reply-quote" onClick={() => feedRef.current?.scrollTo({ top: 0, behavior: "smooth" })}><span>↳ {getUser(reply.authorId)?.name ?? "Повідомлення"}</span><span>{reply.text}</span></button>}
          {editing === message.id ? <div className="edit-row"><textarea value={editDraft} maxLength={2000} onChange={e => setEditDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editMessage(message.id, me.id, editDraft.trim()); setEditing(null); } if (e.key === "Escape") setEditing(null); }}/><button onClick={() => { editMessage(message.id, me.id, editDraft.trim()); setEditing(null); }}><Check size={16}/></button><button onClick={() => setEditing(null)}><X size={16}/></button></div> : <div className="message-text"><LinkText text={message.text}/>{message.attachmentName && <div className="attachment"><FilePlus2 size={17}/><span>{message.attachmentName}</span></div>}</div>}{message.editedAt && <small className="edited-label">змінено</small>}
          {message.reactions.length > 0 && <div className="reactions">{message.reactions.map(reaction => <button key={reaction.emoji} className={reaction.userIds.includes(me.id) ? "reacted" : ""} onClick={() => toggleReaction(message.id, me.id, reaction.emoji)}>{reaction.emoji}<span>{reaction.userIds.length}</span></button>)}</div>}
          {(hovered === message.id) && <div className="message-actions"><button title="Відповісти" onClick={() => { setReplyTo(message.id); document.getElementById("message-input")?.focus(); }}><MessageCircle size={15}/></button><div className="reaction-picker">{emojis.map(emoji => <button key={emoji} title={emoji} onClick={() => toggleReaction(message.id, me.id, emoji)}>{emoji}</button>)}</div>{message.authorId === me.id && <><button title="Редагувати" onClick={() => { setEditing(message.id); setEditDraft(message.text); }}><Settings2 size={14}/></button><button title="Видалити" onClick={() => removeMessage(message.id, me.id)}><Trash2 size={14}/></button></>}</div>}
          </div></article>;
      })}</div>
      {typing && <div className="typing-note"><span className="typing-dots"><i/><i/><i/></span> Ти набираєш повідомлення…</div>}
      <div className="composer-wrap">{replyTo && <div className="replying"><span>Відповідь для <b>{getUser(data.messages.find(m => m.id === replyTo)?.authorId ?? "")?.name ?? "учасника"}</b></span><button onClick={() => setReplyTo(undefined)}><X size={15}/></button></div>}<div className="composer"><button className="attach-button" title="Додати назву файлу" onClick={() => fileRef.current?.click()}><Plus size={20}/></button><input ref={fileRef} type="file" hidden onChange={e => { const file = e.target.files?.[0]; if (file) { sendMessage(activeRoomId, me.id, "", replyTo, file.name); setReplyTo(undefined); showNotice("Надіслано лише назву файлу; вміст не завантажувався."); e.currentTarget.value = ""; } }}/><textarea id="message-input" value={draft} maxLength={2000} placeholder={`Повідомлення: ${roomTitle}`} onChange={e => onDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}/><div className="composer-tools">{draft.length > 1800 && <span className="char-count">{draft.length}/2000</span>}<button className="send-button" disabled={!draft.trim()} onClick={submit} title="Надіслати"><Send size={17}/></button></div></div><div className="composer-foot">Enter — надіслати <span>·</span> Shift+Enter — новий рядок{draft.length > 1800 && <span className="char-count-foot">{draft.length}/2000</span>}</div></div>
      </> : <div className="empty-chat"><div className="empty-illustration"><img src="/cloux.svg" alt="Cloux"/></div><span className="eyebrow">ТВІЙ CLOUX</span><h2>Простір для своїх</h2><p>Обери діалог або канал ліворуч.<br/>Тут з’являться ваші розмови.</p>{isHome ? <button className="primary" onClick={() => openModal("dm")}><Plus size={17}/> Новий діалог</button> : <button className="primary" onClick={() => textRooms[0] && goRoom(textRooms[0].id, activeServer?.id ?? null)}>Відкрити канал <ArrowDown size={16}/></button>}</div>}
    </section>
    {activeRoomId && <aside className="members-panel"><div className="members-title"><span>УЧАСНИКИ</span><span>{members.length}</span></div><div className="members-list">{members.map(user => <button key={user.id} className="member-row" onClick={() => setProfileUser(user.id)}><span className="member-avatar-wrap"><Avatar user={user} size="sm"/><StatusDot status={user.status}/></span><span className="member-name">{user.name}</span>{activeServer?.ownerId === user.id && <span className="owner-badge">Власник</span>}</button>)}</div><div className="member-hint">Клацни на учасника,<br/>щоб переглянути профіль.</div></aside>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal-card"><header><div><span className="eyebrow">{modal === "server" ? "НОВИЙ ПРОСТІР" : modal === "channel" ? "КАНАЛ" : modal === "dm" ? "ДІАЛОГ" : modal === "settings" ? "КЕРУВАННЯ" : "ПРОФІЛЬ"}</span><h2>{modal === "server" ? "Створи сервер" : modal === "channel" ? "Створи канал" : modal === "dm" ? "Новий діалог" : modal === "settings" ? activeServer?.name : "Твій профіль"}</h2></div><button className="icon-button" onClick={() => setModal(null)}><X size={18}/></button></header>
      {modal === "server" && <><label>Назва сервера<input autoFocus maxLength={36} value={modalText} onChange={e => setModalText(e.target.value)} placeholder="Наприклад, Книжковий клуб"/></label><p className="modal-help">Буде створено канал #загальне. Ти станеш власником.</p><button className="primary full" onClick={commitModal}>Створити сервер <Plus size={16}/></button></>}
      {modal === "channel" && <><label>Назва каналу<input autoFocus maxLength={40} value={modalText} onChange={e => setModalText(e.target.value)} placeholder="наприклад, плани"/></label><label>Тема каналу<input maxLength={140} value={modalExtra} onChange={e => setModalExtra(e.target.value)} placeholder="Про що тут спілкуємося?"/></label><button className="primary full" onClick={commitModal}>Створити канал <Plus size={16}/></button></>}
      {modal === "dm" && <><p className="modal-help">Обери іншого користувача, зареєстрованого в цьому браузері.</p><div className="user-choice-list">{data.users.filter(u => u.id !== me.id).map(user => <button key={user.id} className={newDmId === user.id ? "picked" : ""} onClick={() => setNewDmId(user.id)}><Avatar user={user} size="sm"/><span>{user.name}</span><small>@{user.handle}</small>{newDmId === user.id && <Check size={16}/>}</button>)}</div><button className="primary full" disabled={!newDmId} onClick={commitModal}>Відкрити діалог <MessageCircle size={16}/></button></>}
      {modal === "settings" && activeServer && <><div className="setting-info"><div className="server-card-icon" style={{ background: activeServer.iconColor }}>✳</div><div><strong>{activeServer.name}</strong><small>{activeServer.memberIds.length} учасників · власник — {getUser(activeServer.ownerId)?.name}</small></div></div>{activeServer.ownerId === me.id ? <button className="danger-action" onClick={() => { if (window.confirm(`Видалити сервер «${activeServer.name}» і всі його повідомлення?`)) { deleteServer(activeServer.id); goRoom(null, null); setModal(null); } }}><Trash2 size={17}/> Видалити сервер</button> : <button className="danger-action" onClick={() => { leaveServer(activeServer.id, me.id); goRoom(null, null); setModal(null); }}><LogOut size={17}/> Покинути сервер</button>}</>}
      {modal === "profile" && <><div className="profile-modal-head"><Avatar user={me} size="lg"/><div><strong>{me.name}</strong><small>@{me.handle}</small></div></div><label>Про себе<textarea maxLength={140} value={modalText} onChange={e => setModalText(e.target.value)} placeholder="Додай короткий опис"/></label><label>Статус<select value={modalExtra || me.status} onChange={e => setModalExtra(e.target.value)}><option value="online">У мережі</option><option value="idle">Неактивний</option><option value="dnd">Не турбувати</option><option value="offline">Невидимий</option></select></label><button className="primary full" onClick={commitModal}>Зберегти профіль <Check size={16}/></button><button className="reset-link" onClick={resetDemo}>Скинути демо й очистити дані</button></>}
      </section></div>}
    {profileUser && (() => { const user = data.users.find(u => u.id === profileUser); if (!user) return null; return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setProfileUser(null); }}><section className="profile-card"><button className="close-profile icon-button" onClick={() => setProfileUser(null)}><X size={18}/></button><div className="profile-cover"/><Avatar user={user} size="lg"/><div className="profile-identity"><h2>{user.name}</h2><span>@{user.handle}</span></div><div className="profile-status"><StatusDot status={user.status}/>{user.status === "online" ? "У мережі" : user.status === "idle" ? "Неактивний" : user.status === "dnd" ? "Не турбувати" : "Не в мережі"}</div><div className="profile-about"><span>ПРО СЕБЕ</span><p>{user.about || "Поки нічого не розповів."}</p></div>{user.id !== me.id && <button className="primary full" onClick={() => { const id = createDM(me.id, user.id); setProfileUser(null); if (id) goRoom(id); }}>Написати повідомлення <MessageCircle size={16}/></button>}</section></div>; })()}
    {notice && <div className="toast">{notice}</div>}
  </main>;
}
