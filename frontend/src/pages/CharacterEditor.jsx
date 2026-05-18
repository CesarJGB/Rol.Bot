import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash2, Save, Image as ImageIcon, Download } from "lucide-react";
import { useApp, blankCharacter } from "../context/AppContext";
import { TopBar } from "../components/TopBar";
import { DEFAULT_AVATARS } from "../lib/constants";
import { exportCharacter } from "../lib/storage";
import { toast } from "sonner";

const Field = ({ label, hint, children, testId }) => (
  <div className="mb-5" data-testid={testId ? `field-${testId}` : undefined}>
    <div className="label-eyebrow mb-2">{label}</div>
    {children}
    {hint && <div className="text-xs text-[#71717A] mt-1.5">{hint}</div>}
  </div>
);

const inputClass =
  "w-full bg-[#0a0a0a] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-[#EDEDED] placeholder:text-[#71717A] focus:outline-none focus:border-[#C6A45C]/60 transition-all";

export default function CharacterEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { characters, upsertCharacter, deleteCharacter, getChat } = useApp();

  const initial = useMemo(() => {
    if (id && id !== "new") {
      const existing = characters.find(c => c.id === id);
      if (existing) return existing;
    }
    return blankCharacter({ avatar: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)] });
  }, [id, characters]);

  const [form, setForm] = useState(initial);
  useEffect(() => { setForm(initial); }, [initial]);

  const set = (k) => (e) => setForm(s => ({ ...s, [k]: typeof e === "string" ? e : e.target.value }));
  const setScene = (k) => (e) => setForm(s => ({ ...s, sceneDefault: { ...s.sceneDefault, [k]: e.target.value } }));

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(s => ({ ...s, avatar: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!form.name?.trim()) { toast.error("Give your character a name."); return; }
    const tags = typeof form.tags === "string"
      ? form.tags.split(",").map(t => t.trim()).filter(Boolean)
      : (form.tags || []);
    upsertCharacter({ ...form, tags });
    toast.success("Saved");
    navigate(`/chat/${form.id}`);
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete ${form.name}? This cannot be undone.`)) return;
    deleteCharacter(form.id);
    toast.success("Deleted");
    navigate("/");
  };

  const handleExport = () => {
    const chat = getChat(form.id);
    const data = exportCharacter(form, chat);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(form.name || "character").replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isNew = !characters.find(c => c.id === form.id);

  return (
    <div className="min-h-screen app-bg pb-24">
      <TopBar
        title={isNew ? "New character" : form.name || "Edit"}
        subtitle={isNew ? "Creation" : "Editing"}
        right={
          <button
            data-testid="save-character-button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 bg-[#C6A45C] hover:bg-[#DBC184] text-[#111111] rounded-full px-4 py-2 text-sm font-medium transition-all"
          >
            <Save size={14} /> Save
          </button>
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
                Upload
                <input data-testid="avatar-upload-input" type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              </label>
              {DEFAULT_AVATARS.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setForm(s => ({ ...s, avatar: a }))}
                  className={`w-8 h-8 rounded-full overflow-hidden border ${form.avatar === a ? "border-[#C6A45C]" : "border-white/[0.08]"}`}
                  aria-label={`Use avatar ${i + 1}`}
                >
                  <img src={a} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field label="Name" testId="name">
          <input data-testid="character-name-input" className={inputClass} value={form.name} onChange={set("name")} placeholder="Kira Vex" />
        </Field>
        <Field label="Tagline" hint="A one-line hook shown on the gallery card." testId="tagline">
          <input data-testid="character-tagline-input" className={inputClass} value={form.tagline} onChange={set("tagline")} placeholder="A neon-lit hacker who never quite trusts you back." />
        </Field>
        <Field label="Personality" hint="Who they are at the core. Traits, contradictions, what makes them tick." testId="personality">
          <textarea data-testid="character-personality-input" className={`${inputClass} min-h-[80px] resize-y`} value={form.personality} onChange={set("personality")} />
        </Field>
        <Field label="World & lore" hint="Setting, backstory, current situation." testId="lore">
          <textarea data-testid="character-lore-input" className={`${inputClass} min-h-[80px] resize-y`} value={form.lore} onChange={set("lore")} />
        </Field>
        <Field label="Speaking style" hint="Cadence, vocabulary, quirks." testId="speakingStyle">
          <textarea data-testid="character-style-input" className={`${inputClass} min-h-[60px] resize-y`} value={form.speakingStyle} onChange={set("speakingStyle")} />
        </Field>
        <Field label="Emotional tendencies" hint="Default mood, what softens or sharpens them." testId="emotional">
          <textarea data-testid="character-emotional-input" className={`${inputClass} min-h-[60px] resize-y`} value={form.emotionalTendencies} onChange={set("emotionalTendencies")} />
        </Field>
        <Field label="Example dialogue" hint="Show, don't tell. Format as User: / Name:" testId="example">
          <textarea data-testid="character-example-input" className={`${inputClass} min-h-[80px] resize-y font-mono text-[12.5px]`} value={form.exampleDialogues} onChange={set("exampleDialogues")} />
        </Field>
        <Field label="Tags" hint="Comma-separated. e.g. fantasy, slow-burn, anti-hero" testId="tags">
          <input
            data-testid="character-tags-input"
            className={inputClass}
            value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags}
            onChange={(e) => setForm(s => ({ ...s, tags: e.target.value }))}
          />
        </Field>
        <Field label="Initial message" hint="The opening narration / scene-setter. The very first thing the character will say." testId="initial">
          <textarea data-testid="character-initial-input" className={`${inputClass} min-h-[110px] resize-y`} value={form.initialMessage} onChange={set("initialMessage")} placeholder="*The door opens before you knock...*" />
        </Field>

        <div className="border-t border-white/[0.06] pt-5 mt-2">
          <div className="label-eyebrow mb-3 text-[#C6A45C]">Default scene</div>
          <Field label="Location" testId="loc">
            <input data-testid="scene-location-input" className={inputClass} value={form.sceneDefault?.location || ""} onChange={setScene("location")} />
          </Field>
          <Field label="Atmosphere" testId="atm">
            <input data-testid="scene-atmosphere-input" className={inputClass} value={form.sceneDefault?.atmosphere || ""} onChange={setScene("atmosphere")} />
          </Field>
          <Field label="Character's starting emotion" testId="emo">
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
              <Trash2 size={14} /> Delete
            </button>
          ) : <span />}
          <button
            data-testid="export-character-button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-[#C6A45C] transition-colors"
          >
            <Download size={14} /> Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}
