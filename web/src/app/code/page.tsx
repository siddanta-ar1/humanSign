'use client';

import { CodeEditor } from '@/components/editor/code-editor';
import { Toaster } from "@/components/ui/sonner";

export default function CodePage() {
    return (
        <main className="min-h-screen bg-[#1e1e1e] flex flex-col">
            <CodeEditor />
            <Toaster />
        </main>
    );
}
