'use client';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { FileText, Code2, ShieldCheck, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navigation() {
    const pathname = usePathname();

    const links = [
        { href: '/', label: 'Home', icon: Home },
        { href: '/docs', label: 'Docs Editor', icon: FileText },
        { href: '/code', label: 'Code Editor', icon: Code2 },
        { href: '/decoder', label: 'Decoder', icon: ShieldCheck },
    ];

    return (
        <nav className="h-16 border-b bg-white flex items-center justify-between px-6 sticky top-0 z-50">
            <div className="flex items-center gap-2">
                <img src="/favicon.png" alt="HumanSign" className="h-8 w-8" />
                <span className="font-bold text-xl tracking-tight text-slate-900">HumanSign</span>
            </div>

            <div className="flex items-center gap-1">
                {links.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href}>
                        <Button
                            variant="ghost"
                            className={cn(
                                "gap-2 text-slate-600",
                                pathname === href && "bg-slate-100 text-slate-900 font-medium"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </Button>
                    </Link>
                ))}
            </div>

            <div className="flex items-center gap-4">
                <img src="/favicon.png" alt="User" className="h-8 w-8 rounded-full border border-slate-200" />
            </div>
        </nav>
    );
}
