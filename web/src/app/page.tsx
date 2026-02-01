'use client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, FileText, Code2, ShieldCheck } from 'lucide-react';
import { Navigation } from '@/components/layout/navigation';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Navigation />

      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-5xl mx-auto">
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
            New: Signature Verification
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl text-slate-900">
            Verify Humanity with <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Keystroke Dynamics
            </span>
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            A secure platform for content creation that proves you're human.
            Write docs, code, and verify signatures instantly.
          </p>

          <div className="flex gap-4 justify-center pt-4">
            <Link href="/docs">
              <Button size="lg" className="h-12 px-8 text-lg gap-2 bg-blue-600 hover:bg-blue-700">
                <FileText className="h-5 w-5" />
                Start Writing
              </Button>
            </Link>
            <Link href="/decoder">
              <Button size="lg" variant="outline" className="h-12 px-8 text-lg gap-2">
                <ShieldCheck className="h-5 w-5" />
                Verify File
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 w-full text-left">
          <FeatureCard
            icon={FileText}
            title="Google Docs Replica"
            description="Write articles and essays with our familiar rich-text editor, fully tracked by HumanSign."
            href="/docs"
          />
          <FeatureCard
            icon={Code2}
            title="Code Editor"
            description="Write and execute code with Monaco editor. Verify human coding patterns vs AI pastes."
            href="/code"
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Secure Decoder"
            description="Drag & drop verified files to validate cryptographic signatures and view detailed metrics."
            href="/decoder"
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ icon: Icon, title, description, href }: any) {
  return (
    <Link href={href} className="group">
      <div className="bg-white p-6 rounded-xl border shadow-sm hover:shadow-md transition-all hover:border-blue-200 h-full">
        <div className="h-12 w-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="font-bold text-xl mb-2 text-slate-900">{title}</h3>
        <p className="text-slate-600 leading-relaxed">{description}</p>
        <div className="mt-4 flex items-center text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          Try now <ArrowRight className="ml-1 h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
