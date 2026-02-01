'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Bot, Send, User, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export function AISidebar() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Hello! I can help you write documents or debug code. What are you working on?'
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        // Simulate AI response
        setTimeout(() => {
            const responses = [
                "That's an interesting point! You could elaborate on the keystroke dynamics part.",
                "I suggest optimizing the verifyUser function using a sliding window approach.",
                "Have you considered adding biometric analysis to the verification?",
                "Here's a tip: Consistent typing rhythm is key to high confidence scores.",
            ];

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: responses[Math.floor(Math.random() * responses.length)]
            };

            setMessages(prev => [...prev, aiMsg]);
            setIsTyping(false);
        }, 1500);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] w-80 border-l bg-slate-50">
            {/* Header */}
            <div className="p-4 border-b bg-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold text-slate-800">AI Assistant</h3>
            </div>

            {/* Chat Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 flex flex-col gap-4"
            >
                {messages.map(msg => (
                    <div
                        key={msg.id}
                        className={cn(
                            "flex gap-3",
                            msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                        )}
                    >
                        <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                            msg.role === 'user' ? "bg-blue-600 text-white" : "bg-purple-600 text-white"
                        )}>
                            {msg.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                        </div>
                        <Card className={cn(
                            "p-3 max-w-[85%] text-sm",
                            msg.role === 'user'
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-slate-800"
                        )}>
                            {msg.content}
                        </Card>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex gap-3">
                        <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center">
                            <Bot className="h-5 w-5" />
                        </div>
                        <div className="bg-white p-3 rounded-lg border flex gap-1 items-center">
                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t bg-white">
                <div className="flex gap-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask anything..."
                        className="bg-slate-50"
                    />
                    <Button onClick={handleSend} size="icon" className="bg-purple-600 hover:bg-purple-700">
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
