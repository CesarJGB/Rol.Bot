import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp, blankCharacter } from "../context/AppContext";
import { TopBar } from "../components/TopBar";
import { DEFAULT_AVATARS } from "../lib/constants";
import { exportCharacter } from "../lib/storage";
import { downloadCharacterTemplate } from "../lib/characterTemplate";
import { toast } from "sonner";
import { autoFillCharacter, friendlyError } from "../lib/api";
import { Trash2, Save, Image as ImageIcon, Download, Wand2, FileDown } from "lucide-react";

const Field = ({ label, hint, children, testId }) => (
  <div className="mb-5" data-testid={testId ? `field-${testId}` : undefined}>
    <div className="label-eyebrow mb-2">{label}</div>
    {children}
    {hint && <div className="text-xs text-[#71717A] mt-1.5">{hint}</div>}
  </div>
);

const inputClass =
  "w-full bg-[#0a0a0a] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-[#EDEDED] placeholder:text-[#71717A] focus:outline-none focus:border-[#C6A45C]/60 transition-all";

const appearancePlaceholder = `overall:
face:
hair:
eyes:
body:
clothing:
bodyLanguage:
voice:
specialFeatures:`;

const secondaryCharactersPlaceholder = `- name:
  relation:
  role:
  appearance:
  personality:
  speakingStyle:
  triggerConditions:
  turnRules:
  sampleLine:`;

const looksLikeFullBlueprint = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;

  if (text.startsWith("{") && /"(?:name|tagline|personality|appearance|secondaryCharacters|sceneDefault)"\s*:/.test(text)) {
    return true;
  }

  const matches = text.match(/^(name|tagline|personality|appearance|lore|secondaryCharacters|speakingStyle|emotionalTendencies|exampleDialogues|tags|initialMessage|sceneDefault)\s*:/gm) || [];
  return new Set(matches.map(match => match.split(":")[0].trim())).size >= 3;
};

const buildAutoFillSource = (form) => {
  const rawBlueprint = [
    form.personality,
    form.lore,
    form.appearance,
    form.secondaryCharacters,
    form.exampleDialogues,
    form.initialMessage,
  ].find(looksLikeFullBlueprint);

  if (rawBlueprint) {
    return String(rawBlueprint).trim();
  }

  const blocks = [];
  const add = (label, value) => {
    if (!value) return;
    const text = String(value).trim();
    if (!text) return;
    blocks.push(`${label}:\n${text}`);
  };

  add("name", form.name);
  add("tagline", form.tagline);
  add("personality", form.personality);
  add("appearance", form.appearance);
  add("lore", form.lore);
  add("secondaryCharacters", form.secondaryCharacters);
  add("speakingStyle", form.speakingStyle);
  add("emotionalTendencies", form.emotionalTendencies);
  add("exampleDialogues", form.exampleDialogues);
  add("tags", Array.isArray(form.tags) ? form.tags.join(", ") : form.tags);
  add("initialMessage", form.initialMessage);

  const sceneLines = [
    form.sceneDefault?.location?.trim() ? `location: ${form.sceneDefault.location.trim()}` : "",
    form.sceneDefault?.atmosphere?.trim() ? `atmosphere: ${form.sceneDefault.atmosphere.trim()}` : "",
    form.sceneDefault?.characterEmotion?.trim() ? `characterEmotion: ${form.sceneDefault.characterEmotion.trim()}` : "",
  ].filter(Boolean);

  if (sceneLines.length > 0) {
    blocks.push(`sceneDefault:\n${sceneLines.join("\n")}`);
  }

  return blocks.join("\n\n");
};

// Comprime una imagen a máximo MAX_SIZExMAX_SIZE px en JPEG calidad QUALITY.
// Reduce un avatar típico de ~300-800KB a ~15-40KB.
const MAX_SIZE = 256;   // px — suficiente para un avatar de chat
const QUALITY = 0.82;   // 0-1 — balance calidad/peso

const compressImage = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Calcular dimensiones manteniendo proporción.
      let { width, height } = img;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = Math.round((height / width) * MAX_SIZE);
          width = MAX_SIZE;
        } else {
          width = Math.round((width / height) * MAX_SIZE);
          height = MAX_SIZE;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", QUALITY));
    };
    img.onerror = reject;
    img.src = url;
  });

export default function CharacterEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { characters, upsertCharacter, deleteCharacter, getBundle } = useApp();

  const initial = useMemo(() => {
    if (id && id !== "new") {
      const existing = characters.find(c => c.id === id);
      if (existing) return existing;
    }
    return blankCharacter({ avatar: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)] });
  }, [id, characters]);

  // --- HOOKS DE ESTADO (Mover aquí adentro) ---
  const [form, setForm] = useState(initial);
  const [autofilling, setAutofilling] = useState(false);

  useEffect(() => { setForm(initial); }, [initial]);

  const set = (k) => (e) => setForm(s => ({ ...s, [k]: typeof e === "string" ? e : e.target.value }));
  const setScene = (k) => (e) => setForm(s => ({ ...s, sceneDefault: { ...s.sceneDefault, [k]: e.target.value } }));

  // --- FUNCIÓN MANEJADORA DE AUTO-RELLENO (Mover aquí adentro) ---
  const handleAutoFill = async () => {
    const baseDesc = buildAutoFillSource(form);
    if (baseDesc.trim().length < 20) {
      toast.error("Añade un briefing, YAML o texto base suficiente antes de usar el auto-rellenado.");
      return;
    }

    setAutofilling(true);
    toast.info("Analizando y repartiendo la ficha...");
    try {
      const data = await autoFillCharacter({
        base_description: baseDesc,
        initial_message: form.initialMessage || ""
      });
      
      setForm(s => ({
        ...s,
        name: data.name || s.name,
        tagline: data.tagline || s.tagline,
        personality: data.personality || s.personality,
        appearance: data.appearance || s.appearance,
        lore: data.lore || s.lore,
        secondaryCharacters: data.secondaryCharacters || s.secondaryCharacters,
        speakingStyle: data.speakingStyle || s.speakingStyle,
        emotionalTendencies: data.emotionalTendencies || s.emotionalTendencies,
        exampleDialogues: data.exampleDialogues || s.exampleDialogues,
        tags: data.tags?.length ? data.tags : s.tags,
        initialMessage: data.initialMessage || s.initialMessage,
        sceneDefault: {
          location: data.sceneDefault?.location || s.sceneDefault?.location || "",
          atmosphere: data.sceneDefault?.atmosphere || s.sceneDefault?.atmosphere || "",
          characterEmotion: data.sceneDefault?.characterEmotion || s.sceneDefault?.characterEmotion || "",
        },
      }));
      toast.success("¡Tarjeta auto-completada con éxito!");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setAutofilling(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setForm(s => ({ ...s, avatar: compressed }));
    } catch {
      const reader = new FileReader();
      reader.onload = () => setForm(s => ({ ...s, avatar: reader.result }));
      reader.readAsDataURL(file);
      toast.warning("No se pudo comprimir la imagen, se guardó sin comprimir.");
    }
  };

  const handleSave = () => {
    if (!form.name?.trim()) { toast.error("Dale un nombre a tu personaje."); return; }
    const tags = typeof form.tags === "string"
      ? form.tags.split(",").map(t => t.trim()).filter(Boolean)
      : (form.tags || []);
    upsertCharacter({ ...form, tags });
    toast.success("Guardado");
    navigate(`/chat/${form.id}`);
  };

  const handleDelete = () => {
    if (!window.confirm(`¿Eliminar a ${form.name}? Esto no se puede deshacer.`)) return;
    deleteCharacter(form.id);
    toast.success("Eliminado");
    navigate("/");
  };

  const handleDownloadTemplate = () => {
    downloadCharacterTemplate({ name: form.name || "" });
    toast.success("Plantilla descargada");
  };

  const handleExport = () => {
    const bundle = getBundle(form.id);
    const data = exportCharacter(form, bundle);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(form.name || "personaje").replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isNew = !characters.find(c => c.id === form.id);

  return (
    <div className="min-h-screen app-bg pb-24">
      <TopBar
        title={isNew ? "Nuevo personaje" : form.name || "Editar"}
        subtitle={isNew ? "Creación" : "Editando"}
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 border border-white/[0.10] hover:bg-white/5 text-[#EDEDED] rounded-full px-4 py-2 text-sm font-medium transition-all"
              title="Descarga una plantilla YAML con todos los campos para generar fichas con modelos externos"
            >
              <FileDown size={14} />
              Plantilla
            </button>
            <button
              onClick={handleAutoFill}
              disabled={autofilling}
              className="inline-flex items-center gap-1.5 border border-[#C6A45C]/50 hover:bg-[#C6A45C]/10 text-[#C6A45C] disabled:opacity-50 rounded-full px-4 py-2 text-sm font-medium transition-all"
              title="Analiza tu briefing, YAML o JSON actual y lo reparte en toda la ficha"
            >
              <Wand2 size={14} />
              {autofilling ? "Pensando..." : "Auto-Rellenar"}
            </button>
            
            <button
              data-testid="save-character-button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 bg-[#C6A45C] hover:bg-[#DBC184] text-[#111111] rounded-full px-4 py-2 text-sm font-medium transition-all"
            >
              <Save size={14} /> Guardar
            </button>
          </div>
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-6 relative z-10">
        <div className="flex items-center gap-5 mb-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border border-white/[0.08] bg-[#111111]">
              {form.avatar ? (
                <img src={form.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-[#71717A]"><ImageIcon size={22} /></div>
              )}
            </div>
          </div>
          <div className="flex-1">
            <div className="label-eyebrow mb-2">Avatar</div>
            <div className="flex gap-2 flex-wrap">
              <label className="text-xs text-[#A1A1AA] border border-white/[0.08] rounded-full px-3 py-1.5 cursor-pointer hover:border-[#C6A45C]/50 transition-all">
                Subir
                <input data-testid="avatar-upload-input" type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              </label>
              {DEFAULT_AVATARS.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setForm(s => ({ ...s, avatar: a }))}
                  className={`w-8 h-8 rounded-full overflow-hidden border ${form.avatar === a ? "border-[#C6A45C]" : "border-white/[0.08]"}`}
                  aria-label={`Usar avatar ${i + 1}`}
                >
                  <img src={a} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field label="Nombre" testId="name">
          <input data-testid="character-name-input" className={inputClass} value={form.name} onChange={set("name")} placeholder="Kira Vex" />
        </Field>
        <Field label="Frase gancho" hint="Una línea que aparece en la tarjeta de la galería." testId="tagline">
          <input data-testid="character-tagline-input" className={inputClass} value={form.tagline} onChange={set("tagline")} placeholder="Una hacker de luces de neón que nunca acaba de confiar en ti." />
        </Field>
        <Field label="Personalidad" hint="Quién es en el fondo. Rasgos, contradicciones, qué le mueve." testId="personality">
          <textarea data-testid="character-personality-input" className={`${inputClass} min-h-[80px] resize-y`} value={form.personality} onChange={set("personality")} />
        </Field>
        <Field label="Apariencia física y rasgos especiales" hint="Describe cuerpo, rostro, ropa, lenguaje corporal y cualquier rasgo no humano o fantástico en un apartado 'specialFeatures'." testId="appearance">
          <textarea data-testid="character-appearance-input" className={`${inputClass} min-h-[110px] resize-y`} value={form.appearance || ""} onChange={set("appearance")} placeholder={appearancePlaceholder} />
        </Field>
        <Field label="Mundo y lore" hint="Escenario, trasfondo, situación actual." testId="lore">
          <textarea data-testid="character-lore-input" className={`${inputClass} min-h-[80px] resize-y`} value={form.lore} onChange={set("lore")} />
        </Field>
        <Field label="Personajes secundarios y reparto" hint="Lista familiares, aliados o NPCs recurrentes con su relación, personalidad, voz y cuándo pueden entrar en escena o tomar turno." testId="secondaryCharacters">
          <textarea data-testid="character-secondary-characters-input" className={`${inputClass} min-h-[140px] resize-y`} value={form.secondaryCharacters || ""} onChange={set("secondaryCharacters")} placeholder={secondaryCharactersPlaceholder} />
        </Field>
        <Field label="Forma de hablar" hint="Cadencia, vocabulario, manías." testId="speakingStyle">
          <textarea data-testid="character-style-input" className={`${inputClass} min-h-[60px] resize-y`} value={form.speakingStyle} onChange={set("speakingStyle")} />
        </Field>
        <Field label="Tendencias emocionales" hint="Humor por defecto, qué le ablanda o le endurece." testId="emotional">
          <textarea data-testid="character-emotional-input" className={`${inputClass} min-h-[60px] resize-y`} value={form.emotionalTendencies} onChange={set("emotionalTendencies")} />
        </Field>
        <Field label="Diálogo de ejemplo" hint="Muestra cómo hablan el personaje principal y, si aplica, algún secundario. Formato sugerido: Usuario: / Nombre: / Secundario:" testId="example">
          <textarea data-testid="character-example-input" className={`${inputClass} min-h-[80px] resize-y font-mono text-[12.5px]`} value={form.exampleDialogues} onChange={set("exampleDialogues")} placeholder={"Usuario: ...\nPersonaje principal: ...\nSecundario: ..."} />
        </Field>
        <Field label="Etiquetas" hint="Separadas por comas. p. ej. fantasía, slow-burn, antihéroe" testId="tags">
          <input
            data-testid="character-tags-input"
            className={inputClass}
            value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags}
            onChange={(e) => setForm(s => ({ ...s, tags: e.target.value }))}
          />
        </Field>
        <Field label="Mensaje inicial" hint="La narración de apertura. Lo primero que dirá el personaje al entrar al chat." testId="initial">
          <textarea data-testid="character-initial-input" className={`${inputClass} min-h-[110px] resize-y`} value={form.initialMessage} onChange={set("initialMessage")} placeholder="*La puerta se abre antes de que llames...*" />
        </Field>

        <div className="border-t border-white/[0.06] pt-5 mt-2">
          <div className="label-eyebrow mb-3 text-[#C6A45C]">Escena inicial</div>
          <Field label="Ubicación" testId="loc">
            <input data-testid="scene-location-input" className={inputClass} value={form.sceneDefault?.location || ""} onChange={setScene("location")} />
          </Field>
          <Field label="Atmósfera" testId="atm">
            <input data-testid="scene-atmosphere-input" className={inputClass} value={form.sceneDefault?.atmosphere || ""} onChange={setScene("atmosphere")} />
          </Field>
          <Field label="Emoción inicial del personaje" testId="emo">
            <input data-testid="scene-emotion-input" className={inputClass} value={form.sceneDefault?.characterEmotion || ""} onChange={setScene("characterEmotion")} />
          </Field>
        </div>

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/[0.06]">
          {!isNew ? (
            <button
              data-testid="delete-character-button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 text-sm text-[#C83A3A] hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          ) : <span />}
          <button
            data-testid="export-character-button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-[#C6A45C] transition-colors"
          >
            <Download size={14} /> Exportar JSON
          </button>
        </div>
      </div>
    </div>
  );
}
