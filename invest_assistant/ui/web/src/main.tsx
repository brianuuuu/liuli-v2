import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import { App } from "./app/App";
import { LiuliThemeProvider } from "./app/theme";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LiuliThemeProvider>
      <App />
    </LiuliThemeProvider>
  </React.StrictMode>
);
