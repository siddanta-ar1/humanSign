'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// New Components
import { MetricsCards } from './metrics-cards';
import { ContentOriginChart } from './content-origin-chart';
import { BiometricPatternsChart } from './biometric-patterns-chart';

interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string | null;
}

export function VerificationModal({ isOpen, onClose, sessionId }: VerificationModalProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    // Use 'any' to accommodate dynamic backend response structure
    const [result, setResult] = useState<any | null>(null);

    const runVerification = async () => {
        if (!sessionId) {
            toast.error("No active session found. Start typing.");
            return;
        }

        setIsAnalyzing(true);
        setResult(null);

        try {
            const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';
            const res = await fetch(`${API_BASE}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            });

            if (!res.ok) {
                const err = await res.json();
                if (res.status === 400) {
                    toast.warning("Insufficient Data", {
                        description: "Please type a bit more for accurate verification."
                    });
                    return;
                }
                throw new Error(err.detail || 'Verification failed');
            }

            const data = await res.json();
            setResult(data);
        } catch (error: any) {
            console.error(error);
            toast.error(error.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const features = result?.features_summary || {};

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden flex flex-col bg-[#F9FAFB]">
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b bg-white">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <ShieldCheck className="w-6 h-6 text-blue-600" />
                            Verification Analysis
                        </DialogTitle>
                    </div>
                    <DialogDescription className="hidden">
                        Verification Dashboard
                    </DialogDescription>
                </DialogHeader>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isAnalyzing ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4">
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                            <p className="text-slate-500 font-medium">Analyzing keystroke dynamics & biometric patterns...</p>
                        </div>
                    ) : result ? (
                        <div className="space-y-6">
                            {/* 1. Metrics Cards Row */}
                            <MetricsCards
                                keystrokes={features.total_keystrokes || 0}
                                wpm={features.avg_wpm || 0}
                                avgDwell={features.avg_dwell_time || 0}
                                avgFlight={features.avg_flight_time || 0}
                                chars={features.total_keystrokes || 0} // Fallback if chars different
                            />

                            {/* 2. Charts Grid */}
                            <div className="grid grid-cols-3 gap-6 h-[400px]">
                                {/* Content Origin - 1 Column */}
                                <ContentOriginChart
                                    typed={features.volume_human || 0}
                                    pasted={features.volume_paste || 0}
                                    ai={features.volume_ai || 0}
                                />

                                {/* Biometric Patterns - 2 Columns */}
                                <BiometricPatternsChart
                                    dwellHistogram={features.dwell_histogram || []}
                                    flightHistogram={features.flight_histogram || []}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-6">
                            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                                <ShieldCheck className="w-12 h-12 text-blue-500" />
                            </div>
                            <h3 className="text-xl font-semibold text-slate-800">Ready to Verify</h3>
                            <p className="text-slate-500 max-w-sm text-center">
                                Analyze your typing patterns to generate a comprehensive biometric report.
                            </p>
                            <Button onClick={runVerification} size="lg" className="px-8 mt-4 bg-blue-600 hover:bg-blue-700">
                                Run Full Analysis
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
