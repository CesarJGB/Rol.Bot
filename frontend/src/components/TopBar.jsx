import React from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const TopBar = ({ title, subtitle, onBack, right, sticky = true }) => {
  const navigate = useNavigate();
  return (
    <header
      data-testid="top-bar"
      className={`${sticky ? "sticky top-0 z-30" : ""} safe-top backdrop-blur-xl bg-[#050505]/80 border-b border-white/[0.06]`}
    >
      <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
        {onBack !== false && (
          <button
            data-testid="top-bar-back"
            onClick={() => (onBack ? onBack() : navigate(-1))}
            className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/5 border border-white/[0.06] text-[#EDEDED] transition-all"
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {subtitle && <div className="label-eyebrow text-[#71717A] truncate">{subtitle}</div>}
          <div className="font-display text-xl text-[#EDEDED] truncate leading-tight">{title}</div>
        </div>
        {right}
      </div>
    </header>
  );
};
