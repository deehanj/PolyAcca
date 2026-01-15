import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { Web3Provider } from "./providers/Web3Provider";
import { AccumulatorProvider } from "./context/AccumulatorContext";
import { useBetNotifications } from "./hooks/useBetNotifications";
import { HomePage } from "./pages/Home";
import { DesignPage } from "./pages/Design";

function AppContent() {
  // Initialize WebSocket connection for bet notifications
  useBetNotifications();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/design" element={<DesignPage />} />
    </Routes>
  );
}

function App() {
  return (
    <Web3Provider>
      <BrowserRouter>
        <AccumulatorProvider>
          <AppContent />
          <Toaster position="bottom-right" theme="dark" richColors />
        </AccumulatorProvider>
      </BrowserRouter>
    </Web3Provider>
  );
}

export default App;
