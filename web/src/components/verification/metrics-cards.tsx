import {
    Keyboard,
    Zap,
    Timer,
    Plane,
    FileText
} from 'lucide-react';

interface MetricsCardsProps {
    keystrokes: number;
    wpm: number;
    avgDwell: number;
    avgFlight: number;
    chars: number;
}

export function MetricsCards({ keystrokes, wpm, avgDwell, avgFlight, chars }: MetricsCardsProps) {
    return (
        <div className="grid grid-cols-5 gap-3 mb-6">
            <Card
                icon={Keyboard}
                label="Keystrokes"
                value={keystrokes.toLocaleString()}
                unit=""
            />
            <Card
                icon={Zap}
                label="Typing Speed"
                value={wpm.toFixed(1)}
                unit="WPM"
            />
            <Card
                icon={Timer}
                label="Avg Dwell"
                value={avgDwell.toFixed(1)}
                unit="ms"
            />
            <Card
                icon={Plane}
                label="Avg Flight"
                value={avgFlight.toFixed(1)}
                unit="ms"
            />
            <Card
                icon={FileText}
                label="Characters"
                value={chars.toLocaleString()}
                unit=""
            />
        </div>
    );
}

function Card({ icon: Icon, label, value, unit }: { icon: any, label: string, value: string, unit: string }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold text-slate-800 mb-1">
                {value}
                {unit && <span className="text-sm font-medium text-slate-400 ml-1">{unit}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <Icon className="w-3.5 h-3.5" />
                {label}
            </div>
        </div>
    );
}
