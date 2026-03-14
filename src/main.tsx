import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import { CopilotProvider } from "./ui/copilot/copilot-context";
import "./styles/global.less";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CopilotProvider>
      <App />
    </CopilotProvider>
  </React.StrictMode>
);
