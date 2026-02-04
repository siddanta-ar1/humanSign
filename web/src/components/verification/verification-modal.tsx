'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    ShieldCheck,
    ShieldAlert,
    Loader2,
    Info,
    Download,
    HelpCircle,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Copy
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from 'sonner';

interface VerificationResult {
    is_human: boolean;
    confidence_score: number;
    feedback: string;
    features_summary: any;
}

interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string | null;
}

export function VerificationModal({ isOpen, onClose, sessionId }: VerificationModalProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<VerificationResult | null>(null);

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
                // Special handling for 400 Bad Request (Insufficient keystrokes)
                if (res.status === 400) {
                    setResult({
                        is_human: false,
                        confidence_score: 0,
                        feedback: "Insufficient Data: Please type at least 100 words.",
                        features_summary: {}
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

    // Auto-run on open
    // useEffect(() => {
    //    if (isOpen && sessionId) runVerification();
    // }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-blue-600" />
                            Document Verification
                        </DialogTitle>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <HelpCircle className="w-4 h-4 text-slate-400" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-4 bg-slate-900 text-slate-50 border-none shadow-xl" side="left">
                                    <div className="space-y-3 text-xs">
                                        <p className="font-semibold text-sm border-b border-slate-700 pb-2">Classification Guide</p>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-green-400 font-medium">
                                                <CheckCircle2 className="w-3 h-3" /> Human Written
                                            </div>
                                            <p className="text-slate-400 pl-5">Natural typing rhythm with normal variations in speed and pauses.</p>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-yellow-400 font-medium">
                                                <AlertTriangle className="w-3 h-3" /> AI Assisted
                                            </div>
                                            <p className="text-slate-400 pl-5">Mostly human typing but shows patterns of transcribing or heavy editing of generated text.</p>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-red-400 font-medium">
                                                <Copy className="w-3 h-3" /> Pasted / Copied
                                            </div>
                                            <p className="text-slate-400 pl-5">Large blocks of text inserted instantly or non-human typing speeds.</p>
                                        </div>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <DialogDescription>
                        Analyze typing patterns to verify authorship.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 flex flex-col items-center justify-center min-h-[140px]">
                    {isAnalyzing ? (
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                            <p className="text-sm text-slate-500">Analyzing keystroke dynamics...</p>
                        </div>
                    ) : result ? (
                        <div className="w-full text-center space-y-4">
                            <div className={`
                                mx-auto w-16 h-16 rounded-full flex items-center justify-center
                                ${result.is_human
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-amber-100 text-amber-600'}
                            `}>
                                {result.is_human
                                    ? <ShieldCheck className="w-8 h-8" />
                                    : <ShieldAlert className="w-8 h-8" />
                                }
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">
                                    {result.feedback || (result.is_human ? "Verified Human Written" : "Verification Failed")}
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Confidence: {Math.round(result.confidence_score * 100)}%
                                </p>
                            </div>

                            {!result.is_human && (
                                <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 text-left flex gap-2">
                                    <Info className="w-4 h-4 shrink-0 text-slate-400" />
                                    <span>
                                        To ensure accuracy, the system requires a substantial amount of continuous typing.
                                        Pasting text or using AI assistance will lower the confidence score.
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center">
                            <Button onClick={runVerification} size="lg" className="w-full">
                                Run Verification
                            </Button>
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-start">
                    {result?.is_human && (
                        <Button className="w-full bg-green-600 hover:bg-green-700">
                            Download Certificate
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
