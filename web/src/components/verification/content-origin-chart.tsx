
interface ContentOriginChartProps {
    typed: number;
    pasted: number;
    ai: number;
}

export function ContentOriginChart({ typed, pasted, ai }: ContentOriginChartProps) {
    const total = typed + pasted + ai;
    const typedPct = total > 0 ? (typed / total) * 100 : 0;
    // const pastedPct = total > 0 ? (pasted / total) * 100 : 0; // Not strictly needed for single-slice donut overlay visualization
    // const aiPct = total > 0 ? (ai / total) * 100 : 0;

    // Simple Donut Logic:
    // Base circle = Pasted/AI (Orange/Red/Purple)
    // Overlay circle = Typed (Blue)

    // Determine non-human color based on AI vs Paste presence
    const nonHumanColor = ai > pasted ? "text-amber-400" : "text-orange-400";
    const nonHumanLabel = ai > pasted ? "AI / Other" : "Pasted";
    const nonHumanValue = pasted + ai;

    // Stroke Dash Array Calculation
    // C = 2 * PI * R
    // R = 40 (approx) -> C = 251.2
    const CIRCUMFERENCE = 251.2;
    const strokeDashoffset = CIRCUMFERENCE - (typedPct / 100) * CIRCUMFERENCE;

    return (
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm h-full flex flex-col">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-6">
                <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center">
                    <div className="w-2 h-2 bg-slate-400 rounded-full slice-pie" />
                </div>
                Content Origin
            </h3>

            <div className="flex-1 flex items-center justify-center relative">
                {/* SVG Donut */}
                <div className="relative w-40 h-40">
                    <svg className="w-full h-full transform -rotate-90">
                        {/* Background Circle (Non-human part) */}
                        <circle
                            cx="50%"
                            cy="50%"
                            r="40"
                            fill="transparent"
                            stroke="currentColor"
                            strokeWidth="10"
                            className={nonHumanColor}
                        />
                        {/* Foreground Circle (Typed part) */}
                        <circle
                            cx="50%"
                            cy="50%"
                            r="40"
                            fill="transparent"
                            stroke="currentColor"
                            strokeWidth="10"
                            strokeLinecap="round"
                            className="text-blue-600 transition-all duration-1000 ease-out"
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={strokeDashoffset}
                        />
                    </svg>
                    {/* Center Text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-slate-800">
                            {Math.round(typedPct)}%
                        </span>
                        <span className="text-xs font-semibold text-slate-400 uppercase">Typed</span>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="mt-8 space-y-3">
                <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-600" />
                        <span className="text-sm font-medium text-slate-700">Typed</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{typed} chars</span>
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${ai > pasted ? "bg-amber-400" : "bg-orange-400"}`} />
                        <span className="text-sm font-medium text-slate-700">{nonHumanLabel}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{nonHumanValue} chars</span>
                </div>
            </div>
        </div>
    );
}
