import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";

const inputClass =
  "w-full bg-[#0a0a0a] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-[#EDEDED] placeholder:text-[#71717A] focus:outline-none focus:border-[#C6A45C]/60 transition-all";

export const SceneSheet = ({ open, onOpenChange, scene, onChange }) => {
  const set = (k) => (e) => onChange({ ...scene, [k]: e.target.value });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[#0a0a0a] border-t border-white/[0.08] text-[#EDEDED] max-h-[85vh] overflow-y-auto scroll-thin">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl text-[#EDEDED]">Scene</SheetTitle>
          <SheetDescription className="text-[#A1A1AA] text-sm">
            Set the stage. These details feed the AI on every turn.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          <div>
            <div className="label-eyebrow mb-2">Current scene</div>
            <textarea
              data-testid="scene-current-input"
              className={`${inputClass} min-h-[70px] resize-y`}
              value={scene?.current || ""}
              onChange={set("current")}
              placeholder="e.g. The night after the heist. Both of you wounded, hiding."
            />
          </div>
          <div>
            <div className="label-eyebrow mb-2">Location</div>
            <input data-testid="scene-location-edit" className={inputClass} value={scene?.location || ""} onChange={set("location")} />
          </div>
          <div>
            <div className="label-eyebrow mb-2">Atmosphere</div>
            <input data-testid="scene-atmosphere-edit" className={inputClass} value={scene?.atmosphere || ""} onChange={set("atmosphere")} />
          </div>
          <div>
            <div className="label-eyebrow mb-2">Character's current emotion</div>
            <input data-testid="scene-emotion-edit" className={inputClass} value={scene?.characterEmotion || ""} onChange={set("characterEmotion")} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
