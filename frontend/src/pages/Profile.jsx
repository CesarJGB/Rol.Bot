import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save } from "lucide-react";
import { useApp } from "../context/AppContext";
import { TopBar } from "../components/TopBar";
import { toast } from "sonner";

const inputClass =
  "w-full bg-[#0a0a0a] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-[#EDEDED] placeholder:text-[#71717A] focus:outline-none focus:border-[#C6A45C]/60 transition-all";

export default function Profile() {
  const navigate = useNavigate();
  const { profile, setProfile } = useApp();
  const [form, setForm] = useState(profile);

  const set = (k) => (e) => setForm(s => ({ ...s, [k]: e.target.value }));

  const handleSave = () => {
    setProfile(form);
    toast.success("Perfil guardado");
    navigate(-1);
  };

  return (
    <div className="min-h-screen app-bg pb-24">
      <TopBar
        title="Tu perfil"
        subtitle="Quién eres en la historia"
        right={
          <button
            data-testid="save-profile-button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 bg-[#C6A45C] hover:bg-[#DBC184] text-[#111111] rounded-full px-4 py-2 text-sm font-medium transition-all"
          >
            <Save size={14} /> Guardar
          </button>
        }
      />

      <div className="max-w-xl mx-auto px-4 py-6 relative z-10">
        <p className="text-sm text-[#A1A1AA] mb-6 leading-relaxed">
          Los personajes se adaptarán a lo que les cuentes sobre ti. Déjalo en blanco si prefieres ser anónimo.
        </p>

        <div className="mb-5">
          <div className="label-eyebrow mb-2">Nombre</div>
          <input data-testid="profile-name-input" className={inputClass} value={form.name} onChange={set("name")} placeholder="¿Cómo deben llamarte?" />
        </div>
        <div className="mb-5">
          <div className="label-eyebrow mb-2">Apariencia</div>
          <textarea data-testid="profile-appearance-input" className={`${inputClass} min-h-[70px] resize-y`} value={form.appearance} onChange={set("appearance")} placeholder="Opcional. Corto. p. ej. alto, ojos oscuros, cansado." />
        </div>
        <div className="mb-5">
          <div className="label-eyebrow mb-2">Personalidad</div>
          <textarea data-testid="profile-personality-input" className={`${inputClass} min-h-[70px] resize-y`} value={form.personality} onChange={set("personality")} placeholder="Cómo sueles ser. p. ej. cauteloso, lengua afilada." />
        </div>
        <div className="mb-5">
          <div className="label-eyebrow mb-2">Trasfondo / contexto</div>
          <textarea data-testid="profile-background-input" className={`${inputClass} min-h-[90px] resize-y`} value={form.background} onChange={set("background")} placeholder="Cualquier cosa que quieras que los personajes sepan sobre ti en esta historia." />
        </div>
      </div>
    </div>
  );
}
