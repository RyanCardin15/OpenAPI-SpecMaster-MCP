#!/usr/bin/env node

import { OpenAPIExplorerHTTPServer } from './mcp/http-server.js';
import { OpenAPIExplorerMCPServer } from './mcp/server.js';

const argument = process.argv[2];

if (argument === 'http') {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  const server = new OpenAPIExplorerHTTPServer(port);
  server.start();
} else {
  const server = new OpenAPIExplorerMCPServer();
  server.run();
}