import React from "react";
import { useApp } from "../context/AppContext";
import { TopBar } from "../components/TopBar";
import { Slider } from "../components/ui/slider";
import { toast } from "sonner";

const SliderRow = ({ label, value, onChange, hint, testId, min = 0, max = 100 }) => (
  <div className="mb-7" data-testid={`slider-${testId}`}>
    <div className="flex items-baseline justify-between mb-1">
      <div className="label-eyebrow">{label}</div>
      <div className="font-display text-xl text-[#C6A45C] tabular-nums">{value}</div>
    </div>
    <Slider
      value={[value]}
      min={min}
      max={max}
      step={1}
      onValueChange={([v]) => onChange(v)}
      className="my-3"
    />
    {hint && <div className="text-xs text-[#71717A] leading-relaxed">{hint}</div>}
  </div>
);

export default function Settings() {
  const { settings, setSettings } = useApp();
  const update = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  return (
    <div className="min-h-screen app-bg pb-24">
      <TopBar title="Style controls" subtitle="Tune the voice" />
      <div className="max-w-xl mx-auto px-4 py-6 relative z-10">
        <p className="text-sm text-[#A1A1AA] mb-7 leading-relaxed">
          These shape how every character responds. Higher values = warmer, looser, more emotionally charged.
        </p>

        <SliderRow
          label="Creativity"
          testId="creativity"
          value={settings.creativity}
          onChange={(v) => update("creativity", v)}
          hint="Lower = grounded and predictable. Higher = surprising, lyrical, willing to take risks."
        />
        <SliderRow
          label="Romanticism"
          testId="romanticism"
          value={settings.romanticism}
          onChange={(v) => update("romanticism", v)}
          hint="Lower = focus on plot and tension. Higher = intimacy, longing, sensory detail."
        />
        <SliderRow
          label="Emotional intensity"
          testId="emotionalIntensity"
          value={settings.emotionalIntensity}
          onChange={(v) => update("emotionalIntensity", v)}
          hint="Lower = restrained, subtext-driven. Higher = let the feelings run hot."
        />

        <div className="border-t border-white/[0.06] pt-6 mt-2">
          <div className="label-eyebrow mb-4">Advanced</div>
          <SliderRow
            label="Max tokens / reply"
            testId="maxTokens"
            value={settings.maxTokens}
            onChange={(v) => update("maxTokens", v)}
            min={120} max={800}
            hint="How long replies can get. Lower = cheaper + snappier. 350–450 is a sweet spot."
          />
          <SliderRow
            label="Recent history kept raw"
            testId="shortHistory"
            value={settings.shortHistory}
            onChange={(v) => update("shortHistory", v)}
            min={4} max={16}
            hint="Older messages are compressed into a summary to save tokens."
          />
        </div>

        <button
          data-testid="reset-settings-button"
          onClick={() => { setSettings({ creativity: 60, romanticism: 40, emotionalIntensity: 55, maxTokens: 420, shortHistory: 8, summarizeEvery: 12, extractMemoryEvery: 6 }); toast.success("Reset to defaults"); }}
          className="text-xs text-[#71717A] hover:text-[#C6A45C] transition-colors mt-2"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
