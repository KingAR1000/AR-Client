import React, { useEffect, useRef, useState } from "react";

import {
  Home,
  Play,
  Layers,
  Box,
  Image,
  Package,
  UserRound,
  Users,
  Download,
  Settings,
  ChevronRight,
  Plus,
  ArrowUpRight,
  Search,
  Folder,
  Trash2,
  Copy,
  RefreshCw,
  X,
  Check,
  SlidersHorizontal,
  Move,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Terminal,
  ChevronDown,
} from "lucide-react";

import {
  request,
  desktop,
  message,
  fileData,
  loaderChoices,
  type Profile,
  type LauncherState,
  type Content,
} from "../api";

import type { Page, Run, Widget } from "../api";
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
