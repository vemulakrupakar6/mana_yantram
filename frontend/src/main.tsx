import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-telugu";
import "@/config/i18n";
import App from "./App";
import { AppErrorBoundary } from "@/components/common/shared";
import "./index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
