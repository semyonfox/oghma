/*
 * Chat API Route — POST /api/chat
 * Backend entry point for the RAG chat feature
 * 1. Validate the user session
 * 2. Extract the prompt from the request body
 * 3. Pass prompt and userId into the RAG pipeline
 * 4. Return the LLM response to the frontend
 * TODO: implement cross-encoder reranker between search and prompt construction
 */

import { NextRequest, NextResponse } from 'next/server';
import { runRAGPipeline } from '@/lib/rag';
import { validateSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const { prompt } = await request.json();

    if (!prompt) {
        return NextResponse.json({ error: 'No prompt provided' }, { status: 400 });
    }

    const session = await validateSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const response = await runRAGPipeline(prompt, session.user_id);
    return NextResponse.json({ response });
}
