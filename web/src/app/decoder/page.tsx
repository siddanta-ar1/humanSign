"use client";
import { Navigation } from "@/components/layout/navigation";
import { Toaster, toast } from "sonner";
import { useCallback, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileUp,
  ShieldCheck,
  ShieldAlert,
  Keyboard,
  Zap,
  Clock,
  Plane,
  FileText,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import JSZip from "jszip";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

// --- Types ---
interface HumanSignData {
  version: string;
  generated_at: string;
  session: {
    id: string;
    domain: string;
    duration_ms: number;
  };
  metrics: {
    total_keystrokes: number;
    avg_dwell_ms: number;
    avg_flight_ms: number;
    wpm: number;
    text_length: number;
    total_typed_chars?: number;
    total_pasted_chars?: number;
    total_ai_chars?: number;
  };
  classification: {
    verdict?: string;
    class_label?: string;
    confidence: number;
    is_human: boolean;
    paste_ratio?: number;
    ai_ratio?: number;
    human_ratio?: number;
  };
  timing_data: {
    dwell_histogram: number[];
    flight_histogram: number[];
  };
  content_hash: string;
  signature: {
    algorithm: string;
    public_key: string;
    signature_value: string;
    signed_at: string;
  };
}

export default function DecoderPage() {
  const [data, setData] = useState<HumanSignData | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFile = async (file: File) => {
    try {
      setFileName(file.name);
      if (file.name.endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const metadataFile = zip.file("metadata.humanSign");
        if (!metadataFile) throw new Error("No metadata found");
        const json = await metadataFile.async("string");
        setData(JSON.parse(json));
      } else {
        const text = await file.text();
        // Regex extract if stuck in text format
        let jsonString = text;
        try {
          JSON.parse(text);
        } catch {
          const match = text.match(/=== HUMANSIGN METADATA \(DO NOT MODIFY\) ===\s*([\s\S]*?)\s*={60}/);
          if (match) jsonString = match[1];
        }
        setData(JSON.parse(jsonString));
      }
      toast.success("Analysis Loaded Successfully");
    } catch (e) {
      toast.error("Invalid file format");
      setData(null);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  // --- Derived Metrics ---
  const confusionMetrics = useMemo(() => {
    if (!data) return [];
    // Human, Paste, AI
    // We prioritize volumes from metrics if available, else ratios
    const total = data.metrics.text_length || 1;
    const humanVol = data.metrics.total_typed_chars ?? (data.classification.human_ratio || 0) * total;
    const pasteVol = data.metrics.total_pasted_chars ?? (data.classification.paste_ratio || 0) * total;
    const aiVol = data.metrics.total_ai_chars ?? (data.classification.ai_ratio || 0) * total;

    // Normalize
    const h = Math.round(humanVol);
    const p = Math.round(pasteVol);
    const a = Math.round(aiVol);
    // If specific fields missing, fallback to assumption based on verdict? 
    // Usually backend sends ratios. Let's trust what we have.

    return [
      { name: "Typed", value: h, color: "#3b82f6" }, // Blue-500
      { name: "Pasted", value: p, color: "#f59e0b" }, // Amber-500
      { name: "AI", value: a, color: "#ef4444" },     // Red-500
    ].filter(x => x.value > 0);
  }, [data]);

  const dwellData = useMemo(() => {
    return data?.timing_data.dwell_histogram.map((val, i) => ({ i, val })) || [];
  }, [data]);

  const flightData = useMemo(() => {
    return data?.timing_data.flight_histogram.map((val, i) => ({ i, val })) || [];
  }, [data]);


  // Clean UI Placeholder
  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            className={cn(
              "w-full max-w-2xl border-2 border-dashed rounded-2xl h-[400px] flex flex-col items-center justify-center gap-6 transition-all duration-300",
              isDragOver ? "border-blue-500 bg-blue-50 scale-[1.02]" : "border-slate-300 bg-white hover:border-slate-400"
            )}
          >
            <div className="h-20 w-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <FileUp className="h-10 w-10" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-slate-900">Upload Verification File</h3>
              <p className="text-slate-500">Drag & drop your .humanSign output here</p>
            </div>

            <input type="file" id="file-upload" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button onClick={() => document.getElementById("file-upload")?.click()} size="lg" className="bg-slate-900 text-white hover:bg-slate-800">
              Browse Files
            </Button>
          </div>
        </div>
        <Toaster />
      </main>
    );
  }

  // --- DASHBOARD UI ---
  const isHuman = data.classification.is_human;
  const confidencePct = (data.classification.confidence * 100).toFixed(1);
  const totalScoreVal = isHuman ? confidencePct : (100 - parseFloat(confidencePct)).toFixed(1);
  // If not human, confidence is confidence OF IT BEING AI. But usually user wants "Verification Score".
  // Let's stick to system confidence.

  return (
    <main className="min-h-screen bg-slate-50 font-sans pb-20">
      <Navigation />

      <div className="max-w-7xl mx-auto px-6 pt-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">HumanSign Verification</h1>
            <p className="text-slate-500 mt-1 flex items-center gap-2">
              <FileText className="w-4 h-4" /> {fileName}
            </p>
          </div>
          <div className="flex gap-3">
            <div className={cn("px-4 py-2 rounded-full font-semibold flex items-center gap-2", isHuman ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
              {isHuman ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              {isHuman ? "Human Verified" : "Verification Failed"}
            </div>
          </div>
        </div>

        {/* 1. TOP METRICS ROW */}
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="KEYSTROKES" value={data.metrics.total_keystrokes} icon={Keyboard} />
          <StatCard label="TYPING SPEED" value={`${Math.round(data.metrics.wpm)} WPM`} icon={Zap} />
          <StatCard label="AVG DWELL" value={`${Math.round(data.metrics.avg_dwell_ms)}ms`} icon={Clock} />
          <StatCard label="AVG FLIGHT" value={`${Math.round(data.metrics.avg_flight_ms)}ms`} icon={Plane} />
          <StatCard label="CHARACTERS" value={data.metrics.text_length} icon={FileText} />
        </div>

        {/* 2. MAIN CHARTS GRID */}
        <div className="grid grid-cols-12 gap-6 h-[420px]">

          {/* LEFT: Content Origin (Donut) */}
          <Card className="col-span-4 p-6 flex flex-col justify-between shadow-sm border-slate-200">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-500" />
                Content Origin
              </h3>
            </div>

            <div className="h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={confusionMetrics}
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {confusionMetrics.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              {/* Centered Percentage */}
              <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                <span className="text-3xl font-bold text-slate-900">
                  {((confusionMetrics.find(x => x.name === "Typed")?.value || 0) / data.metrics.text_length * 100).toFixed(0)}%
                </span>
                <span className="text-xs font-semibold text-slate-400 uppercase">Typed</span>
              </div>
            </div>

            <div className="space-y-3">
              {confusionMetrics.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
                    <span className="font-medium text-slate-700">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-900">{item.value.toLocaleString()} chars</span>
                </div>
              ))}
            </div>
          </Card>

          {/* RIGHT: Biometric Patterns (Histograms) */}
          <Card className="col-span-8 p-6 flex flex-col shadow-sm border-slate-200">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-500" />
                Biometric Typing Patterns
              </h3>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-8">
              {/* Dwell Chart */}
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-wider">Key Hold Duration (Dwell)</span>
                <div className="flex-1 min-h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dwellData}>
                      <Bar dataKey="val" fill="#6366f1" radius={[2, 2, 0, 0]} />
                      <XAxis dataKey="i" hide />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Flight Chart */}
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-wider">Key Flight Interval</span>
                <div className="flex-1 min-h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={flightData}>
                      <Bar dataKey="val" fill="#a855f7" radius={[2, 2, 0, 0]} />
                      <XAxis dataKey="i" hide />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Summary Stats Footer inside Card */}
            <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-3 gap-8">
              <div>
                <p className="text-xs font-bold text-indigo-600 uppercase mb-1">Pattern Match</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">{isHuman ? confidencePct : (data.classification.confidence * 100).toFixed(1)}%</span>
                  {isHuman && <ShieldCheck className="w-4 h-4 text-indigo-500" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Similarity to human baseline model</p>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">System Verdict</p>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-2xl font-bold", isHuman ? "text-green-600" : "text-red-600")}>
                    {isHuman ? "Human Verified" : "Flagged"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Weighted final verification score</p>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Total Events</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">{data.metrics.total_keystrokes}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Total validated events captured</p>
              </div>
            </div>
          </Card>
        </div>

        {/* 3. FOOTER ACTIONS */}
        <div className="flex justify-center pt-8">
          <Button
            onClick={() => setData(null)}
            className="bg-slate-900 text-white hover:bg-slate-800 px-8 py-6 rounded-xl font-semibold shadow-lg shadow-slate-200 transition-all hover:scale-105"
          >
            Audit Another File
          </Button>
        </div>

      </div>
      <Toaster />
    </main>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card className="p-5 flex flex-col items-center justify-center gap-2 border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <span className="text-3xl font-bold text-slate-900">{value}</span>
      <div className="flex items-center gap-2 text-slate-400 text-xs font-bold tracking-wider uppercase">
        <Icon className="w-3 h-3" />
        {label}
      </div>
    </Card>
  )
}
