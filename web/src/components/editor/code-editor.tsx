'use client';

import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Play, Loader2, Moon, Sun, Trash2, Code2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function CodeEditor() {
    const [code, setCode] = useState(`// Programiz Replica - JavaScript Compiler

// Function to check if a number is prime
function checkPrime(number) {
    if (number <= 1) {
        return false;
    } else {
        for (let i = 2; i < number; i++) {
            if (number % i == 0) {
                return false;
            }
        }
        return true;
    }
}

// Test the function
const num = 17;
if (checkPrime(num)) {
    console.log(num + " is a prime number.");
} else {
    console.log(num + " is not a prime number.");
}

console.log("HumanSign Verification Ready.");
`);

    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(true);

    const handleRun = async () => {
        setIsRunning(true);
        setOutput('');

        // Artificial delay for realism
        await new Promise(r => setTimeout(r, 400));

        try {
            const logs: string[] = [];

            // Create a safe console proxy
            const consoleProxy = {
                log: (...args: any[]) => {
                    logs.push(args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                    ).join(' '));
                },
                error: (...args: any[]) => {
                    logs.push('Error: ' + args.join(' '));
                },
                warn: (...args: any[]) => {
                    logs.push('Warning: ' + args.join(' '));
                }
            };

            // Wrapped execution
            const runCode = new Function('console', code);
            runCode(consoleProxy);

            setOutput(logs.join('\n'));
            if (logs.length === 0) setOutput('No output returned.');

        } catch (e: any) {
            setOutput(`Error: ${e.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const handleClear = () => {
        setOutput('');
    };

    return (
        <div className={`flex flex-col h-screen overflow-hidden ${isDarkMode ? 'bg-[#1C2130]' : 'bg-white'}`}>
            {/* Top Toolbar - Programiz Style */}
            <div className={`h-16 flex items-center justify-between px-6 border-b shrink-0 ${isDarkMode ? 'bg-[#1C2130] border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center text-white">
                        <Code2 className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className={`font-bold text-lg leading-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                            Online JavaScript Compiler
                        </h1>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                            Powered by HumanSign
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-slate-100 text-slate-600'}`}
                    >
                        {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </button>

                    <Button
                        onClick={handleRun}
                        disabled={isRunning}
                        className="bg-[#2955BF] hover:bg-[#1e40a0] text-white px-6 font-semibold h-10 rounded-lg shadow-sm border border-transparent"
                    >
                        {isRunning ? (
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        ) : (
                            <Play className="h-5 w-5 mr-2 fill-current" />
                        )}
                        Run
                    </Button>
                </div>
            </div>

            {/* Split View */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Code Editor */}
                <div className="flex-1 flex flex-col min-w-0 border-r border-gray-700">
                    <div className={`flex items-center justify-between px-4 py-2 text-sm font-sans ${isDarkMode ? 'bg-[#1C2130] text-gray-400' : 'bg-gray-50 text-slate-600'} border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500" />
                            <span>main.js</span>
                        </div>
                    </div>
                    <div className="flex-1 relative">
                        <Editor
                            height="100%"
                            defaultLanguage="javascript"
                            theme={isDarkMode ? "vs-dark" : "light"}
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                lineNumbers: 'on',
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 16 },
                                fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
                                fontLigatures: true,
                            }}
                            onMount={(editor, monaco) => {
                                // Register command to handle AI insertion events
                                try {
                                    monaco.editor.registerCommand('humanSign.aiInserted', (_: any, text: string) => {
                                        setTimeout(() => {
                                            setTimeout(() => {
                                                window.postMessage({
                                                    type: 'humanSign:aiInsert',
                                                    text: text
                                                }, '*');
                                            }, 10);
                                        }, 10);
                                    });
                                } catch (e) { /* Command might exist */ }

                                // Register AI Autocomplete Provider (Real AI)
                                monaco.languages.registerCompletionItemProvider('javascript', {
                                    triggerCharacters: [' '],
                                    provideCompletionItems: async (model: any, position: any) => {
                                        const word = model.getWordUntilPosition(position);
                                        const range = {
                                            startLineNumber: position.lineNumber,
                                            endLineNumber: position.lineNumber,
                                            startColumn: word.startColumn,
                                            endColumn: word.endColumn,
                                        };

                                        // Only fetch if explicitly triggered or typing 'ai'
                                        const textUntilPosition = model.getValueInRange({
                                            startLineNumber: 1,
                                            startColumn: 1,
                                            endLineNumber: position.lineNumber,
                                            endColumn: position.column
                                        });

                                        if (!textUntilPosition.endsWith('ai') && !textUntilPosition.endsWith('// ')) {
                                            // Return empty (or standard completions) to avoid spamming API
                                            // But for demo, let's allow 'Ctrl+Space' (which invokes this)
                                            // We return a "trigger" item
                                            return { suggestions: [] };
                                        }

                                        try {
                                            const context = textUntilPosition.slice(-500);
                                            const response = await fetch('/api/generate', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    context: undefined,
                                                    prompt: "Generate JavaScript code to complete this:\n" + context
                                                })
                                            });
                                            const data = await response.json();

                                            if (!data.content) return { suggestions: [] };

                                            return {
                                                suggestions: [
                                                    {
                                                        label: '✨ AI Generate',
                                                        kind: monaco.languages.CompletionItemKind.Snippet,
                                                        detail: 'Arcee Trinity AI',
                                                        documentation: data.content,
                                                        insertText: data.content,
                                                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                                        range: range,
                                                        command: {
                                                            id: 'humanSign.aiInserted',
                                                            title: 'AI Inserted',
                                                            arguments: [data.content]
                                                        }
                                                    }
                                                ],
                                            };
                                        } catch (e) {
                                            console.error("AI Code Fetch Error", e);
                                            return { suggestions: [] };
                                        }
                                    },
                                });
                            }}
                        />
                    </div>
                </div>

                {/* Right: Output Terminal */}
                <div className={`w-[40%] flex flex-col min-w-[300px] ${isDarkMode ? 'bg-[#0F0F1A]' : 'bg-white'}`}>
                    <div className={`flex items-center justify-between px-4 py-2 border-b ${isDarkMode ? 'bg-[#0F0F1A] border-gray-800' : 'bg-white border-gray-200'}`}>
                        <span className={`text-sm font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                            Output
                        </span>
                        <button
                            onClick={handleClear}
                            className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${isDarkMode ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                        >
                            <Trash2 className="h-3 w-3" />
                            Clear
                        </button>
                    </div>
                    <div className={`flex-1 p-4 font-mono text-sm overflow-auto ${isDarkMode ? 'text-gray-300' : 'text-slate-800'}`}>
                        {output ? (
                            <pre className="whitespace-pre-wrap">{output}</pre>
                        ) : (
                            <div className={`italic select-none mt-2 ${isDarkMode ? 'text-gray-600' : 'text-slate-400'}`}>
                                // Output will be displayed here
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
