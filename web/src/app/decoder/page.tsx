"use client";
import { Navigation } from "@/components/layout/navigation";
import { Toaster, toast } from "sonner";
import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileUp,
  CheckCircle2,
  XCircle,
  Shield,
  FileText,
  Clock,
  Keyboard,
  Zap,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import JSZip from "jszip";

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
  const [documentContent, setDocumentContent] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<
    "pending" | "valid" | "invalid" | "none"
  >("none");
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFile = async (file: File) => {
    try {
      setFileName(file.name);

      if (file.name.endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const metadataFile = zip.file("metadata.humanSign");
        if (!metadataFile)
          throw new Error("No metadata.humanSign found in ZIP");
        const metadataJson = await metadataFile.async("string");
        const parsedData = JSON.parse(metadataJson) as HumanSignData;
        setData(parsedData);

        const docFile = zip.file("document.txt");
        if (docFile) {
          const docContent = await docFile.async("string");
          setDocumentContent(docContent);
        }
        await verifySignature(parsedData);
        toast.success("ZIP file parsed successfully");
      } else {
        const text = await file.text();
        let jsonString = "";
        try {
          JSON.parse(text);
          jsonString = text;
        } catch {
          const match = text.match(
            /=== HUMANSIGN METADATA \(DO NOT MODIFY\) ===\s*([\s\S]*?)\s*={60}/,
          );
          if (match && match[1]) jsonString = match[1];
          else throw new Error("No valid HumanSign metadata found");
        }
        const parsedData = JSON.parse(jsonString) as HumanSignData;
        setData(parsedData);
        await verifySignature(parsedData);
      }
    } catch (e) {
      toast.error("Invalid file: " + (e as Error).message);
      setData(null);
      setVerificationStatus("none");
    }
  };

  const verifySignature = async (data: HumanSignData) => {
    if (!data.signature?.public_key || !data.signature?.signature_value) {
      setVerificationStatus("none");
      return;
    }
    try {
      const binaryDerString = atob(data.signature.public_key);
      const binaryDer = new Uint8Array(binaryDerString.length);
      for (let i = 0; i < binaryDerString.length; i++)
        binaryDer[i] = binaryDerString.charCodeAt(i);

      const publicKey = await window.crypto.subtle.importKey(
        "spki",
        binaryDer,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"],
      );
      const signatureBinaryString = atob(data.signature.signature_value);
      const signature = new Uint8Array(signatureBinaryString.length);
      for (let i = 0; i < signatureBinaryString.length; i++)
        signature[i] = signatureBinaryString.charCodeAt(i);

      const dataToVerify = JSON.stringify({
        content_hash: data.content_hash,
        metrics: data.metrics,
        session_id: data.session.id,
      });
      const isValid = await window.crypto.subtle.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        publicKey,
        signature,
        new TextEncoder().encode(dataToVerify),
      );

      setVerificationStatus(isValid ? "valid" : "invalid");
      if (isValid) toast.success("Signature verified");
      else toast.error("Signature verification failed");
    } catch {
      setVerificationStatus("invalid");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  }, []);

  const verdict =
    data?.classification?.verdict ||
    data?.classification?.class_label ||
    "unverified";
  const isHuman = data?.classification?.is_human === true;
  const confidence = (data?.classification?.confidence || 0) * 100;

  const getVerdictConfig = (v: string) => {
    const configs: Record<
      string,
      { label: string; color: string; bg: string; border: string }
    > = {
      human_verified: {
        label: "Human Verified",
        color: "text-green-700",
        bg: "bg-green-50",
        border: "border-green-200",
      },
      human_organic: {
        label: "Human Typing",
        color: "text-green-700",
        bg: "bg-green-50",
        border: "border-green-200",
      },
      human: {
        label: "Human",
        color: "text-green-700",
        bg: "bg-green-50",
        border: "border-green-200",
      },
      ai_detected: {
        label: "AI Detected",
        color: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
      },
      ai_generated: {
        label: "AI Generated",
        color: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
      },
      paste: {
        label: "Paste Detected",
        color: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
      },
      paste_detected: {
        label: "Paste Detected",
        color: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
      },
      ai_assisted: {
        label: "AI Assisted",
        color: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-200",
      },
      mixed_signals: {
        label: "Mixed Signals",
        color: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-200",
      },
      unverified: {
        label: "Unverified",
        color: "text-slate-600",
        bg: "bg-slate-50",
        border: "border-slate-200",
      },
      unknown: {
        label: "Unknown",
        color: "text-slate-600",
        bg: "bg-slate-50",
        border: "border-slate-200",
      },
      waiting: {
        label: "Analyzing",
        color: "text-blue-600",
        bg: "bg-blue-50",
        border: "border-blue-200",
      },
    };
    return configs[v] || configs.unverified;
  };

  const config = getVerdictConfig(verdict);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Navigation />
      <div className="flex-1 p-8 max-w-5xl mx-auto w-full">
        {!data ? (
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            className={cn(
              "border-2 border-dashed rounded-xl h-[400px] flex flex-col items-center justify-center gap-6 transition-colors",
              isDragOver
                ? "border-blue-400 bg-blue-50"
                : "border-slate-300 bg-white",
            )}
          >
            <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
              <FileUp className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-xl text-slate-900">
                Upload HumanSign File
              </h3>
              <p className="text-slate-500 mt-1">
                Drop your .zip or .humanSign file here
              </p>
            </div>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".zip,.humanSign,.txt"
              onChange={(e) =>
                e.target.files?.[0] && handleFile(e.target.files[0])
              }
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              Browse Files
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  Verification Report
                </h1>
                <p className="text-slate-500 text-sm mt-0.5">{fileName}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setData(null);
                  setDocumentContent("");
                }}
              >
                New File
              </Button>
            </div>

            {/* Verdict Card */}
            <Card className={cn("p-6 border-2", config.border, config.bg)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center",
                      isHuman ? "bg-green-100" : "bg-red-100",
                    )}
                  >
                    {isHuman ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Classification</p>
                    <p className={cn("text-xl font-semibold", config.color)}>
                      {config.label}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Confidence</p>
                  <p className="text-3xl font-semibold text-slate-900">
                    {confidence.toFixed(0)}%
                  </p>
                </div>
              </div>
              {/* Confidence bar */}
              <div className="mt-4 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    isHuman ? "bg-green-500" : "bg-red-500",
                  )}
                  style={{ width: `${confidence}%` }}
                />
              </div>
            </Card>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 bg-white border border-slate-200">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center",
                      verificationStatus === "valid"
                        ? "bg-green-100 text-green-600"
                        : verificationStatus === "invalid"
                          ? "bg-red-100 text-red-600"
                          : "bg-slate-100 text-slate-400",
                    )}
                  >
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Signature</p>
                    <p className="font-medium text-slate-900">
                      {verificationStatus === "valid"
                        ? "Valid"
                        : verificationStatus === "invalid"
                          ? "Invalid"
                          : "Missing"}
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-white border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Duration</p>
                    <p className="font-medium text-slate-900">
                      {Math.round((data.session?.duration_ms || 0) / 1000)}s
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-5 gap-3">
              <MetricCard
                icon={Keyboard}
                label="Keystrokes"
                value={data.metrics.total_keystrokes.toLocaleString()}
              />
              <MetricCard icon={Zap} label="WPM" value={data.metrics.wpm} />
              <MetricCard
                icon={BarChart3}
                label="Dwell"
                value={`${data.metrics.avg_dwell_ms}ms`}
              />
              <MetricCard
                icon={BarChart3}
                label="Flight"
                value={`${data.metrics.avg_flight_ms}ms`}
              />
              <MetricCard
                icon={FileText}
                label="Chars"
                value={data.metrics.text_length.toLocaleString()}
              />
            </div>

            {/* Histograms */}
            <div className="grid grid-cols-2 gap-4">
              <Histogram
                title="Dwell Time"
                data={data.timing_data?.dwell_histogram}
              />
              <Histogram
                title="Flight Time"
                data={data.timing_data?.flight_histogram}
              />
            </div>

            {/* Document Preview */}
            {documentContent && (
              <Card className="p-4 bg-white border border-slate-200">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Document Preview
                </p>
                <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-auto">
                  <pre className="text-sm text-slate-600 whitespace-pre-wrap font-mono">
                    {documentContent.slice(0, 1500)}
                    {documentContent.length > 1500 && "..."}
                  </pre>
                </div>
              </Card>
            )}

            {/* Technical Details */}
            <Card className="p-4 bg-white border border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-3">
                Technical Details
              </p>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <Detail label="Version" value={data.version} />
                <Detail label="Domain" value={data.session?.domain} />
                <Detail label="Algorithm" value={data.signature?.algorithm} />
                <Detail
                  label="Generated"
                  value={new Date(data.generated_at).toLocaleDateString()}
                />
              </div>
              <p className="text-xs text-slate-400 mt-3 font-mono truncate">
                Hash: {data.content_hash}
              </p>
            </Card>
          </div>
        )}
      </div>
      <Toaster />
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-3 bg-white border border-slate-200 text-center">
      <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1" />
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </Card>
  );
}

function Histogram({ title, data }: { title: string; data: number[] }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  return (
    <Card className="p-4 bg-white border border-slate-200">
      <p className="text-sm font-medium text-slate-700 mb-3">{title}</p>
      <div className="flex items-end h-20 gap-0.5">
        {data.map((val, i) => (
          <div
            key={i}
            className="flex-1 bg-slate-300 rounded-t hover:bg-slate-400 transition-colors"
            style={{
              height: `${(val / max) * 100}%`,
              minHeight: val > 0 ? "2px" : "0",
            }}
            title={`${val} events`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>Fast</span>
        <span>Slow</span>
      </div>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="font-medium text-slate-900 truncate">{value}</p>
    </div>
  );
}
