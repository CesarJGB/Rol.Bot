import React from "react";
import { useApp } from "../context/AppContext";
import { TopBar } from "../components/TopBar";
import { Slider } from "../components/ui/slider";
import { DEFAULT_SETTINGS } from "../lib/constants";
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
      <TopBar title="Estilo y ajustes" subtitle="Afina la voz" />
      <div className="max-w-xl mx-auto px-4 py-6 relative z-10">
        <p className="text-sm text-[#A1A1AA] mb-7 leading-relaxed">
          Estos ajustes moldean cómo responde cada personaje. Valores altos = más cálido, suelto y emocionalmente intenso.
        </p>

        <SliderRow
          label="Creatividad"
          testId="creativity"
          value={settings.creativity}
          onChange={(v) => update("creativity", v)}
          hint="Bajo = aterrizado y predecible. Alto = sorprendente, lírico, dispuesto a tomar riesgos."
        />
        <SliderRow
          label="Romanticismo"
          testId="romanticism"
          value={settings.romanticism}
          onChange={(v) => update("romanticism", v)}
          hint="Bajo = enfoque en trama y tensión. Alto = intimidad, anhelo, detalle sensorial."
        />
        <SliderRow
          label="Intensidad emocional"
          testId="emotionalIntensity"
          value={settings.emotionalIntensity}
          onChange={(v) => update("emotionalIntensity", v)}
          hint="Bajo = contenido, en el subtexto. Alto = deja que las emociones ardan."
        />

        <div className="border-t border-white/[0.06] pt-6 mt-2">
          <div className="label-eyebrow mb-4">Avanzado</div>
          <SliderRow
            label="Tokens máx. por respuesta"
            testId="maxTokens"
            value={settings.maxTokens}
            onChange={(v) => update("maxTokens", v)}
            min={120} max={800}
            hint="Cuánto pueden alargarse las respuestas. Bajo = más barato y ágil. 350–450 es un punto dulce."
          />
          <SliderRow
            label="Historial reciente sin comprimir"
            testId="shortHistory"
            value={settings.shortHistory}
            onChange={(v) => update("shortHistory", v)}
            min={4} max={16}
            hint="Los mensajes más antiguos se comprimen automáticamente en el resumen para ahorrar tokens."
          />
          <SliderRow
            label="Memorias máx. inyectadas por turno"
            testId="maxMemoriesPerTurn"
            value={settings.maxMemoriesPerTurn}
            onChange={(v) => update("maxMemoriesPerTurn", v)}
            min={3} max={20}
            hint="Sólo los recuerdos más relevantes al contexto se inyectan. Los fijados (★) siempre se incluyen."
          />
        </div>

        <button
          data-testid="reset-settings-button"
          onClick={() => { setSettings({ ...DEFAULT_SETTINGS }); toast.success("Valores restaurados"); }}
          className="text-xs text-[#71717A] hover:text-[#C6A45C] transition-colors mt-2"
        >
          Restablecer valores por defecto
        </button>
      </div>
    </div>
  );
}
