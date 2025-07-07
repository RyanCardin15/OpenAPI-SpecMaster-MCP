#!/usr/bin/env node

import { OpenAPIExplorerHTTPServer } from './mcp/http-server.js';
import { OpenAPIExplorerMCPServer } from './mcp/server.js';

const argument = process.argv[2];

if (argument === 'http') {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  console.log(`🚀 Starting OpenAPI Spec Master MCP Server (HTTP transport)...`);
  console.log(`📡 HTTP server will be available on port ${port}`);
  console.log(`📖 Documentation: http://localhost:${port}/docs`);
  const server = new OpenAPIExplorerHTTPServer(port);
  server.start();
} else {
  console.log('🚀 Starting OpenAPI Spec Master MCP Server (stdio transport)...');
  const server = new OpenAPIExplorerMCPServer();
  server.run();
}