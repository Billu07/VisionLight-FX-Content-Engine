import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketingSite } from "./pages/MarketingSite";
import Dashboard from "./pages/Dashboard";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<MarketingSite />} />
          <Route path="/demo" element={<Dashboard />} />
          {/* Future route: <Route path="/app" element={<WhiteLabelDashboard />} /> */}
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
