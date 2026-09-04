'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadChatEnvironment(file = path.resolve('.env')) {
  if (fs.existsSync(file) && typeof process.loadEnvFile === 'function') process.loadEnvFile(file);
}

function chatConfig(env = process.env) {
  return {
    model: String(env.CHAT_LLM_MODEL || env.OPENAI_MODEL || 'gpt-5.1').trim(),
    apiKey: String(env.CHAT_LLM_API_KEY || env.OPENAI_API_KEY || '').trim(),
    baseUrl: String(env.CHAT_LLM_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    systemPrompt: String(env.CHAT_SYSTEM_PROMPT || [
      'You are Board Agent, an operations assistant for Agent Board.',
      'Use the connected Agent Board MCP tools whenever board data must be inspected or changed.',
      'Help users plan and deliver work across organizations, projects, boards, backlogs, sprints, issues, teams, and agents.',
      'Resolve names and issue keys with read tools before making changes when an identifier is ambiguous.',
      'Use purpose-built issue and sprint tools instead of generic record tools when one is available.',
      'Before a destructive or broad change, state what will be affected and ask for confirmation unless the user already explicitly requested that exact change.',
      'Be concise and accurate. Never invent board state, and never claim an operation succeeded unless its tool result confirms it.',
      'Summarize completed mutations with the affected issue key, project, sprint, or record identifier.',
      'When the user asks for a graphic, diagram, chart, plot, graph, map, or other visual, respond with a self-contained SVG in a fenced svg code block.',
      'SVG output must include xmlns, a viewBox, and a descriptive title, and use inline SVG elements and styles only. Never include scripts, event handlers, foreignObject elements, external assets, Mermaid, ASCII art, or raster-image links.'
    ].join(' ')),
    maxToolTurns: Math.max(1, Math.min(30, Number(env.CHAT_MAX_TOOL_TURNS || 12)))
  };
}

module.exports = { chatConfig, loadChatEnvironment };
