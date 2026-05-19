// Detecta si una respuesta del asistente quedó cortada a mitad de frase.
// Espejo del heurístico que vive en el backend (server.py `looks_cut_off`).
// Se usa después de un stream para pedir continuación silenciosa.
export const looksCutOff = (text) => {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 20) return false;
  // Asteriscos de acción desbalanceados.
  const asteriskCount = (t.match(/\*/g) || []).length;
  if (asteriskCount % 2 !== 0) return true;
  // Termina sin puntuación terminal, comilla de cierre o asterisco final.
  return !/[.!?…»"')\]\*]\s*$/.test(t);
};
