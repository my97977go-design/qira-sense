import React from "react";
import { createRoot } from "react-dom/client";
import { KnowledgeProvider } from "./knowledge/KnowledgeContext.jsx";
import App from "./Experience.jsx";
import "./experience.css";
import "./course.css";
import "./v8.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <KnowledgeProvider>
      <App />
    </KnowledgeProvider>
  </React.StrictMode>,
);
