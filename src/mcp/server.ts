#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenAPIParser } from '../utils/openapi-parser.js';
import { generateAnalytics } from '../utils/analytics.js';
import { EndpointData, OpenAPISpec } from '../types/openapi.js';

class OpenAPIExplorerMCPServer {
  private server: Server;
  private parser: OpenAPIParser;
  private currentSpec: OpenAPISpec | null = null;
  private currentEndpoints: EndpointData[] = [];

  constructor() {
    this.server = new Server(
      {
        name: 'openapi-explorer',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.parser = new OpenAPIParser();
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
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
          {
            name: 'search_request_body_properties',
            description: 'Deep search through request body schemas to find specific properties, types, or patterns',
            inputSchema: {
              type: 'object',
              properties: {
                propertyName: {
                  type: 'string',
                  description: 'Name of the property to search for (supports partial matches)',
                },
                propertyType: {
                  type: 'string',
                  description: 'Type of property to search for (string, number, boolean, array, object)',
                },
                schemaPattern: {
                  type: 'string',
                  description: 'Regex pattern to match against schema descriptions or names',
                },
                required: {
                  type: 'boolean',
                  description: 'Filter by whether the property is required',
                },
                methods: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Limit search to specific HTTP methods',
                },
              },
            },
          },
          {
            name: 'generate_typescript_types',
            description: 'Generate TypeScript interfaces and types from OpenAPI schemas',
            inputSchema: {
              type: 'object',
              properties: {
                schemaName: {
                  type: 'string',
                  description: 'Specific schema name to generate types for (optional - generates all if not provided)',
                },
                includeRequestBodies: {
                  type: 'boolean',
                  description: 'Include request body types',
                  default: true,
                },
                includeResponses: {
                  type: 'boolean',
                  description: 'Include response types',
                  default: true,
                },
                exportFormat: {
                  type: 'string',
                  enum: ['individual', 'merged'],
                  description: 'Export as individual interfaces or merged into one file',
                  default: 'individual',
                },
                addValidation: {
                  type: 'boolean',
                  description: 'Add validation decorators (useful for class-validator)',
                  default: false,
                },
              },
            },
          },
          {
            name: 'find_schema_dependencies',
            description: 'Trace and analyze schema references and dependencies throughout the API',
            inputSchema: {
              type: 'object',
              properties: {
                schemaName: {
                  type: 'string',
                  description: 'Schema to analyze dependencies for',
                },
                direction: {
                  type: 'string',
                  enum: ['dependencies', 'dependents', 'both'],
                  description: 'Find what this schema depends on, what depends on it, or both',
                  default: 'both',
                },
                depth: {
                  type: 'number',
                  description: 'Maximum depth of dependency traversal',
                  default: 5,
                },
              },
              required: ['schemaName'],
            },
          },
          {
            name: 'validate_request_examples',
            description: 'Validate that request/response examples match their schemas',
            inputSchema: {
              type: 'object',
              properties: {
                endpoint: {
                  type: 'string',
                  description: 'Specific endpoint to validate (method:path format, e.g., "POST:/users")',
                },
                strictMode: {
                  type: 'boolean',
                  description: 'Use strict validation (fail on additional properties)',
                  default: false,
                },
              },
            },
          },
          {
            name: 'extract_auth_patterns',
            description: 'Analyze and extract authentication and authorization patterns across the API',
            inputSchema: {
              type: 'object',
              properties: {
                includeEndpointMapping: {
                  type: 'boolean',
                  description: 'Include mapping of which endpoints use which auth methods',
                  default: true,
                },
                analyzeScopes: {
                  type: 'boolean',
                  description: 'Analyze OAuth scopes and permissions',
                  default: true,
                },
              },
            },
          },
          {
            name: 'generate_mock_data',
            description: 'Generate realistic mock data based on OpenAPI schemas',
            inputSchema: {
              type: 'object',
              properties: {
                schemaName: {
                  type: 'string',
                  description: 'Schema to generate mock data for',
                },
                endpoint: {
                  type: 'string',
                  description: 'Generate mock data for specific endpoint (method:path format)',
                },
                count: {
                  type: 'number',
                  description: 'Number of mock items to generate',
                  default: 3,
                },
                realistic: {
                  type: 'boolean',
                  description: 'Generate realistic data based on field names and types',
                  default: true,
                },
                format: {
                  type: 'string',
                  enum: ['json', 'javascript', 'typescript'],
                  description: 'Output format for mock data',
                  default: 'json',
                },
              },
            },
          },
          {
            name: 'find_unused_schemas',
            description: 'Identify schemas that are defined but never referenced in the API',
            inputSchema: {
              type: 'object',
              properties: {
                includeIndirectReferences: {
                  type: 'boolean',
                  description: 'Check for indirect references through other schemas',
                  default: true,
                },
              },
            },
          },
          {
            name: 'analyze_schema_evolution',
            description: 'Analyze how schemas might evolve and suggest versioning strategies',
            inputSchema: {
              type: 'object',
              properties: {
                schemaName: {
                  type: 'string',
                  description: 'Schema to analyze for evolution patterns',
                },
                suggestVersioning: {
                  type: 'boolean',
                  description: 'Suggest versioning strategies',
                  default: true,
                },
              },
            },
          },
        ] satisfies Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

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
          case 'search_request_body_properties':
            return await this.searchRequestBodyProperties(args);
          case 'generate_typescript_types':
            return await this.generateTypeScriptTypes(args);
          case 'find_schema_dependencies':
            return await this.findSchemaDependencies(args);
          case 'validate_request_examples':
            return await this.validateRequestExamples(args);
          case 'extract_auth_patterns':
            return await this.extractAuthPatterns(args);
          case 'generate_mock_data':
            return await this.generateMockData(args);
          case 'find_unused_schemas':
            return await this.findUnusedSchemas(args);
          case 'analyze_schema_evolution':
            return await this.analyzeSchemaEvolution(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

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
      throw new Error(`Failed to load OpenAPI spec: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getAPIOverview() {
    if (!this.currentSpec || !this.currentEndpoints.length) {
      throw new Error('No OpenAPI specification loaded. Please load a spec first.');
    }

    const analytics = generateAnalytics(this.currentEndpoints);
    const tags = this.parser.getAllTags();
    const methods = this.parser.getAllMethods();

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
  .join('\n')}

## Top Response Codes
${Object.entries(analytics.responseCodeDistribution)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .slice(0, 5)
  .map(([code, count]) => `- **${code}:** ${count} endpoints`)
  .join('\n')}`,
        },
      ],
    };
  }

  private async searchEndpoints(args: any) {
    if (!this.currentEndpoints.length) {
      throw new Error('No OpenAPI specification loaded. Please load a spec first.');
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

    // Apply filters
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

    const results = filteredEndpoints.slice(0, 20); // Limit results

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
      throw new Error('No OpenAPI specification loaded. Please load a spec first.');
    }

    const { method, path } = args;
    const endpoint = this.currentEndpoints.find(
      ep => ep.method.toLowerCase() === method.toLowerCase() && ep.path === path
    );

    if (!endpoint) {
      throw new Error(`Endpoint ${method} ${path} not found.`);
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
`).join('\n')}

## Business Context
${endpoint.businessContext || 'No business context available'}

## AI Suggestions
${endpoint.aiSuggestions && endpoint.aiSuggestions.length > 0 ? 
  endpoint.aiSuggestions.map(suggestion => `- ${suggestion}`).join('\n') : 
  'No AI suggestions available'}`,
        },
      ],
    };
  }

  private async generateCodeExamples(args: any) {
    if (!this.currentEndpoints.length) {
      throw new Error('No OpenAPI specification loaded. Please load a spec first.');
    }

    const { method, path, language = 'curl' } = args;
    const endpoint = this.currentEndpoints.find(
      ep => ep.method.toLowerCase() === method.toLowerCase() && ep.path === path
    );

    if (!endpoint) {
      throw new Error(`Endpoint ${method} ${path} not found.`);
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
        throw new Error(`Unsupported language: ${language}`);
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

  private async getAPIAnalytics(args: any) {
    if (!this.currentEndpoints.length) {
      throw new Error('No OpenAPI specification loaded. Please load a spec first.');
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
  .join('\n')}

## Response Code Distribution
${Object.entries(analytics.responseCodeDistribution)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .slice(0, 10)
  .map(([code, count]) => `- **${code}:** ${count} endpoints`)
  .join('\n')}

## Tag Distribution (Top 10)
${Object.entries(analytics.tagDistribution)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .slice(0, 10)
  .map(([tag, count]) => `- **${tag}:** ${count} endpoints`)
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
      throw new Error('No OpenAPI specification loaded. Please load a spec first.');
    }

    const { focus = 'all' } = args;
    const analytics = generateAnalytics(this.currentEndpoints);
    const recommendations: string[] = [];

    // Security validation
    if (focus === 'security' || focus === 'all') {
      if (analytics.securitySchemes.length === 0) {
        recommendations.push('🔒 **Security:** No security schemes detected. Consider adding authentication to protect your API.');
      }
      
      const unsecuredEndpoints = this.currentEndpoints.filter(ep => !ep.security || ep.security.length === 0);
      if (unsecuredEndpoints.length > 0) {
        recommendations.push(`🔒 **Security:** ${unsecuredEndpoints.length} endpoints have no security requirements. Review if this is intentional.`);
      }
    }

    // Documentation validation
    if (focus === 'documentation' || focus === 'all') {
      const undocumentedEndpoints = this.currentEndpoints.filter(ep => !ep.summary && !ep.description);
      if (undocumentedEndpoints.length > 0) {
        recommendations.push(`📝 **Documentation:** ${undocumentedEndpoints.length} endpoints lack summaries or descriptions.`);
      }

      const untaggedEndpoints = this.currentEndpoints.filter(ep => ep.tags.length === 0);
      if (untaggedEndpoints.length > 0) {
        recommendations.push(`🏷️ **Organization:** ${untaggedEndpoints.length} endpoints have no tags for better organization.`);
      }
    }

    // Design validation
    if (focus === 'design' || focus === 'all') {
      if (analytics.deprecatedCount > 0) {
        recommendations.push(`⚠️ **Maintenance:** ${analytics.deprecatedCount} deprecated endpoints found. Consider migration strategy.`);
      }

      const highComplexityEndpoints = this.currentEndpoints.filter(ep => ep.complexity === 'high');
      if (highComplexityEndpoints.length > analytics.totalEndpoints * 0.3) {
        recommendations.push(`🔧 **Design:** High number of complex endpoints (${highComplexityEndpoints.length}). Consider simplifying API design.`);
      }
    }

    // Performance validation
    if (focus === 'performance' || focus === 'all') {
      const slowEndpoints = this.currentEndpoints.filter(ep => ep.estimatedResponseTime === 'slow');
      if (slowEndpoints.length > 0) {
        recommendations.push(`⚡ **Performance:** ${slowEndpoints.length} endpoints estimated as slow. Consider optimization.`);
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
- **Documentation Coverage:** ${((this.currentEndpoints.filter(ep => ep.summary || ep.description).length / analytics.totalEndpoints) * 100).toFixed(1)}%
- **Tag Coverage:** ${((this.currentEndpoints.filter(ep => ep.tags.length > 0).length / analytics.totalEndpoints) * 100).toFixed(1)}%`,
        },
      ],
    };
  }

  private async exportDocumentation(args: any) {
    if (!this.currentSpec || !this.currentEndpoints.length) {
      throw new Error('No OpenAPI specification loaded. Please load a spec first.');
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

## Endpoints by Method
${Object.entries(generateAnalytics(this.currentEndpoints).methodDistribution)
  .map(([method, count]) => `- ${method}: ${count}`)
  .join('\n')}

## All Endpoints
${this.currentEndpoints.map(ep => `- ${ep.method} ${ep.path}${ep.summary ? ` - ${ep.summary}` : ''}`).join('\n')}`,
          },
        ],
      };
    }

    if (format === 'json') {
      const exportData = {
        api: {
          title: this.currentSpec.info.title,
          version: this.currentSpec.info.version,
          description: this.currentSpec.info.description,
        },
        endpoints: this.currentEndpoints.map(ep => ({
          method: ep.method,
          path: ep.path,
          summary: ep.summary,
          description: ep.description,
          tags: ep.tags,
          deprecated: ep.deprecated,
          complexity: ep.complexity,
          parameters: ep.parameters.length,
          hasRequestBody: !!ep.requestBody,
          responseCodes: Object.keys(ep.responses),
        })),
        ...(includeAnalytics && { analytics: generateAnalytics(this.currentEndpoints) }),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(exportData, null, 2),
          },
        ],
      };
    }

    // Markdown format (default)
    let markdown = `# ${this.currentSpec.info.title}

**Version:** ${this.currentSpec.info.version}
**OpenAPI Version:** ${this.currentSpec.openapi}

${this.currentSpec.info.description ? `## Description\n${this.currentSpec.info.description}\n` : ''}

## Endpoints (${this.currentEndpoints.length})

`;

    for (const endpoint of this.currentEndpoints) {
      markdown += `### ${endpoint.method} ${endpoint.path}\n\n`;
      
      if (endpoint.summary) {
        markdown += `**Summary:** ${endpoint.summary}\n\n`;
      }
      
      if (endpoint.description) {
        markdown += `**Description:** ${endpoint.description}\n\n`;
      }

      if (endpoint.tags.length > 0) {
        markdown += `**Tags:** ${endpoint.tags.join(', ')}\n\n`;
      }

      if (endpoint.deprecated) {
        markdown += `⚠️ **This endpoint is deprecated**\n\n`;
      }

      if (endpoint.parameters.length > 0) {
        markdown += `**Parameters:**\n`;
        endpoint.parameters.forEach(param => {
          markdown += `- \`${param.name}\` (${param.in}) - ${param.description || 'No description'}\n`;
        });
        markdown += '\n';
      }

      markdown += `**Responses:**\n`;
      Object.entries(endpoint.responses).forEach(([code, response]) => {
        markdown += `- \`${code}\` - ${response.description}\n`;
      });
      markdown += '\n';

      if (includeExamples) {
        markdown += `**Example:**\n\`\`\`bash\n${this.generateCurlExample(endpoint)}\n\`\`\`\n\n`;
      }

      markdown += '---\n\n';
    }

    if (includeAnalytics) {
      const analytics = generateAnalytics(this.currentEndpoints);
      markdown += `## Analytics

**Total Endpoints:** ${analytics.totalEndpoints}
**Deprecated:** ${analytics.deprecatedCount}
**Average Parameters:** ${analytics.averageParametersPerEndpoint.toFixed(1)}

### Method Distribution
${Object.entries(analytics.methodDistribution)
  .map(([method, count]) => `- ${method}: ${count}`)
  .join('\n')}

### Complexity Distribution
${Object.entries(analytics.complexityDistribution)
  .map(([complexity, count]) => `- ${complexity}: ${count}`)
  .join('\n')}
`;
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

  private async searchRequestBodyProperties(args: any) {
    if (!this.currentSpec) {
      return {
        content: [{ type: 'text', text: 'No OpenAPI specification loaded. Please load a spec first.' }],
        isError: true,
      };
    }

    const { propertyName, propertyType, schemaPattern, required, methods } = args;
    const results: any[] = [];

    // Helper function to search properties in a schema
    const searchInSchema = (schema: any, path: string[] = []): any[] => {
      const matches: any[] = [];
      
      if (!schema || typeof schema !== 'object') return matches;

      // Handle $ref
      if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        if (this.currentSpec?.components?.schemas?.[refName]) {
          return searchInSchema(this.currentSpec.components.schemas[refName], [...path, refName]);
        }
        return matches;
      }

      // Search in properties
      if (schema.properties) {
        Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
          const currentPath = [...path, propName];
          const isRequired = schema.required?.includes(propName) || false;

          // Check if this property matches our search criteria
          let matches_criteria = true;

          if (propertyName && !propName.toLowerCase().includes(propertyName.toLowerCase())) {
            matches_criteria = false;
          }

          if (propertyType && propSchema.type !== propertyType) {
            matches_criteria = false;
          }

          if (required !== undefined && isRequired !== required) {
            matches_criteria = false;
          }

          if (schemaPattern) {
            const regex = new RegExp(schemaPattern, 'i');
            if (!regex.test(propSchema.description || '') && !regex.test(propName)) {
              matches_criteria = false;
            }
          }

          if (matches_criteria) {
            matches.push({
              propertyName: propName,
              propertyType: propSchema.type || 'unknown',
              path: currentPath.join('.'),
              required: isRequired,
              description: propSchema.description,
              format: propSchema.format,
              example: propSchema.example,
              enum: propSchema.enum,
              schema: propSchema
            });
          }

          // Recursively search nested objects
          if (propSchema.type === 'object' || propSchema.properties) {
            matches.push(...searchInSchema(propSchema, currentPath));
          }

          // Search in array items
          if (propSchema.type === 'array' && propSchema.items) {
            matches.push(...searchInSchema(propSchema.items, [...currentPath, '[items]']));
          }
        });
      }

      // Search in oneOf, anyOf, allOf
      ['oneOf', 'anyOf', 'allOf'].forEach(keyword => {
        if (schema[keyword] && Array.isArray(schema[keyword])) {
          schema[keyword].forEach((subSchema: any, index: number) => {
            matches.push(...searchInSchema(subSchema, [...path, `${keyword}[${index}]`]));
          });
        }
      });

      return matches;
    };

    // Search through all endpoints with request bodies
    this.currentEndpoints.forEach(endpoint => {
      if (methods && !methods.includes(endpoint.method.toUpperCase())) {
        return;
      }

      if (endpoint.requestBody?.content) {
        Object.entries(endpoint.requestBody.content).forEach(([mediaType, content]: [string, any]) => {
          if (content.schema) {
            const properties = searchInSchema(content.schema);
            if (properties.length > 0) {
              results.push({
                endpoint: `${endpoint.method.toUpperCase()} ${endpoint.path}`,
                mediaType,
                properties
              });
            }
          }
        });
      }
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          searchCriteria: { propertyName, propertyType, schemaPattern, required, methods },
          totalMatches: results.reduce((sum, r) => sum + r.properties.length, 0),
          results
        }, null, 2)
      }],
    };
  }

  private async generateTypeScriptTypes(args: any) {
    if (!this.currentSpec) {
      return {
        content: [{ type: 'text', text: 'No OpenAPI specification loaded. Please load a spec first.' }],
        isError: true,
      };
    }

    const { schemaName, includeRequestBodies = true, includeResponses = true, exportFormat = 'individual', addValidation = false } = args;
    
    const convertSchemaToTS = (schema: any, name: string, path: string[] = []): string => {
      if (!schema) return 'any';

      // Handle $ref
      if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        return refName || 'any';
      }

      // Handle basic types
      if (schema.type) {
        switch (schema.type) {
          case 'string':
            if (schema.enum) {
              return schema.enum.map((v: string) => `'${v}'`).join(' | ');
            }
            return 'string';
          case 'number':
          case 'integer':
            return 'number';
          case 'boolean':
            return 'boolean';
          case 'array':
            const itemType = schema.items ? convertSchemaToTS(schema.items, '', path) : 'any';
            return `${itemType}[]`;
          case 'object':
            if (schema.properties) {
              const props = Object.entries(schema.properties).map(([propName, propSchema]: [string, any]) => {
                const isRequired = schema.required?.includes(propName);
                const optional = isRequired ? '' : '?';
                const validation = addValidation ? this.generateValidationDecorator(propSchema) : '';
                const propType = convertSchemaToTS(propSchema, propName, [...path, propName]);
                const description = propSchema.description ? `  /** ${propSchema.description} */\n  ` : '  ';
                return `${description}${validation}${propName}${optional}: ${propType};`;
              }).join('\n  ');
              return `{\n  ${props}\n}`;
            }
            return 'Record<string, any>';
        }
      }

      // Handle oneOf, anyOf, allOf
      if (schema.oneOf) {
        return schema.oneOf.map((s: any) => convertSchemaToTS(s, '', path)).join(' | ');
      }
      if (schema.anyOf) {
        return schema.anyOf.map((s: any) => convertSchemaToTS(s, '', path)).join(' | ');
      }
      if (schema.allOf) {
        return schema.allOf.map((s: any) => convertSchemaToTS(s, '', path)).join(' & ');
      }

      return 'any';
    };

    const interfaces: string[] = [];

    // Generate types for components/schemas
    if (this.currentSpec.components?.schemas) {
      Object.entries(this.currentSpec.components.schemas).forEach(([name, schema]: [string, any]) => {
        if (schemaName && name !== schemaName) return;
        
        const tsType = convertSchemaToTS(schema, name);
        const description = schema.description ? `/** ${schema.description} */\n` : '';
        interfaces.push(`${description}export interface ${name} ${tsType}`);
      });
    }

    // Generate types for request bodies
    if (includeRequestBodies) {
      this.currentEndpoints.forEach(endpoint => {
        if (endpoint.requestBody?.content) {
          Object.entries(endpoint.requestBody.content).forEach(([mediaType, content]: [string, any]) => {
            if (content.schema && !content.schema.$ref) {
              const typeName = `${endpoint.method.toUpperCase()}${endpoint.path.replace(/[^a-zA-Z0-9]/g, '')}Request`;
              const tsType = convertSchemaToTS(content.schema, typeName);
              interfaces.push(`export interface ${typeName} ${tsType}`);
            }
          });
        }
      });
    }

    // Generate types for responses
    if (includeResponses) {
      this.currentEndpoints.forEach(endpoint => {
        Object.entries(endpoint.responses).forEach(([statusCode, response]: [string, any]) => {
          if (response.content) {
            Object.entries(response.content).forEach(([mediaType, content]: [string, any]) => {
              if (content.schema && !content.schema.$ref) {
                const typeName = `${endpoint.method.toUpperCase()}${endpoint.path.replace(/[^a-zA-Z0-9]/g, '')}Response${statusCode}`;
                const tsType = convertSchemaToTS(content.schema, typeName);
                interfaces.push(`export interface ${typeName} ${tsType}`);
              }
            });
          }
        });
      });
    }

    const result = exportFormat === 'merged' 
      ? interfaces.join('\n\n')
      : interfaces.map(iface => `// ${iface.split(' ')[2]}.ts\n${iface}`).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: result
      }],
    };
  }

  private generateValidationDecorator(schema: any): string {
    const decorators: string[] = [];
    
    if (schema.type === 'string') {
      if (schema.minLength) decorators.push(`@MinLength(${schema.minLength})`);
      if (schema.maxLength) decorators.push(`@MaxLength(${schema.maxLength})`);
      if (schema.pattern) decorators.push(`@Matches(/${schema.pattern}/)`);
      if (schema.format === 'email') decorators.push('@IsEmail()');
      if (schema.format === 'url') decorators.push('@IsUrl()');
    }
    
    if (schema.type === 'number' || schema.type === 'integer') {
      if (schema.minimum) decorators.push(`@Min(${schema.minimum})`);
      if (schema.maximum) decorators.push(`@Max(${schema.maximum})`);
      if (schema.type === 'integer') decorators.push('@IsInt()');
    }
    
    if (schema.required) decorators.push('@IsNotEmpty()');
    
    return decorators.length > 0 ? decorators.join('\n  ') + '\n  ' : '';
  }

  private async findSchemaDependencies(args: any) {
    if (!this.currentSpec || !this.currentSpec.components?.schemas) {
      return {
        content: [{ type: 'text', text: 'No OpenAPI specification or schemas loaded.' }],
        isError: true,
      };
    }

    const { schemaName, direction = 'both', depth = 5 } = args;
    const schemas = this.currentSpec.components.schemas;

    if (!schemas[schemaName]) {
      return {
        content: [{ type: 'text', text: `Schema '${schemaName}' not found.` }],
        isError: true,
      };
    }

    const findRefs = (obj: any, visited = new Set(), currentDepth = 0): string[] => {
      if (currentDepth >= depth || !obj || typeof obj !== 'object') return [];
      
      const refs: string[] = [];
      
      if (obj.$ref && typeof obj.$ref === 'string') {
        const refName = obj.$ref.split('/').pop();
        if (refName && !visited.has(refName)) {
          refs.push(refName);
          visited.add(refName);
          if (schemas[refName]) {
            refs.push(...findRefs(schemas[refName], visited, currentDepth + 1));
          }
        }
      }
      
      if (Array.isArray(obj)) {
        obj.forEach(item => refs.push(...findRefs(item, visited, currentDepth)));
      } else {
        Object.values(obj).forEach(value => refs.push(...findRefs(value, visited, currentDepth)));
      }
      
      return [...new Set(refs)];
    };

    const dependencies = direction === 'dependents' ? [] : findRefs(schemas[schemaName]);
    
    const dependents = direction === 'dependencies' ? [] : Object.entries(schemas)
      .filter(([name]) => name !== schemaName)
      .filter(([_, schema]) => findRefs(schema).includes(schemaName))
      .map(([name]) => name);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          schema: schemaName,
          dependencies: dependencies.length > 0 ? dependencies : undefined,
          dependents: dependents.length > 0 ? dependents : undefined,
          dependencyTree: direction !== 'dependents' ? this.buildDependencyTree(schemaName, schemas, depth) : undefined
        }, null, 2)
      }],
    };
  }

  private buildDependencyTree(schemaName: string, schemas: any, maxDepth: number, visited = new Set(), depth = 0): any {
    if (depth >= maxDepth || visited.has(schemaName) || !schemas[schemaName]) {
      return { name: schemaName, circular: visited.has(schemaName) };
    }

    visited.add(schemaName);
    const schema = schemas[schemaName];
    const refs = this.extractDirectRefs(schema);
    
    return {
      name: schemaName,
      dependencies: refs.map(ref => this.buildDependencyTree(ref, schemas, maxDepth, new Set(visited), depth + 1))
    };
  }

  private extractDirectRefs(obj: any): string[] {
    const refs: string[] = [];
    
    if (!obj || typeof obj !== 'object') return refs;
    
    if (obj.$ref && typeof obj.$ref === 'string') {
      const refName = obj.$ref.split('/').pop();
      if (refName) refs.push(refName);
    }
    
    if (Array.isArray(obj)) {
      obj.forEach(item => refs.push(...this.extractDirectRefs(item)));
    } else {
      Object.values(obj).forEach(value => refs.push(...this.extractDirectRefs(value)));
    }
    
    return [...new Set(refs)];
  }

  private async validateRequestExamples(args: any) {
    if (!this.currentSpec) {
      return {
        content: [{ type: 'text', text: 'No OpenAPI specification loaded.' }],
        isError: true,
      };
    }

    const { endpoint, strictMode = false } = args;
    const results: any[] = [];

    const validateExample = (example: any, schema: any, path: string): any[] => {
      const errors: any[] = [];
      
      if (!schema || !example) return errors;

      // Handle $ref
      if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        if (this.currentSpec?.components?.schemas?.[refName]) {
          return validateExample(example, this.currentSpec.components.schemas[refName], path);
        }
        return errors;
      }

      // Type validation
      if (schema.type) {
        const actualType = Array.isArray(example) ? 'array' : typeof example;
        const expectedType = schema.type === 'integer' ? 'number' : schema.type;
        
        if (actualType !== expectedType) {
          errors.push({
            path,
            error: `Type mismatch: expected ${expectedType}, got ${actualType}`,
            expected: expectedType,
            actual: actualType
          });
        }

        // Additional validations
        if (schema.type === 'string') {
          if (schema.minLength && example.length < schema.minLength) {
            errors.push({ path, error: `String too short: ${example.length} < ${schema.minLength}` });
          }
          if (schema.maxLength && example.length > schema.maxLength) {
            errors.push({ path, error: `String too long: ${example.length} > ${schema.maxLength}` });
          }
          if (schema.pattern && !new RegExp(schema.pattern).test(example)) {
            errors.push({ path, error: `String doesn't match pattern: ${schema.pattern}` });
          }
          if (schema.enum && !schema.enum.includes(example)) {
            errors.push({ path, error: `Value not in enum: ${schema.enum.join(', ')}` });
          }
        }

        if (schema.type === 'number' || schema.type === 'integer') {
          if (schema.minimum !== undefined && example < schema.minimum) {
            errors.push({ path, error: `Number too small: ${example} < ${schema.minimum}` });
          }
          if (schema.maximum !== undefined && example > schema.maximum) {
            errors.push({ path, error: `Number too large: ${example} > ${schema.maximum}` });
          }
        }

        if (schema.type === 'object' && schema.properties) {
          // Check required properties
          if (schema.required) {
            schema.required.forEach((reqProp: string) => {
              if (!(reqProp in example)) {
                errors.push({ path: `${path}.${reqProp}`, error: `Required property missing` });
              }
            });
          }

          // Validate properties
          Object.entries(example).forEach(([prop, value]) => {
            if (schema.properties[prop]) {
              errors.push(...validateExample(value, schema.properties[prop], `${path}.${prop}`));
            } else if (strictMode) {
              errors.push({ path: `${path}.${prop}`, error: `Additional property not allowed in strict mode` });
            }
          });
        }

        if (schema.type === 'array' && schema.items) {
          example.forEach((item: any, index: number) => {
            errors.push(...validateExample(item, schema.items, `${path}[${index}]`));
          });
        }
      }

      return errors;
    };

    const endpointsToCheck = endpoint 
      ? this.currentEndpoints.filter(ep => `${ep.method.toUpperCase()}:${ep.path}` === endpoint)
      : this.currentEndpoints;

    endpointsToCheck.forEach(ep => {
      const endpointId = `${ep.method.toUpperCase()} ${ep.path}`;
      
      // Check request body examples
      if (ep.requestBody?.content) {
        Object.entries(ep.requestBody.content).forEach(([mediaType, content]: [string, any]) => {
          if (content.schema && content.example) {
            const errors = validateExample(content.example, content.schema, 'requestBody');
            if (errors.length > 0) {
              results.push({
                endpoint: endpointId,
                type: 'request',
                mediaType,
                errors
              });
            }
          }
        });
      }

      // Check response examples
      Object.entries(ep.responses).forEach(([statusCode, response]: [string, any]) => {
        if (response.content) {
          Object.entries(response.content).forEach(([mediaType, content]: [string, any]) => {
            if (content.schema && content.example) {
              const errors = validateExample(content.example, content.schema, 'response');
              if (errors.length > 0) {
                results.push({
                  endpoint: endpointId,
                  type: 'response',
                  statusCode,
                  mediaType,
                  errors
                });
              }
            }
          });
        }
      });
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          validationMode: strictMode ? 'strict' : 'lenient',
          totalIssues: results.reduce((sum, r) => sum + r.errors.length, 0),
          results
        }, null, 2)
      }],
    };
  }

  private async extractAuthPatterns(args: any) {
    if (!this.currentSpec) {
      return {
        content: [{ type: 'text', text: 'No OpenAPI specification loaded.' }],
        isError: true,
      };
    }

    const { includeEndpointMapping = true, analyzeScopes = true } = args;
    
    const authSchemes = this.currentSpec.components?.securitySchemes || {};
    const globalSecurity = this.currentSpec.security || [];
    
    const analysis = {
      securitySchemes: Object.entries(authSchemes).map(([name, scheme]: [string, any]) => ({
        name,
        type: scheme.type,
        description: scheme.description,
        details: this.extractSecurityDetails(scheme)
      })),
      globalSecurity: globalSecurity,
      endpointSecurity: includeEndpointMapping ? this.analyzeEndpointSecurity() : undefined,
      scopeAnalysis: analyzeScopes ? this.analyzeOAuthScopes(authSchemes) : undefined,
      recommendations: this.generateSecurityRecommendations(authSchemes, globalSecurity)
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(analysis, null, 2)
      }],
    };
  }

  private extractSecurityDetails(scheme: any): any {
    const details: any = { type: scheme.type };
    
    switch (scheme.type) {
      case 'apiKey':
        details.in = scheme.in;
        details.name = scheme.name;
        break;
      case 'http':
        details.scheme = scheme.scheme;
        details.bearerFormat = scheme.bearerFormat;
        break;
      case 'oauth2':
        details.flows = scheme.flows;
        if (scheme.flows) {
          Object.entries(scheme.flows).forEach(([flowType, flow]: [string, any]) => {
            if (flow.scopes) {
              details.availableScopes = Object.keys(flow.scopes);
            }
          });
        }
        break;
      case 'openIdConnect':
        details.openIdConnectUrl = scheme.openIdConnectUrl;
        break;
    }
    
    return details;
  }

  private analyzeEndpointSecurity(): any[] {
    return this.currentEndpoints.map(endpoint => ({
      endpoint: `${endpoint.method.toUpperCase()} ${endpoint.path}`,
      security: endpoint.security || [],
      authRequired: (endpoint.security || []).length > 0,
      authOptions: (endpoint.security || []).map(sec => Object.keys(sec)).flat()
    }));
  }

  private analyzeOAuthScopes(authSchemes: any): any {
    const oauthSchemes = Object.entries(authSchemes).filter(([_, scheme]: [string, any]) => scheme.type === 'oauth2');
    
    if (oauthSchemes.length === 0) return null;
    
    const scopeUsage: { [scope: string]: string[] } = {};
    
    // Analyze scope usage across endpoints
    this.currentEndpoints.forEach(endpoint => {
      const endpointId = `${endpoint.method.toUpperCase()} ${endpoint.path}`;
      (endpoint.security || []).forEach(sec => {
        Object.entries(sec).forEach(([schemeName, scopes]: [string, string[]]) => {
          if (scopes && Array.isArray(scopes)) {
            scopes.forEach(scope => {
              if (!scopeUsage[scope]) scopeUsage[scope] = [];
              scopeUsage[scope].push(endpointId);
            });
          }
        });
      });
    });
    
    return {
      totalScopes: Object.keys(scopeUsage).length,
      scopeUsage,
      unusedScopes: this.findUnusedOAuthScopes(oauthSchemes, scopeUsage)
    };
  }

  private findUnusedOAuthScopes(oauthSchemes: any[], scopeUsage: { [scope: string]: string[] }): string[] {
    const definedScopes = new Set<string>();
    
    oauthSchemes.forEach(([_, scheme]: [string, any]) => {
      if (scheme.flows) {
        Object.values(scheme.flows).forEach((flow: any) => {
          if (flow.scopes) {
            Object.keys(flow.scopes).forEach(scope => definedScopes.add(scope));
          }
        });
      }
    });
    
    const usedScopes = new Set(Object.keys(scopeUsage));
    return Array.from(definedScopes).filter(scope => !usedScopes.has(scope));
  }

  private generateSecurityRecommendations(authSchemes: any, globalSecurity: any[]): string[] {
    const recommendations: string[] = [];
    
    if (Object.keys(authSchemes).length === 0) {
      recommendations.push('Consider adding authentication schemes to secure your API');
    }
    
    if (globalSecurity.length === 0) {
      recommendations.push('Consider setting global security requirements');
    }
    
    const hasOAuth = Object.values(authSchemes).some((scheme: any) => scheme.type === 'oauth2');
    const hasApiKey = Object.values(authSchemes).some((scheme: any) => scheme.type === 'apiKey');
    
    if (hasApiKey && !hasOAuth) {
      recommendations.push('Consider implementing OAuth2 for better security than API keys alone');
    }
    
    const unsecuredEndpoints = this.currentEndpoints.filter(ep => !ep.security || ep.security.length === 0);
    if (unsecuredEndpoints.length > 0) {
      recommendations.push(`${unsecuredEndpoints.length} endpoints have no security requirements`);
    }
    
    return recommendations;
  }

  private async generateMockData(args: any) {
    if (!this.currentSpec) {
      return {
        content: [{ type: 'text', text: 'No OpenAPI specification loaded.' }],
        isError: true,
      };
    }

    const { schemaName, endpoint, count = 3, realistic = true, format = 'json' } = args;
    
    const generateMockValue = (schema: any, fieldName?: string): any => {
      if (!schema) return null;

      // Handle $ref
      if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        if (this.currentSpec?.components?.schemas?.[refName]) {
          return generateMockValue(this.currentSpec.components.schemas[refName], fieldName);
        }
        return null;
      }

      // Use example if available
      if (schema.example !== undefined) {
        return schema.example;
      }

      // Handle enum
      if (schema.enum) {
        return schema.enum[Math.floor(Math.random() * schema.enum.length)];
      }

      // Generate based on type
      switch (schema.type) {
        case 'string':
          return this.generateStringValue(schema, fieldName, realistic);
        case 'number':
        case 'integer':
          return this.generateNumberValue(schema);
        case 'boolean':
          return Math.random() > 0.5;
        case 'array':
          const arrayLength = Math.min(count, 5);
          return Array.from({ length: arrayLength }, () => 
            generateMockValue(schema.items, fieldName));
        case 'object':
          if (schema.properties) {
            const obj: any = {};
            Object.entries(schema.properties).forEach(([propName, propSchema]) => {
              const isRequired = schema.required?.includes(propName);
              if (isRequired || Math.random() > 0.3) {
                obj[propName] = generateMockValue(propSchema, propName);
              }
            });
            return obj;
          }
          return {};
        default:
          return null;
      }
    };

    let mockData: any[] = [];

    if (schemaName) {
      const schema = this.currentSpec.components?.schemas?.[schemaName];
      if (!schema) {
        return {
          content: [{ type: 'text', text: `Schema '${schemaName}' not found.` }],
          isError: true,
        };
      }
      mockData = Array.from({ length: count }, () => generateMockValue(schema));
    } else if (endpoint) {
      const [method, path] = endpoint.split(':');
      const ep = this.currentEndpoints.find(e => 
        e.method.toUpperCase() === method.toUpperCase() && e.path === path);
      
      if (!ep) {
        return {
          content: [{ type: 'text', text: `Endpoint '${endpoint}' not found.` }],
          isError: true,
        };
      }

      // Generate mock data for request body
      if (ep.requestBody?.content) {
        const content = Object.values(ep.requestBody.content)[0] as any;
        if (content.schema) {
          mockData = Array.from({ length: count }, () => generateMockValue(content.schema));
        }
      }
    }

    let output = '';
    switch (format) {
      case 'javascript':
        output = `const mockData = ${JSON.stringify(mockData, null, 2)};`;
        break;
      case 'typescript':
        const typeName = schemaName || 'MockData';
        output = `const mockData: ${typeName}[] = ${JSON.stringify(mockData, null, 2)} as ${typeName}[];`;
        break;
      default:
        output = JSON.stringify(mockData, null, 2);
    }

    return {
      content: [{
        type: 'text',
        text: output
      }],
    };
  }

  private generateStringValue(schema: any, fieldName?: string, realistic = true): string {
    if (schema.format) {
      switch (schema.format) {
        case 'email':
          return realistic ? `user${Math.floor(Math.random() * 1000)}@example.com` : 'user@example.com';
        case 'uri':
        case 'url':
          return 'https://example.com';
        case 'date':
          return new Date().toISOString().split('T')[0];
        case 'date-time':
          return new Date().toISOString();
        case 'uuid':
          return '550e8400-e29b-41d4-a716-446655440000';
      }
    }

    if (realistic && fieldName) {
      const lowerName = fieldName.toLowerCase();
      if (lowerName.includes('name')) return 'John Doe';
      if (lowerName.includes('email')) return 'john.doe@example.com';
      if (lowerName.includes('phone')) return '+1-555-123-4567';
      if (lowerName.includes('address')) return '123 Main St, Anytown, USA';
      if (lowerName.includes('id')) return 'abc123';
      if (lowerName.includes('url')) return 'https://example.com';
    }

    const minLength = schema.minLength || 1;
    const maxLength = Math.min(schema.maxLength || 20, 50);
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    
    return 'lorem ipsum'.repeat(Math.ceil(length / 11)).substring(0, length);
  }

  private generateNumberValue(schema: any): number {
    const min = schema.minimum || 0;
    const max = schema.maximum || 100;
    const value = Math.random() * (max - min) + min;
    return schema.type === 'integer' ? Math.floor(value) : Math.round(value * 100) / 100;
  }

  private async findUnusedSchemas(args: any) {
    if (!this.currentSpec || !this.currentSpec.components?.schemas) {
      return {
        content: [{ type: 'text', text: 'No OpenAPI specification or schemas loaded.' }],
        isError: true,
      };
    }

    const { includeIndirectReferences = true } = args;
    const schemas = this.currentSpec.components.schemas;
    const usedSchemas = new Set<string>();

    // Find all $ref references in the spec
    const findRefs = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;
      
      if (obj.$ref && typeof obj.$ref === 'string') {
        const refName = obj.$ref.split('/').pop();
        if (refName) usedSchemas.add(refName);
      }
      
      if (Array.isArray(obj)) {
        obj.forEach(findRefs);
      } else {
        Object.values(obj).forEach(findRefs);
      }
    };

    // Start with paths and components
    findRefs(this.currentSpec.paths);
    if (this.currentSpec.components) {
      findRefs(this.currentSpec.components);
    }

    // If including indirect references, also check referenced schemas
    if (includeIndirectReferences) {
      let previousSize = 0;
      while (usedSchemas.size !== previousSize) {
        previousSize = usedSchemas.size;
        Array.from(usedSchemas).forEach(schemaName => {
          if (schemas[schemaName]) {
            findRefs(schemas[schemaName]);
          }
        });
      }
    }

    const allSchemas = Object.keys(schemas);
    const unusedSchemas = allSchemas.filter(name => !usedSchemas.has(name));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalSchemas: allSchemas.length,
          usedSchemas: Array.from(usedSchemas).sort(),
          unusedSchemas: unusedSchemas.sort(),
          unusedCount: unusedSchemas.length,
          usagePercentage: Math.round((usedSchemas.size / allSchemas.length) * 100)
        }, null, 2)
      }],
    };
  }

  private async analyzeSchemaEvolution(args: any) {
    if (!this.currentSpec || !this.currentSpec.components?.schemas) {
      return {
        content: [{ type: 'text', text: 'No OpenAPI specification or schemas loaded.' }],
        isError: true,
      };
    }

    const { schemaName, suggestVersioning = true } = args;
    const schemas = this.currentSpec.components.schemas;

    if (schemaName && !schemas[schemaName]) {
      return {
        content: [{ type: 'text', text: `Schema '${schemaName}' not found.` }],
        isError: true,
      };
    }

    const analyzeSchema = (name: string, schema: any) => {
      const analysis = {
        schemaName: name,
        extensibility: this.assessExtensibility(schema),
        breakingChangeRisk: this.assessBreakingChangeRisk(schema),
        versioningStrategy: suggestVersioning ? this.suggestVersioningStrategy(schema) : undefined,
        evolutionRecommendations: this.generateEvolutionRecommendations(schema)
      };
      return analysis;
    };

    if (schemaName) {
      const analysis = analyzeSchema(schemaName, schemas[schemaName]);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }],
      };
    } else {
      const analyses = Object.entries(schemas).map(([name, schema]) => 
        analyzeSchema(name, schema));
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            overallAnalysis: {
              totalSchemas: analyses.length,
              highRiskSchemas: analyses.filter(a => a.breakingChangeRisk === 'high').length,
              recommendationsCount: analyses.reduce((sum, a) => sum + a.evolutionRecommendations.length, 0)
            },
            schemaAnalyses: analyses
          }, null, 2)
        }],
      };
    }
  }

  private assessExtensibility(schema: any): string {
    let score = 0;
    
    if (schema.additionalProperties === true) score += 2;
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') score += 1;
    if (schema.oneOf || schema.anyOf) score += 2;
    if (schema.allOf) score += 1;
    
    if (score >= 3) return 'high';
    if (score >= 1) return 'medium';
    return 'low';
  }

  private assessBreakingChangeRisk(schema: any): string {
    let risk = 0;
    
    if (schema.required && schema.required.length > 0) risk += 2;
    if (schema.additionalProperties === false) risk += 2;
    if (schema.enum) risk += 1;
    if (schema.pattern) risk += 1;
    if (schema.minimum || schema.maximum) risk += 1;
    
    if (risk >= 4) return 'high';
    if (risk >= 2) return 'medium';
    return 'low';
  }

  private suggestVersioningStrategy(schema: any): any {
    const recommendations = [];
    
    if (schema.required && schema.required.length > 0) {
      recommendations.push('Consider making new fields optional to maintain backward compatibility');
    }
    
    if (schema.additionalProperties === false) {
      recommendations.push('Strict schema - consider versioning when adding new properties');
    }
    
    if (schema.enum) {
      recommendations.push('Enum values - additions are usually safe, removals require major version');
    }
    
    return {
      strategy: this.assessExtensibility(schema) === 'high' ? 'minor-version-friendly' : 'requires-careful-versioning',
      recommendations
    };
  }

  private generateEvolutionRecommendations(schema: any): string[] {
    const recommendations = [];
    
    if (!schema.description) {
      recommendations.push('Add comprehensive description for better documentation');
    }
    
    if (schema.type === 'object' && !schema.additionalProperties) {
      recommendations.push('Consider allowing additionalProperties for future extensibility');
    }
    
    if (schema.required && schema.required.length > 3) {
      recommendations.push('High number of required fields may make evolution difficult');
    }
    
    if (!schema.example && !schema.examples) {
      recommendations.push('Add examples to help with testing and documentation');
    }
    
    return recommendations;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('OpenAPI Explorer MCP Server running on stdio');
  }
}

const server = new OpenAPIExplorerMCPServer();
server.run().catch(console.error);