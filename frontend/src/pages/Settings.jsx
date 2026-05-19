import React from "react";
import { useApp } from "../context/AppContext";
import { TopBar } from "../components/TopBar";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import { DEFAULT_SETTINGS, API_BASE_URL, DEEPSEEK_MODEL } from "../lib/constants";
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

          {/* Streaming toggle */}
          <div className="mb-7 flex items-start justify-between gap-4" data-testid="setting-streaming">
            <div className="flex-1">
              <div className="label-eyebrow mb-1">Efecto máquina de escribir</div>
              <div className="text-xs text-[#71717A] leading-relaxed">
                Muestra las respuestas palabra a palabra mientras se generan. Si lo apagas, aparecerán de golpe.
              </div>
            </div>
            <Switch
              data-testid="streaming-toggle"
              checked={!!settings.streamingEnabled}
              onCheckedChange={(v) => update("streamingEnabled", v)}
              className="mt-1 data-[state=checked]:bg-[#C6A45C]"
            />
          </div>

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

        {/* Diagnóstico — útil para verificar que apuntas al backend correcto. */}
        <div className="mt-10 pt-5 border-t border-white/[0.06] text-[11px] text-[#71717A] space-y-1">
          <div className="label-eyebrow mb-2 text-[#71717A]">Diagnóstico</div>
          <div><span className="opacity-70">API:</span> <span className="text-[#A1A1AA] break-all" data-testid="diag-api-url">{API_BASE_URL}</span></div>
          <div><span className="opacity-70">Modelo:</span> <span className="text-[#A1A1AA]">{DEEPSEEK_MODEL}</span></div>
        </div>
      </div>
    </div>
  );
}
