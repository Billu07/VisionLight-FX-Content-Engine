import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./App.css";
import "./styles/brand.css"; // Add this import
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { consumeDomainAuthRelay } from "./lib/domain-routing";

const queryClient = new QueryClient();

const renderApp = () => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
};

const bootstrap = async () => {
  try {
    await consumeDomainAuthRelay();
  } catch (error) {
    console.warn("Domain auth relay bootstrap failed:", error);
  } finally {
    renderApp();
  }
};

void bootstrap();
