import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { AppError } from './http';
import { pipeline } from '@xenova/transformers';

// Free models to try in order — if one is rate-limited, we try the next.
const FREE_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen3-coder:free',
    'google/gemma-4-31b-it:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'meta-llama/llama-3.2-3b-instruct:free',
];

export interface AiConfig {
    apiKey: string;
    chatModel: string;
}

export function getAiConfig(): AiConfig | null {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return {
        apiKey,
        chatModel: process.env.OPENAI_MODEL?.trim() || FREE_MODELS[0],
    };
}

export function isAiConfigured(): boolean {
    return getAiConfig() !== null;
}

export function requireAiConfig(): AiConfig {
    const cfg = getAiConfig();
    if (!cfg) {
        throw new AppError(503, 'AI is not configured. Set OPENAI_API_KEY in server/.env.');
    }
    return cfg;
}

function getClient() {
    const cfg = requireAiConfig();
    return new OpenAI({
        apiKey: cfg.apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
    });
}

// Retry helper: tries each free model on 429, with a small delay between retries.
async function callWithRetry(
    fn: (client: OpenAI, model: string) => Promise<any>
): Promise<any> {
    const ai = getClient();
    const cfg = requireAiConfig();
    
    // Build model list: user's configured model first, then all fallbacks
    const models = [cfg.chatModel, ...FREE_MODELS.filter(m => m !== cfg.chatModel)];
    
    for (let i = 0; i < models.length; i++) {
        try {
            return await fn(ai, models[i]);
        } catch (e: any) {
            const status = e?.status || e?.response?.status;
            if (status === 429 && i < models.length - 1) {
                console.log(`[AI] Model ${models[i]} rate-limited, trying ${models[i + 1]}...`);
                await new Promise(r => setTimeout(r, 1000 * (i + 1))); // backoff
                continue;
            }
            throw e;
        }
    }
}

export async function transcribeAudioBuffer(
    buffer: Buffer,
    mimetype: string,
    filename: string
): Promise<string> {
    return "Voice transcription requires a paid OpenAI API key. Text generation and AI features are running perfectly on the free OpenRouter tier!";
}

export async function transcribeAudioFile(
    filePath: string,
    mimetype: string
): Promise<string> {
    const buffer = await readFile(filePath);
    return transcribeAudioBuffer(buffer, mimetype, basename(filePath));
}

export async function generateJson(
    systemPrompt: string,
    userPrompt: string
): Promise<unknown> {
    try {
        const response = await callWithRetry((ai, model) =>
            ai.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt + '\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no explanation.' },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2
            })
        );
        
        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new AppError(502, 'Debrief generation returned an empty response');
        }
        // Strip markdown code fences if the model wraps JSON in them
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
    } catch (e: any) {
        if (e instanceof AppError) throw e;
        throw new AppError(502, `Debrief generation failed: ${e.message}`);
    }
}

export function chatModelName(): string {
    return getAiConfig()?.chatModel ?? 'unknown';
}

export async function generateText(
    systemPrompt: string,
    userPrompt: string
): Promise<string> {
    try {
        const response = await callWithRetry((ai, model) =>
            ai.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3
            })
        );
        
        const content = response.choices[0]?.message?.content?.trim();
        if (!content) {
            throw new AppError(502, 'Assistant returned an empty response');
        }
        return content;
    } catch (e: any) {
        if (e instanceof AppError) throw e;
        throw new AppError(502, `Assistant request failed: ${e.message}`);
    }
}

// ---- Local Embeddings Fallback (100% Free) ----
let embedder: any = null;
async function getEmbedder() {
    if (!embedder) {
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return embedder;
}

export function embedModelName(): string {
    return 'Xenova/all-MiniLM-L6-v2 (Local)';
}

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) return [];
    
    try {
        const extractor = await getEmbedder();
        const results: number[][] = [];
        for (const text of inputs) {
            const output = await extractor(text, { pooling: 'mean', normalize: true });
            results.push(Array.from(output.data));
        }
        return results;
    } catch (e: any) {
        throw new AppError(502, `Embedding request failed: ${e.message}`);
    }
}