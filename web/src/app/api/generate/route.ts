
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { prompt, context } = await req.json();

        if (!prompt && !context) {
            return NextResponse.json({ error: 'Prompt or context required' }, { status: 400 });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
        }

        const systemPrompt = "You are an intelligent writing and coding assistant. meaningful completion based on the context provided. Keep it concise (1-2 sentences or 5 lines of code). Do not repeat the input.";

        const finalPrompt = context
            ? `Context:\n${context}\n\nTask: Complete the text starting from here.`
            : prompt;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "HumanSign" // Optional
            },
            body: JSON.stringify({
                "model": "arcee-ai/trinity-large-preview:free",
                "messages": [
                    { "role": "system", "content": systemPrompt },
                    { "role": "user", "content": finalPrompt }
                ],
                "max_tokens": 100,
                "temperature": 0.7,
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('OpenRouter Error:', data.error);
            return NextResponse.json({ error: data.error.message }, { status: 500 });
        }

        const content = data.choices?.[0]?.message?.content || "";

        return NextResponse.json({ content });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
