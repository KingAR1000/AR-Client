import type { ReactNode } from "react";
import { Box, Plus } from "lucide-react";

export default function Empty({
  title,
  text,
  action,
  onClick,
  icon,
}: {
  title: string;
  text: string;
  action?: string;
  onClick?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon || <Box size={26} />}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="primary" onClick={onClick}>
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
