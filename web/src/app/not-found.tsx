'use client';

import { Navigation } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NotFound() {
    return (
        <main className="min-h-screen bg-slate-50 flex flex-col">
            <Navigation />
            <div className="flex-1 flex flex-col items-center justify-center">
                <h2 className="text-4xl font-bold text-slate-900">404</h2>
                <p className="text-slate-500 mt-2 mb-6">Page not found</p>
                <Link href="/">
                    <Button>Go Home</Button>
                </Link>
            </div>
        </main>
    );
}
