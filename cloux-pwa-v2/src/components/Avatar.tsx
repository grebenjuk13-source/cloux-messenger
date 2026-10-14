import type { User } from "../types";
export default function Avatar({ user, size = "md", onClick }: { user?: User; size?: "sm" | "md" | "lg"; onClick?: () => void }) {
  const name = user?.name ?? "?";
  return <button type="button" onClick={onClick} className={`avatar avatar-${size}`} style={{ background: user?.avatarColor ?? "#777" }} aria-label={name}>{name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase()}</button>;
}
