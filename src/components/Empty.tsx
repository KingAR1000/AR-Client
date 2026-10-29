import { Box, Plus } from "lucide-react";

export default function Empty({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Box size={28} />
      </div>
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
