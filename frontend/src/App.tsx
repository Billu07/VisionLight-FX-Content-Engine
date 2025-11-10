import { useState } from "react";
import axios from "axios";

function App() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await axios.post(
        "http://localhost:4000/api/generate-script",
        {
          prompt,
        }
      );
      setResult(res.data.script);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to generate script");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">FX Dashboard</h1>
        <p className="text-gray-600 mb-8">
          Generate social media scripts with AI
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 rounded-lg shadow"
        >
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Idea / Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A happy couple on vacation, promoting trust and joy"
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {loading ? "Generating..." : "Generate Script"}
          </button>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 p-6 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-3">Generated Script</h2>
            <div className="space-y-2">
              {result.caption.map((line: string, i: number) => (
                <p key={i} className="text-gray-800">
                  • {line}
                </p>
              ))}
            </div>
            <p className="mt-4 text-sm font-medium text-blue-600">
              CTA: {result.cta}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
