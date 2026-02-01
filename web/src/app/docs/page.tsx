'use client';

import { DocumentEditor } from '@/components/editor/document-editor';
import { Toaster } from "@/components/ui/sonner";

export default function DocsPage() {
    return (
        <main className="min-h-screen bg-[#F9FBFD] flex flex-col">
            <DocumentEditor />
            <Toaster />
        </main>
    );
}
