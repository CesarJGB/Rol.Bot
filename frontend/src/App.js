import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import Gallery from "@/pages/Gallery";
import CharacterEditor from "@/pages/CharacterEditor";
import Chat from "@/pages/Chat";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import { Toaster } from "sonner";

function App() {
  return (
    <div className="App">
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Gallery />} />
            <Route path="/character/new" element={<CharacterEditor />} />
            <Route path="/character/:id/edit" element={<CharacterEditor />} />
            <Route path="/chat/:id" element={<Chat />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </BrowserRouter>
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: {
              background: "#111111",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#EDEDED",
              fontFamily: "Outfit, sans-serif",
            },
          }}
        />
      </AppProvider>
    </div>
  );
}

export default App;
