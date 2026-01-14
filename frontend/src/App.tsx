import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AccumulatorProvider } from "./context/AccumulatorContext";
import { HomePage } from "./pages/Home";
import { DesignPage } from "./pages/Design";

function App() {
  return (
    <BrowserRouter>
      <AccumulatorProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/design" element={<DesignPage />} />
        </Routes>
      </AccumulatorProvider>
    </BrowserRouter>
  );
}

export default App;
