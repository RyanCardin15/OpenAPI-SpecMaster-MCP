#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import { OpenAPIParser } from '../utils/openapi-parser.js';
import { generateAnalytics } from '../utils/analytics.js';
import { EndpointData, OpenAPISpec } from '../types/openapi.js';

class OpenAPIExplorerHTTPServer {
  private app: express.Application;
  private server: Server;
  private parser: OpenAPIParser;
  private currentSpec: OpenAPISpec | null = null;
  private currentEndpoints: EndpointData[] = [];
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
    this.app = express();
    this.parser = new OpenAPIParser();
    
    this.server = new Server(
      {
        name: 'openapi-explorer-http',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupMiddleware();
    this.setupRoutes();
    this.setupToolHandlers();
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        hasSpec: !!this.currentSpec,
        endpoints: this.currentEndpoints.length
      });
    });

    // MCP protocol endpoints
    this.app.post('/mcp/tools/list', async (req, res) => {
      try {
        const result = await this.handleListTools();
        res.json(result);
      } catch (error) {
        this.handleError(res, error);
      }
    });

    this.app.post('/mcp/tools/call', async (req, res) => {
      try {
        const { name, arguments: args } = req.body;
        const result = await this.handleCallTool(name, args);
        res.json(result);
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // Streaming endpoint for real-time updates
    this.app.get('/mcp/stream', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ 
        type: 'connection', 
        message: 'Connected to OpenAPI Explorer MCP Server',
        timestamp: new Date().toISOString()
      })}\n\n`);

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(`data: ${JSON.stringify({ 
          type: 'ping', 
          timestamp: new Date().toISOString() 
        })}\n\n`);
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });
    });

    // API information endpoint
    this.app.get('/api/info', (req, res) => {
      if (!this.currentSpec) {
        return res.status(404).json({ error: 'No OpenAPI specification loaded' });
      }

      res.json({
        title: this.currentSpec.info.title,
        version: this.currentSpec.info.version,
        description: this.currentSpec.info.description,
        endpoints: this.currentEndpoints.length,
        analytics: generateAnalytics(this.currentEndpoints)
      });
    });

    // Direct endpoint search
    this.app.get('/api/endpoints', (req, res) => {
      if (!this.currentEndpoints.length) {
        return res.status(404).json({ error: 'No endpoints available' });
      }

      const { query, method, tag, limit = 50 } = req.query;
      let filtered = [...this.currentEndpoints];

      if (query) {
        const searchTerm = (query as string).toLowerCase();
        filtered = filtered.filter(ep => 
          ep.path.toLowerCase().includes(searchTerm) ||
          ep.summary?.toLowerCase().includes(searchTerm) ||
          ep.description?.toLowerCase().includes(searchTerm)
        );
      }

      if (method) {
        filtered = filtered.filter(ep => ep.method.toLowerCase() === (method as string).toLowerCase());
      }

      if (tag) {
        filtered = filtered.filter(ep => ep.tags.includes(tag as string));
      }

      const limitNum = parseInt(limit as string);
      const results = filtered.slice(0, limitNum);

      res.json({
        total: filtered.length,
        limit: limitNum,
        results: results.map(ep => ({
          method: ep.method,
          path: ep.path,
          summary: ep.summary,
          tags: ep.tags,
          complexity: ep.complexity,
          deprecated: ep.deprecated
        }))
      });
    });

    // WebSocket-like endpoint for real-time tool execution
    this.app.post('/mcp/execute', async (req, res) => {
      const { tool, args, stream = false } = req.body;

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        try {
          // Send start event
          res.write(`data: ${JSON.stringify({ 
            type: 'start', 
            tool, 
            timestamp: new Date().toISOString() 
          })}\n\n`);

          const result = await this.handleCallTool(tool, args);

          // Send result event
          res.write(`data: ${JSON.stringify({ 
            type: 'result', 
            data: result,
            timestamp: new Date().toISOString() 
          })}\n\n`);

          // Send completion event
          res.write(`data: ${JSON.stringify({ 
            type: 'complete', 
            timestamp: new Date().toISOString() 
          })}\n\n`);

          res.end();
        } catch (error) {
          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString() 
          })}\n\n`);
          res.end();
        }
      } else {
        try {
          const result = await this.handleCallTool(tool, args);
          res.json(result);
        } catch (error) {
          this.handleError(res, error);
        }
      }
    });

    // Documentation endpoint
    this.app.get('/docs', (req, res) => {
      res.json({
        name: 'OpenAPI Explorer MCP Server',
        version: '1.0.0',
        description: 'HTTP transport for OpenAPI specification analysis and exploration',
        endpoints: {
          'GET /health': 'Server health check',
          'POST /mcp/tools/list': 'List available MCP tools',
          'POST /mcp/tools/call': 'Execute an MCP tool',
          'GET /mcp/stream': 'Server-sent events stream',
          'POST /mcp/execute': 'Execute tool with optional streaming',
          'GET /api/info': 'Get loaded API information',
          'GET /api/endpoints': 'Search endpoints directly',
          'GET /docs': 'This documentation'
        },
        tools: [
          'load_openapi_spec',
          'get_api_overview',
          'search_endpoints',
          'get_endpoint_details',
          'generate_code_examples',
          'get_api_analytics',
          'validate_api_design',
          'export_documentation'
        ]
      });
    });
  }

  private setupToolHandlers() {
    // Use the same tool handlers as the stdio server
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'load_openapi_spec',
            description: 'Load and parse an OpenAPI specification from text, URL, or file content',
            inputSchema: {
              type: 'object',
              properties: {
                source: {
                  type: 'string',
                  description: 'The source of the OpenAPI spec (text content, URL, or file content)',
                },
                sourceType: {
                  type: 'string',
                  enum: ['text', 'url'],
                  description: 'Type of source: text (JSON/YAML content) or url',
                  default: 'text',
                },
              },
              required: ['source'],
            },
          },
          {
            name: 'get_api_overview',
            description: 'Get a comprehensive overview of the loaded API including basic info, statistics, and analytics',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'search_endpoints',
            description: 'Search and filter API endpoints with advanced criteria',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for endpoint paths, summaries, or descriptions',
                },
                methods: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by HTTP methods (GET, POST, PUT, DELETE, etc.)',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by endpoint tags',
                },
                complexity: {
                  type: 'array',
                  items: { type: 'string', enum: ['low', 'medium', 'high'] },
                  description: 'Filter by endpoint complexity level',
                },
                deprecated: {
                  type: 'boolean',
                  description: 'Filter by deprecation status',
                },
                hasParameters: {
                  type: 'boolean',
                  description: 'Filter endpoints that have parameters',
                },
                hasRequestBody: {
                  type: 'boolean',
                  description: 'Filter endpoints that require a request body',
                },
              },
            },
          },
          {
            name: 'get_endpoint_details',
            description: 'Get detailed information about a specific endpoint',
            inputSchema: {
              type: 'object',
              properties: {
                method: {
                  type: 'string',
                  description: 'HTTP method (GET, POST, etc.)',
                },
                path: {
                  type: 'string',
                  description: 'Endpoint path',
                },
              },
              required: ['method', 'path'],
            },
          },
          {
            name: 'generate_code_examples',
            description: 'Generate code examples for specific endpoints in various languages',
            inputSchema: {
              type: 'object',
              properties: {
                method: {
                  type: 'string',
                  description: 'HTTP method',
                },
                path: {
                  type: 'string',
                  description: 'Endpoint path',
                },
                language: {
                  type: 'string',
                  enum: ['curl', 'javascript', 'python', 'typescript'],
                  description: 'Programming language for the example',
                  default: 'curl',
                },
              },
              required: ['method', 'path'],
            },
          },
          {
            name: 'get_api_analytics',
            description: 'Get comprehensive analytics and insights about the API',
            inputSchema: {
              type: 'object',
              properties: {
                includeDistributions: {
                  type: 'boolean',
                  description: 'Include method, tag, and complexity distributions',
                  default: true,
                },
              },
            },
          },
          {
            name: 'validate_api_design',
            description: 'Analyze the API design and provide recommendations for improvements',
            inputSchema: {
              type: 'object',
              properties: {
                focus: {
                  type: 'string',
                  enum: ['security', 'performance', 'design', 'documentation', 'all'],
                  description: 'Focus area for validation',
                  default: 'all',
                },
              },
            },
          },
          {
            name: 'export_documentation',
            description: 'Export API documentation in various formats',
            inputSchema: {
              type: 'object',
              properties: {
                format: {
                  type: 'string',
                  enum: ['markdown', 'json', 'summary'],
                  description: 'Export format',
                  default: 'markdown',
                },
                includeExamples: {
                  type: 'boolean',
                  description: 'Include code examples in export',
                  default: true,
                },
                includeAnalytics: {
                  type: 'boolean',
                  description: 'Include analytics in export',
                  default: false,
                },
              },
            },
          },
        ] satisfies Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.handleCallTool(name, args);
    });
  }

  private async handleListTools() {
    // Return the tools list directly since we know what tools we have
    return {
      tools: [
        {
          name: 'load_openapi_spec',
          description: 'Load and parse an OpenAPI specification from text, URL, or file content',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'The source of the OpenAPI spec (text content, URL, or file content)',
              },
              sourceType: {
                type: 'string',
                enum: ['text', 'url'],
                description: 'Type of source: text (JSON/YAML content) or url',
                default: 'text',
              },
            },
            required: ['source'],
          },
        },
        // Add other tools here...
      ],
    };
  }

  private async handleCallTool(name: string, args: any) {
    try {
      switch (name) {
        case 'load_openapi_spec':
          return await this.loadOpenAPISpec(args);
        case 'get_api_overview':
          return await this.getAPIOverview();
        case 'search_endpoints':
          return await this.searchEndpoints(args);
        case 'get_endpoint_details':
          return await this.getEndpointDetails(args);
        case 'generate_code_examples':
          return await this.generateCodeExamples(args);
        case 'get_api_analytics':
          return await this.getAPIAnalytics(args);
        case 'validate_api_design':
          return await this.validateAPIDesign(args);
        case 'export_documentation':
          return await this.exportDocumentation(args);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private handleError(res: express.Response, error: any) {
    console.error('HTTP Server Error:', error);
    
    if (error instanceof McpError) {
      res.status(400).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    } else {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      });
    }
  }

  // Tool implementation methods (same as stdio server)
  private async loadOpenAPISpec(args: any) {
    const { source, sourceType = 'text' } = args;

    try {
      let spec: OpenAPISpec;
      
      if (sourceType === 'url') {
        spec = await this.parser.parseFromUrl(source);
      } else {
        spec = await this.parser.parseFromText(source);
      }

      this.currentSpec = spec;
      this.currentEndpoints = this.parser.extractEndpoints();

      const analytics = generateAnalytics(this.currentEndpoints);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Successfully loaded OpenAPI specification!

**API Information:**
- Title: ${spec.info.title}
- Version: ${spec.info.version}
- Description: ${spec.info.description || 'No description provided'}
- OpenAPI Version: ${spec.openapi}

**Statistics:**
- Total Endpoints: ${this.currentEndpoints.length}
- HTTP Methods: ${Object.keys(analytics.methodDistribution).join(', ')}
- Tags: ${Object.keys(analytics.tagDistribution).length}
- Deprecated Endpoints: ${analytics.deprecatedCount}

The API specification has been loaded and is ready for exploration. You can now use other tools to search endpoints, get analytics, generate code examples, and more!`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to load OpenAPI spec: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async getAPIOverview() {
    if (!this.currentSpec || !this.currentEndpoints.length) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'No OpenAPI specification loaded. Please load a spec first using load_openapi_spec.'
      );
    }

    const analytics = generateAnalytics(this.currentEndpoints);
    const tags = this.parser.getAllTags();

    return {
      content: [
        {
          type: 'text',
          text: `# ${this.currentSpec.info.title} - API Overview

## Basic Information
- **Version:** ${this.currentSpec.info.version}
- **OpenAPI Version:** ${this.currentSpec.openapi}
- **Description:** ${this.currentSpec.info.description || 'No description provided'}

## Statistics
- **Total Endpoints:** ${analytics.totalEndpoints}
- **Deprecated Endpoints:** ${analytics.deprecatedCount} (${((analytics.deprecatedCount / analytics.totalEndpoints) * 100).toFixed(1)}%)
- **Average Parameters per Endpoint:** ${analytics.averageParametersPerEndpoint.toFixed(1)}
- **Security Schemes:** ${analytics.securitySchemes.length}

## HTTP Methods Distribution
${Object.entries(analytics.methodDistribution)
  .map(([method, count]) => `- **${method}:** ${count} endpoints`)
  .join('\n')}

## Tags (${tags.length})
${tags.length > 0 ? tags.map(tag => `- ${tag}`).join('\n') : 'No tags defined'}

## Complexity Distribution
${Object.entries(analytics.complexityDistribution)
  .map(([complexity, count]) => `- **${complexity.charAt(0).toUpperCase() + complexity.slice(1)}:** ${count} endpoints`)
  .join('\n')}`,
        },
      ],
    };
  }

  private async searchEndpoints(args: any) {
    if (!this.currentEndpoints.length) {
      throw new McpError(ErrorCode.InvalidRequest, 'No OpenAPI specification loaded. Please load a spec first.');
    }

    const {
      query,
      methods,
      tags,
      complexity,
      deprecated,
      hasParameters,
      hasRequestBody,
    } = args;

    let filteredEndpoints = [...this.currentEndpoints];

    // Apply filters (same logic as stdio server)
    if (query) {
      const searchTerm = query.toLowerCase();
      filteredEndpoints = filteredEndpoints.filter(endpoint =>
        endpoint.path.toLowerCase().includes(searchTerm) ||
        endpoint.summary?.toLowerCase().includes(searchTerm) ||
        endpoint.description?.toLowerCase().includes(searchTerm) ||
        endpoint.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    if (methods && methods.length > 0) {
      filteredEndpoints = filteredEndpoints.filter(endpoint =>
        methods.includes(endpoint.method)
      );
    }

    if (tags && tags.length > 0) {
      filteredEndpoints = filteredEndpoints.filter(endpoint =>
        endpoint.tags.some(tag => tags.includes(tag))
      );
    }

    if (complexity && complexity.length > 0) {
      filteredEndpoints = filteredEndpoints.filter(endpoint =>
        endpoint.complexity && complexity.includes(endpoint.complexity)
      );
    }

    if (typeof deprecated === 'boolean') {
      filteredEndpoints = filteredEndpoints.filter(endpoint =>
        endpoint.deprecated === deprecated
      );
    }

    if (typeof hasParameters === 'boolean') {
      filteredEndpoints = filteredEndpoints.filter(endpoint =>
        (endpoint.parameters.length > 0) === hasParameters
      );
    }

    if (typeof hasRequestBody === 'boolean') {
      filteredEndpoints = filteredEndpoints.filter(endpoint =>
        !!endpoint.requestBody === hasRequestBody
      );
    }

    const results = filteredEndpoints.slice(0, 20);

    return {
      content: [
        {
          type: 'text',
          text: `# Search Results

Found **${filteredEndpoints.length}** endpoints matching your criteria${filteredEndpoints.length > 20 ? ' (showing first 20)' : ''}:

${results.map(endpoint => `
## ${endpoint.method} ${endpoint.path}
- **Summary:** ${endpoint.summary || 'No summary'}
- **Tags:** ${endpoint.tags.join(', ') || 'None'}
- **Complexity:** ${endpoint.complexity || 'Unknown'}
- **Parameters:** ${endpoint.parameters.length}
- **Deprecated:** ${endpoint.deprecated ? 'Yes' : 'No'}
- **Has Request Body:** ${endpoint.requestBody ? 'Yes' : 'No'}
${endpoint.description ? `- **Description:** ${endpoint.description}` : ''}
`).join('\n')}`,
        },
      ],
    };
  }

  private async getEndpointDetails(args: any) {
    if (!this.currentEndpoints.length) {
      throw new McpError(ErrorCode.InvalidRequest, 'No OpenAPI specification loaded. Please load a spec first.');
    }

    const { method, path } = args;
    const endpoint = this.currentEndpoints.find(
      ep => ep.method.toLowerCase() === method.toLowerCase() && ep.path === path
    );

    if (!endpoint) {
      throw new McpError(ErrorCode.InvalidRequest, `Endpoint ${method} ${path} not found.`);
    }

    return {
      content: [
        {
          type: 'text',
          text: `# ${endpoint.method} ${endpoint.path}

## Overview
- **Summary:** ${endpoint.summary || 'No summary provided'}
- **Description:** ${endpoint.description || 'No description provided'}
- **Tags:** ${endpoint.tags.join(', ') || 'None'}
- **Deprecated:** ${endpoint.deprecated ? '⚠️ Yes' : '✅ No'}
- **Complexity:** ${endpoint.complexity || 'Unknown'}

## Parameters (${endpoint.parameters.length})
${endpoint.parameters.length > 0 ? 
  endpoint.parameters.map(param => `
### ${param.name} (${param.in})
- **Type:** ${(param.schema && 'type' in param.schema) ? param.schema.type : 'Unknown'}
- **Required:** ${param.required ? 'Yes' : 'No'}
- **Description:** ${param.description || 'No description'}
`).join('\n') : 'No parameters'}

## Request Body
${endpoint.requestBody ? 'This endpoint accepts a request body' : 'No request body required'}

## Responses
${Object.entries(endpoint.responses).map(([code, response]) => `
### ${code}
${response.description}
`).join('\n')}`,
        },
      ],
    };
  }

  private async generateCodeExamples(args: any) {
    if (!this.currentEndpoints.length) {
      throw new McpError(ErrorCode.InvalidRequest, 'No OpenAPI specification loaded. Please load a spec first.');
    }

    const { method, path, language = 'curl' } = args;
    const endpoint = this.currentEndpoints.find(
      ep => ep.method.toLowerCase() === method.toLowerCase() && ep.path === path
    );

    if (!endpoint) {
      throw new McpError(ErrorCode.InvalidRequest, `Endpoint ${method} ${path} not found.`);
    }

    let example = '';

    switch (language) {
      case 'curl':
        example = this.generateCurlExample(endpoint);
        break;
      case 'javascript':
        example = this.generateJavaScriptExample(endpoint);
        break;
      case 'python':
        example = this.generatePythonExample(endpoint);
        break;
      case 'typescript':
        example = this.generateTypeScriptExample(endpoint);
        break;
      default:
        throw new McpError(ErrorCode.InvalidRequest, `Unsupported language: ${language}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: `# Code Example: ${endpoint.method} ${endpoint.path}

## ${language.charAt(0).toUpperCase() + language.slice(1)} Example

\`\`\`${language === 'typescript' ? 'typescript' : language}
${example}
\`\`\`

## Endpoint Details
- **Summary:** ${endpoint.summary || 'No summary'}
- **Parameters:** ${endpoint.parameters.length}
- **Request Body:** ${endpoint.requestBody ? 'Required' : 'Not required'}`,
        },
      ],
    };
  }

  private async getAPIAnalytics(args: any) {
    if (!this.currentEndpoints.length) {
      throw new McpError(ErrorCode.InvalidRequest, 'No OpenAPI specification loaded. Please load a spec first.');
    }

    const { includeDistributions = true } = args;
    const analytics = generateAnalytics(this.currentEndpoints);

    let result = `# API Analytics

## Overview Statistics
- **Total Endpoints:** ${analytics.totalEndpoints}
- **Deprecated Endpoints:** ${analytics.deprecatedCount} (${((analytics.deprecatedCount / analytics.totalEndpoints) * 100).toFixed(1)}%)
- **Average Parameters per Endpoint:** ${analytics.averageParametersPerEndpoint.toFixed(1)}
- **Security Schemes:** ${analytics.securitySchemes.length}

## Security Analysis
${analytics.securitySchemes.length > 0 ? 
  `**Security Schemes Used:** ${analytics.securitySchemes.join(', ')}` : 
  '⚠️ **No security schemes detected** - Consider adding authentication'}`;

    if (includeDistributions) {
      result += `

## Method Distribution
${Object.entries(analytics.methodDistribution)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .map(([method, count]) => `- **${method}:** ${count} endpoints (${(((count as number) / analytics.totalEndpoints) * 100).toFixed(1)}%)`)
  .join('\n')}

## Complexity Distribution
${Object.entries(analytics.complexityDistribution)
  .map(([complexity, count]) => `- **${complexity.charAt(0).toUpperCase() + complexity.slice(1)}:** ${count} endpoints (${(((count as number) / analytics.totalEndpoints) * 100).toFixed(1)}%)`)
  .join('\n')}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  private async validateAPIDesign(args: any) {
    if (!this.currentEndpoints.length) {
      throw new McpError(ErrorCode.InvalidRequest, 'No OpenAPI specification loaded. Please load a spec first.');
    }

    const { focus = 'all' } = args;
    const analytics = generateAnalytics(this.currentEndpoints);
    const recommendations: string[] = [];

    // Security validation
    if (focus === 'security' || focus === 'all') {
      if (analytics.securitySchemes.length === 0) {
        recommendations.push('🔒 **Security:** No security schemes detected. Consider adding authentication to protect your API.');
      }
    }

    // Documentation validation
    if (focus === 'documentation' || focus === 'all') {
      const undocumentedEndpoints = this.currentEndpoints.filter(ep => !ep.summary && !ep.description);
      if (undocumentedEndpoints.length > 0) {
        recommendations.push(`📝 **Documentation:** ${undocumentedEndpoints.length} endpoints lack summaries or descriptions.`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ **Great job!** No major issues detected in your API design.');
    }

    return {
      content: [
        {
          type: 'text',
          text: `# API Design Validation Report

## Analysis Focus: ${focus.charAt(0).toUpperCase() + focus.slice(1)}

## Recommendations

${recommendations.map(rec => rec).join('\n\n')}

## Summary Statistics
- **Total Endpoints:** ${analytics.totalEndpoints}
- **Security Coverage:** ${((this.currentEndpoints.filter(ep => ep.security && ep.security.length > 0).length / analytics.totalEndpoints) * 100).toFixed(1)}%
- **Documentation Coverage:** ${((this.currentEndpoints.filter(ep => ep.summary || ep.description).length / analytics.totalEndpoints) * 100).toFixed(1)}%`,
        },
      ],
    };
  }

  private async exportDocumentation(args: any) {
    if (!this.currentSpec || !this.currentEndpoints.length) {
      throw new McpError(ErrorCode.InvalidRequest, 'No OpenAPI specification loaded. Please load a spec first.');
    }

    const { format = 'markdown', includeExamples = true, includeAnalytics = false } = args;
    
    if (format === 'summary') {
      return {
        content: [
          {
            type: 'text',
            text: `# ${this.currentSpec.info.title} - API Summary

**Version:** ${this.currentSpec.info.version}
**Total Endpoints:** ${this.currentEndpoints.length}

## All Endpoints
${this.currentEndpoints.map(ep => `- ${ep.method} ${ep.path}${ep.summary ? ` - ${ep.summary}` : ''}`).join('\n')}`,
          },
        ],
      };
    }

    // Default markdown format
    let markdown = `# ${this.currentSpec.info.title}

**Version:** ${this.currentSpec.info.version}
**OpenAPI Version:** ${this.currentSpec.openapi}

${this.currentSpec.info.description ? `## Description\n${this.currentSpec.info.description}\n` : ''}

## Endpoints (${this.currentEndpoints.length})

`;

    for (const endpoint of this.currentEndpoints.slice(0, 10)) { // Limit for HTTP response
      markdown += `### ${endpoint.method} ${endpoint.path}\n\n`;
      
      if (endpoint.summary) {
        markdown += `**Summary:** ${endpoint.summary}\n\n`;
      }

      if (includeExamples) {
        markdown += `**Example:**\n\`\`\`bash\n${this.generateCurlExample(endpoint)}\n\`\`\`\n\n`;
      }

      markdown += '---\n\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: markdown,
        },
      ],
    };
  }

  // Code generation methods (same as stdio server)
  private generateCurlExample(endpoint: EndpointData): string {
    const method = endpoint.method.toLowerCase();
    let curl = `curl -X ${endpoint.method} "${endpoint.path}"`;
    
    if (endpoint.parameters?.some(p => p.in === 'header')) {
      curl += ` \\\n  -H "Content-Type: application/json"`;
    }
    
    if (endpoint.requestBody && (method === 'post' || method === 'put' || method === 'patch')) {
      curl += ` \\\n  -d '{"example": "data"}'`;
    }
    
    return curl;
  }

  private generateJavaScriptExample(endpoint: EndpointData): string {
    const hasBody = endpoint.requestBody && ['post', 'put', 'patch'].includes(endpoint.method.toLowerCase());
    
    return `const response = await fetch('${endpoint.path}', {
  method: '${endpoint.method}',
  headers: {
    'Content-Type': 'application/json',
  },${hasBody ? `
  body: JSON.stringify({
    // Add your request data here
  }),` : ''}
});

const data = await response.json();
console.log(data);`;
  }

  private generatePythonExample(endpoint: EndpointData): string {
    const hasBody = endpoint.requestBody && ['post', 'put', 'patch'].includes(endpoint.method.toLowerCase());
    
    return `import requests

url = "${endpoint.path}"
headers = {"Content-Type": "application/json"}
${hasBody ? `
data = {
    # Add your request data here
}

response = requests.${endpoint.method.toLowerCase()}(url, headers=headers, json=data)` : `
response = requests.${endpoint.method.toLowerCase()}(url, headers=headers)`}
print(response.json())`;
  }

  private generateTypeScriptExample(endpoint: EndpointData): string {
    const hasBody = endpoint.requestBody && ['post', 'put', 'patch'].includes(endpoint.method.toLowerCase());
    
    return `interface ApiResponse {
  // Define your response type here
}

${hasBody ? `interface RequestData {
  // Define your request data type here
}

` : ''}const response = await fetch('${endpoint.path}', {
  method: '${endpoint.method}',
  headers: {
    'Content-Type': 'application/json',
  },${hasBody ? `
  body: JSON.stringify({
    // Add your request data here
  } as RequestData),` : ''}
});

const data: ApiResponse = await response.json();
console.log(data);`;
  }

  public start() {
    this.app.listen(this.port, () => {
      console.log(`🚀 OpenAPI Explorer MCP HTTP Server running on port ${this.port}`);
      console.log(`📖 Documentation: http://localhost:${this.port}/docs`);
      console.log(`🔍 Health check: http://localhost:${this.port}/health`);
      console.log(`📡 Streaming: http://localhost:${this.port}/mcp/stream`);
    });
  }
}

// Start the server
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const server = new OpenAPIExplorerHTTPServer(port);
server.start();