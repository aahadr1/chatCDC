import Replicate from 'replicate';
import { ReplicateRequest, ReplicateResponse } from '@/types/chat';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const MODEL_NAME = 'openai/gpt-5-structured';

export async function sendMessageToReplicate(
  request: ReplicateRequest
): Promise<ReplicateResponse> {
  try {
    if (!REPLICATE_API_TOKEN) {
      throw new Error('Missing REPLICATE_API_TOKEN environment variable');
    }

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    const input: Record<string, any> = {};
    if (request.model) input.model = request.model;
    if (request.prompt) input.prompt = request.prompt;
    if (request.instructions) input.instructions = request.instructions;
    if (request.image_input && request.image_input.length > 0) input.image_input = request.image_input;
    if (request.reasoning_effort) input.reasoning_effort = request.reasoning_effort;
    if (request.verbosity) input.verbosity = request.verbosity;
    if (typeof request.enable_web_search === 'boolean') input.enable_web_search = request.enable_web_search;
    if (request.max_output_tokens) input.max_output_tokens = request.max_output_tokens;
    if (request.tools && request.tools.length > 0) input.tools = request.tools;
    if (request.json_schema && Object.keys(request.json_schema).length > 0) input.json_schema = request.json_schema;
    if (request.simple_schema && request.simple_schema.length > 0) input.simple_schema = request.simple_schema;
    if (request.input_item_list && request.input_item_list.length > 0) input.input_item_list = request.input_item_list;

    if (request.previous_response_id && /^resp_/.test(request.previous_response_id)) {
      input.previous_response_id = request.previous_response_id;
    }

    const output: any = await replicate.run(MODEL_NAME, { input });

    const text = typeof output === 'string' ? output : output?.text;
    const responseId = typeof output === 'object' && output ? output.response_id : undefined;

    if (!text) {
      throw new Error('Empty response from Replicate model');
    }

    return {
      text,
      response_id: responseId || '',
    };
  } catch (error) {
    console.error('Error calling Replicate API:', error);
    throw error;
  }
}


