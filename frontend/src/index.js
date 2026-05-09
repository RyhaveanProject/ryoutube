import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { startKeepAlive } from "./lib/keepAlive";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

// Keep the backend warm (Render/Fly free dynos sleep after 15 min idle).
startKeepAlive();
