import { NextRequest, NextResponse } from 'next/server';
import { createBrowserSupabaseClient } from '@/lib/supabaseClient';

async function extractTextFromPDF(file: File): Promise<string> {
  try {
    // Dynamic import to avoid build-time issues with pdf-parse
    const pdf = (await import('pdf-parse')).default;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdf(buffer);
    
    if (!data.text || data.text.trim().length === 0) {
      return `[No readable text found in ${file.name}]\n\nThis PDF may contain only images or scanned content that requires OCR processing.`;
    }
    
    return data.text.trim();
  } catch (error) {
    console.error(`Error extracting text from ${file.name}:`, error);
    return `[Error extracting text from ${file.name}]\n\nFailed to process this PDF file. It may be corrupted or password-protected.`;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { projectId } = params;

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Validate files
    const validFiles = files.filter(file => 
      file instanceof File && 
      file.type === 'application/pdf' && 
      file.size > 0 && 
      file.size <= 10 * 1024 * 1024 // 10MB limit
    );

    if (validFiles.length === 0) {
      return NextResponse.json(
        { error: 'No valid PDF files found' },
        { status: 400 }
      );
    }

    if (validFiles.length > 20) {
      return NextResponse.json(
        { error: 'Maximum 20 files allowed' },
        { status: 400 }
      );
    }

    // Process files and extract text
    const documents = [];
    let allExtractedText = '';

    for (const file of validFiles) {
      try {
        const extractedText = await extractTextFromPDF(file);
        allExtractedText += `\n\n--- Document: ${file.name} ---\n${extractedText}`;

        documents.push({
          project_id: projectId,
          filename: file.name,
          file_size: file.size,
          extracted_text: extractedText,
          processed_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        // Continue with other files
      }
    }

    if (documents.length === 0) {
      return NextResponse.json(
        { error: 'Failed to process any files' },
        { status: 500 }
      );
    }

    // Save documents to database
    const { error: insertError } = await supabase
      .from('project_documents')
      .insert(documents);

    if (insertError) {
      console.error('Error saving documents:', insertError);
      return NextResponse.json(
        { error: 'Failed to save documents' },
        { status: 500 }
      );
    }

    // Update project with combined text and status
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        extracted_text: allExtractedText,
        document_count: documents.length,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('Error updating project:', updateError);
      return NextResponse.json(
        { error: 'Failed to update project' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      processedFiles: documents.length,
      totalFiles: validFiles.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
