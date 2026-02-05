"use client";

import { motion } from "framer-motion";

interface BiometricPatternsChartProps {
    dwellHistogram: number[];
    flightHistogram: number[];
}

export function BiometricPatternsChart({ dwellHistogram, flightHistogram }: BiometricPatternsChartProps) {
    return (
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-2 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-6">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4 text-purple-600"
                >
                    <path d="M12 3v18" />
                    <path d="M6 8l-4 4 4 4" />
                    <path d="M18 8l4 4-4 4" />
                </svg>
                Biometric Typing Patterns
            </h3>

            <div className="grid grid-cols-2 gap-8 h-full">
                {/* Dwell Chart */}
                <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Key Hold Duration (Dwell)</span>
                        <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-mono">ms</span>
                    </div>
                    <div className="flex-1 bg-slate-50/50 rounded-lg p-4 flex items-end justify-between gap-1 border border-slate-100 relative overflow-hidden">
                        {dwellHistogram.map((height, i) => (
                            <motion.div
                                key={`dwell-${i}`}
                                initial={{ height: 0 }}
                                animate={{ height: `${Math.max(4, height)}%` }} // Minimum height 4% for visibility
                                transition={{ duration: 0.5, delay: i * 0.02 }}
                                className="flex-1 bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors"
                                title={`Bin ${i}: ${height}% intensity`}
                            />
                        ))}
                    </div>
                </div>

                {/* Flight Chart */}
                <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Key Flight Interval</span>
                        <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-mono">ms</span>
                    </div>
                    <div className="flex-1 bg-slate-50/50 rounded-lg p-4 flex items-end justify-between gap-1 border border-slate-100 relative overflow-hidden">
                        {flightHistogram.map((height, i) => (
                            <motion.div
                                key={`flight-${i}`}
                                initial={{ height: 0 }}
                                animate={{ height: `${Math.max(4, height)}%` }}
                                transition={{ duration: 0.5, delay: 0.2 + (i * 0.02) }}
                                className="flex-1 bg-purple-500 rounded-t-sm hover:bg-purple-600 transition-colors"
                                title={`Bin ${i}: ${height}% intensity`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-3 gap-8">
                <StatItem label="Pattern Match" value="99.4%" sub="Similarity to human baseline" color="text-blue-600" />
                <StatItem label="Overall Confidence" value="99.4%" sub="Weighted system verification score" color="text-slate-900" />
                <StatItem label="Capture" value="237" sub="Total validated events" color="text-slate-900" />
            </div>
        </div>
    );
}

function StatItem({ label, value, sub, color }: { label: string, value: string, sub: string, color: string }) {
    return (
        <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-2xl font-bold ${color} mb-0.5`}>{value}</div>
            <div className="text-[10px] text-slate-400 font-medium">{sub}</div>
        </div>
    )
}
