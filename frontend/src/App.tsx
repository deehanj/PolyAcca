import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { Web3Provider } from "./providers/Web3Provider";
import { AuthProvider } from "./hooks/useAuth";
import { AccumulatorProvider } from "./context/AccumulatorContext";
import { TradingBalanceProvider } from "./context/TradingBalanceContext";
import { useBetNotifications } from "./hooks/useBetNotifications";
import { HomePage } from "./pages/Home";
import { DesignPage } from "./pages/Design";
import { AdminPage } from "./pages/Admin";
import { MyChainsPage } from "./pages/MyChains";
import { DepositModal } from "./components/deposit";

function AppContent() {
  // Initialize WebSocket connection for bet notifications
  useBetNotifications();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/acca/:chainId" element={<HomePage />} />
      <Route path="/design" element={<DesignPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/my-chains" element={<MyChainsPage />} />
    </Routes>
  );
}

function App() {
  return (
    <Web3Provider>
      <AuthProvider>
        <TradingBalanceProvider>
          <BrowserRouter>
            <AccumulatorProvider>
              <AppContent />
              <Toaster position="bottom-right" theme="dark" richColors />
              <DepositModal />
            </AccumulatorProvider>
          </BrowserRouter>
        </TradingBalanceProvider>
      </AuthProvider>
    </Web3Provider>
  );
}

export default App;
