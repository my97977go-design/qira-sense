import { createContext, useContext, useState } from "react";
import initial from "../data/techniques.json";
import { validateLibrary, KNOWLEDGE_KEY } from "./store.js";
const Context = createContext(null);
export function KnowledgeProvider({ children }) {
  const [library, setLibrary] = useState(() => {
    try {
      return validateLibrary(JSON.parse(localStorage.getItem(KNOWLEDGE_KEY)));
    } catch {
      return initial;
    }
  });
  const save = (next) => {
    const valid = validateLibrary(next);
    let persisted = true;
    try {
      localStorage.setItem(KNOWLEDGE_KEY, JSON.stringify(valid));
    } catch {
      persisted = false;
    }
    setLibrary(valid);
    return persisted;
  };
  const techFor = (id) => {
    const t =
      library.entries.find((t) => t.id === id) ||
      initial.entries.find((t) => t.id === id) ||
      initial.entries[0];
    return { ...t, description: t.shortExplanation };
  };
  return (
    <Context.Provider value={{ library, save, techFor, initial }}>
      {children}
    </Context.Provider>
  );
}
export const useKnowledge = () => useContext(Context);
