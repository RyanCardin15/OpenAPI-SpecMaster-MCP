import yaml from 'js-yaml';
import { OpenAPISpec, EndpointData, Operation, Parameter, Response, RequestBody } from '../types/openapi.js';

export class OpenAPIParser {
  private spec: OpenAPISpec | null = null;

  async parseFromText(content: string): Promise<OpenAPISpec> {
    try {
      // Try JSON first
      this.spec = JSON.parse(content);
    } catch {
      try {
        // Try YAML
        this.spec = yaml.load(content) as OpenAPISpec;
      } catch (error) {
        throw new Error('Invalid OpenAPI specification format. Please provide valid JSON or YAML.');
      }
    }

    if (!this.spec) {
      throw new Error('Invalid specification format.');
    }

    // Check if it's Swagger 2.0 and convert to OpenAPI 3.0
    if ((this.spec as any).swagger && (this.spec as any).swagger.startsWith('2.')) {
      this.spec = this.convertSwagger2ToOpenAPI3(this.spec as any);
    } else if (!this.spec.openapi) {
      throw new Error('Invalid OpenAPI specification. Missing openapi version.');
    }

    return this.spec;
  }

  async parseFromFile(file: File): Promise<OpenAPISpec> {
    const content = await file.text();
    return this.parseFromText(content);
  }

  async parseFromUrl(url: string): Promise<OpenAPISpec> {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json, application/yaml, text/yaml, text/plain',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const content = await response.text();

      // Determine if the response is JSON or YAML based on content type or content
      if (contentType.includes('application/json') || content.trim().startsWith('{')) {
        try {
          this.spec = JSON.parse(content);
        } catch (error) {
          throw new Error('Invalid JSON format in the fetched specification.');
        }
      } else {
        try {
          this.spec = yaml.load(content) as OpenAPISpec;
        } catch (error) {
          throw new Error('Invalid YAML format in the fetched specification.');
        }
      }

      if (!this.spec) {
        throw new Error('Invalid specification format.');
      }

      // Check if it's Swagger 2.0 and convert to OpenAPI 3.0
      if ((this.spec as any).swagger && (this.spec as any).swagger.startsWith('2.')) {
        this.spec = this.convertSwagger2ToOpenAPI3(this.spec as any);
      } else if (!this.spec.openapi) {
        throw new Error('Invalid OpenAPI specification. Missing openapi version.');
      }

      return this.spec;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to fetch or parse the OpenAPI specification from the provided URL.');
    }
  }

  private convertSwagger2ToOpenAPI3(swagger2: any): OpenAPISpec {
    const openapi3: OpenAPISpec = {
      openapi: '3.0.0',
      info: {
        title: swagger2.info?.title || 'API',
        version: swagger2.info?.version || '1.0.0',
        description: swagger2.info?.description,
        termsOfService: swagger2.info?.termsOfService,
        contact: swagger2.info?.contact,
        license: swagger2.info?.license
      },
      paths: {}
    };

    // Convert servers
    if (swagger2.host || swagger2.basePath) {
      const protocol = swagger2.schemes?.[0] || 'https';
      const host = swagger2.host || 'localhost';
      const basePath = swagger2.basePath || '';
      openapi3.servers = [{
        url: `${protocol}://${host}${basePath}`,
        description: 'Converted from Swagger 2.0'
      }];
    }

    // Convert tags
    if (swagger2.tags) {
      openapi3.tags = swagger2.tags;
    }

    // Convert paths
    if (swagger2.paths) {
      Object.entries(swagger2.paths).forEach(([path, pathItem]: [string, any]) => {
        const convertedPathItem: any = {};

        // Convert operations
        ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].forEach(method => {
          if (pathItem[method]) {
            convertedPathItem[method] = this.convertSwagger2Operation(pathItem[method], swagger2.definitions);
          }
        });

        // Convert path-level parameters
        if (pathItem.parameters) {
          convertedPathItem.parameters = pathItem.parameters.map((param: any) => 
            this.convertSwagger2Parameter(param, swagger2.definitions)
          );
        }

        openapi3.paths[path] = convertedPathItem;
      });
    }

    // Convert definitions to components/schemas
    if (swagger2.definitions) {
      openapi3.components = {
        schemas: this.convertSwagger2Definitions(swagger2.definitions)
      };
    }

    return openapi3;
  }

  private convertSwagger2Operation(operation: any, definitions: any): Operation {
    const converted: Operation = {
      summary: operation.summary,
      description: operation.description,
      operationId: operation.operationId,
      tags: operation.tags,
      deprecated: operation.deprecated,
      responses: {}
    };

    // Convert parameters
    if (operation.parameters) {
      const convertedParams: Parameter[] = [];
      let requestBody: any = null;

      operation.parameters.forEach((param: any) => {
        if (param.in === 'body') {
          // Convert body parameter to requestBody
          requestBody = {
            description: param.description,
            required: param.required,
            content: {
              'application/json': {
                schema: this.convertSwagger2Schema(param.schema, definitions)
              }
            }
          };
        } else if (param.in === 'formData') {
          // Convert formData to requestBody
          if (!requestBody) {
            requestBody = {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties: {}
                  }
                }
              }
            };
          }
          requestBody.content['application/x-www-form-urlencoded'].schema.properties[param.name] = {
            type: param.type,
            description: param.description
          };
        } else {
          // Regular parameter
          convertedParams.push(this.convertSwagger2Parameter(param, definitions));
        }
      });

      if (convertedParams.length > 0) {
        converted.parameters = convertedParams;
      }
      if (requestBody) {
        converted.requestBody = requestBody;
      }
    }

    // Convert responses
    if (operation.responses) {
      Object.entries(operation.responses).forEach(([code, response]: [string, any]) => {
        converted.responses[code] = this.convertSwagger2Response(response, definitions);
      });
    }

    return converted;
  }

  private convertSwagger2Parameter(param: any, definitions: any): Parameter {
    const converted: Parameter = {
      name: param.name,
      in: param.in as any,
      description: param.description,
      required: param.required,
      deprecated: param.deprecated
    };

    if (param.schema) {
      converted.schema = this.convertSwagger2Schema(param.schema, definitions);
    } else {
      // Convert simple parameter to schema
      converted.schema = {
        type: param.type,
        format: param.format,
        enum: param.enum,
        default: param.default
      };
    }

    return converted;
  }

  private convertSwagger2Response(response: any, definitions: any): Response {
    const converted: Response = {
      description: response.description || 'Response'
    };

    if (response.schema) {
      converted.content = {
        'application/json': {
          schema: this.convertSwagger2Schema(response.schema, definitions)
        }
      };
    }

    if (response.headers) {
      converted.headers = response.headers;
    }

    return converted;
  }

  private convertSwagger2Schema(schema: any, definitions: any): any {
    if (!schema) return {};

    if (schema.$ref) {
      // Convert reference
      const refName = schema.$ref.replace('#/definitions/', '');
      return { $ref: `#/components/schemas/${refName}` };
    }

    const converted: any = {
      type: schema.type,
      format: schema.format,
      description: schema.description,
      enum: schema.enum,
      default: schema.default,
      example: schema.example
    };

    if (schema.items) {
      converted.items = this.convertSwagger2Schema(schema.items, definitions);
    }

    if (schema.properties) {
      converted.properties = {};
      Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
        converted.properties[key] = this.convertSwagger2Schema(prop, definitions);
      });
    }

    if (schema.required) {
      converted.required = schema.required;
    }

    if (schema.allOf) {
      converted.allOf = schema.allOf.map((s: any) => this.convertSwagger2Schema(s, definitions));
    }

    return converted;
  }

  private convertSwagger2Definitions(definitions: any): any {
    const converted: any = {};
    
    Object.entries(definitions).forEach(([key, definition]: [string, any]) => {
      converted[key] = this.convertSwagger2Schema(definition, definitions);
    });

    return converted;
  }

  extractEndpoints(): EndpointData[] {
    if (!this.spec) return [];

    const endpoints: EndpointData[] = [];
    const paths = this.spec.paths;

    Object.entries(paths).forEach(([path, pathItem]) => {
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];
      
      methods.forEach(method => {
        const operation = pathItem[method as keyof typeof pathItem] as Operation;
        if (!operation) return;

        const parameters = this.extractParameters((operation as any).parameters || [], (pathItem as any).parameters || []);
        const pathSegments = path.split('/').filter(Boolean);
        const hasPathParams = path.includes('{');
        const hasQueryParams = parameters.some(p => p.in === 'query');
        const hasRequestBody = !!operation.requestBody;
        const responseTypes = Object.keys(operation.responses || {});

        const endpoint: EndpointData = {
          id: `${method.toUpperCase()}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
          path,
          method: method.toUpperCase(),
          operation,
          tags: operation.tags || [],
          summary: operation.summary,
          description: operation.description,
          parameters,
          requestBody: operation.requestBody as RequestBody,
          responses: this.extractResponses(operation.responses),
          deprecated: operation.deprecated || false,
          businessContext: this.generateBusinessContext(operation),
          aiSuggestions: this.generateAISuggestions(operation, path, method),
          complexity: this.calculateComplexity(operation, parameters, hasRequestBody),
          security: operation.security,
          pathSegments,
          hasPathParams,
          hasQueryParams,
          hasRequestBody,
          responseTypes,
          estimatedResponseTime: this.estimateResponseTime(operation, parameters, hasRequestBody)
        };

        endpoints.push(endpoint);
      });
    });

    return endpoints;
  }

  private calculateComplexity(operation: Operation, parameters: Parameter[], hasRequestBody: boolean): 'low' | 'medium' | 'high' {
    let score = 0;

    // Base complexity from parameters
    score += parameters.length * 0.5;

    // Request body adds complexity
    if (hasRequestBody) score += 2;

    // Multiple response codes add complexity
    const responseCount = Object.keys(operation.responses || {}).length;
    score += responseCount * 0.3;

    // Security requirements add complexity
    if (operation.security && operation.security.length > 0) score += 1;

    // Tags suggest organizational complexity
    if (operation.tags && operation.tags.length > 1) score += 0.5;

    if (score <= 2) return 'low';
    if (score <= 5) return 'medium';
    return 'high';
  }

  private estimateResponseTime(operation: Operation, parameters: Parameter[], hasRequestBody: boolean): 'fast' | 'medium' | 'slow' {
    let score = 0;

    // GET requests are typically faster
    if (operation.operationId?.toLowerCase().includes('get') || 
        operation.summary?.toLowerCase().includes('get') ||
        operation.summary?.toLowerCase().includes('list')) {
      score -= 1;
    }

    // POST/PUT/PATCH with body are typically slower
    if (hasRequestBody) score += 1;

    // Many parameters suggest complex processing
    if (parameters.length > 5) score += 1;

    // Search/filter operations might be slower
    if (operation.summary?.toLowerCase().includes('search') ||
        operation.summary?.toLowerCase().includes('filter') ||
        parameters.some(p => p.name.toLowerCase().includes('search') || p.name.toLowerCase().includes('filter'))) {
      score += 1;
    }

    if (score <= 0) return 'fast';
    if (score <= 1) return 'medium';
    return 'slow';
  }

  private extractParameters(operationParams: any[], pathParams: any[]): Parameter[] {
    const allParams = [...pathParams, ...operationParams];
    return allParams.map(param => {
      if (param.$ref) {
        // Handle reference - would need to resolve from components
        return param;
      }
      return param as Parameter;
    });
  }

  private extractResponses(responses: any): { [key: string]: Response } {
    const result: { [key: string]: Response } = {};
    
    Object.entries(responses).forEach(([code, response]) => {
      if ((response as any).$ref) {
        // Handle reference
        result[code] = response as Response;
      } else {
        result[code] = response as Response;
      }
    });

    return result;
  }

  private generateBusinessContext(operation: Operation): string {
    const tags = operation.tags?.join(', ') || 'General';
    const summary = operation.summary || 'No summary available';
    
    // Generate business-friendly context based on operation details
    if (operation.summary?.toLowerCase().includes('create') || operation.summary?.toLowerCase().includes('add')) {
      return `Business Impact: Creates new ${tags.toLowerCase()} resources. Use this endpoint to add new data to the system.`;
    } else if (operation.summary?.toLowerCase().includes('get') || operation.summary?.toLowerCase().includes('list') || operation.summary?.toLowerCase().includes('fetch')) {
      return `Business Impact: Retrieves ${tags.toLowerCase()} information. Use this endpoint to access and display data to users.`;
    } else if (operation.summary?.toLowerCase().includes('update') || operation.summary?.toLowerCase().includes('modify')) {
      return `Business Impact: Updates existing ${tags.toLowerCase()} resources. Use this endpoint to modify data based on user actions.`;
    } else if (operation.summary?.toLowerCase().includes('delete') || operation.summary?.toLowerCase().includes('remove')) {
      return `Business Impact: Removes ${tags.toLowerCase()} resources. Use this endpoint to clean up or delete data as requested by users.`;
    }

    return `Business Impact: ${summary} - Part of ${tags} functionality.`;
  }

  private generateAISuggestions(operation: Operation, path: string, method: string): string[] {
    const suggestions: string[] = [];
    
    // Generate AI-powered suggestions based on operation characteristics
    if (method.toLowerCase() === 'get' && path.includes('{id}')) {
      suggestions.push('💡 Perfect for fetching specific record details in your app');
      suggestions.push('🔍 Can be used for detail views, edit forms, or data validation');
    } else if (method.toLowerCase() === 'get' && !path.includes('{id}')) {
      suggestions.push('📋 Ideal for listing data in tables, dropdowns, or search results');
      suggestions.push('🔄 Consider implementing pagination if not already present');
    } else if (method.toLowerCase() === 'post') {
      suggestions.push('✨ Use for creating new records from user forms');
      suggestions.push('💾 Remember to validate input data before submission');
    } else if (method.toLowerCase() === 'put' || method.toLowerCase() === 'patch') {
      suggestions.push('✏️ Perfect for edit forms and data updates');
      suggestions.push('🔒 Ensure proper authorization before allowing updates');
    } else if (method.toLowerCase() === 'delete') {
      suggestions.push('🗑️ Implement confirmation dialogs for better UX');
      suggestions.push('⚠️ Consider soft deletes for important business data');
    }

    // Add parameter-based suggestions
    if (operation.parameters?.some(p => (p as any).name?.toLowerCase().includes('limit'))) {
      suggestions.push('⚡ Supports pagination - great for performance');
    }

    if (operation.parameters?.some(p => (p as any).name?.toLowerCase().includes('filter'))) {
      suggestions.push('🎯 Supports filtering - perfect for search functionality');
    }

    return suggestions;
  }

  getAllTags(): string[] {
    if (!this.spec) return [];
    
    const tags = new Set<string>();
    
    // Get tags from spec definition
    this.spec.tags?.forEach(tag => tags.add(tag.name));
    
    // Get tags from operations
    Object.values(this.spec.paths).forEach(pathItem => {
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];
      methods.forEach(method => {
        const operation = pathItem[method as keyof typeof pathItem] as Operation;
        if (operation?.tags) {
          operation.tags.forEach(tag => tags.add(tag));
        }
      });
    });

    return Array.from(tags).sort();
  }

  getAllMethods(): string[] {
    if (!this.spec) return [];
    
    const methods = new Set<string>();
    
    Object.values(this.spec.paths).forEach(pathItem => {
      ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].forEach(method => {
        if (pathItem[method as keyof typeof pathItem]) {
          methods.add(method.toUpperCase());
        }
      });
    });

    return Array.from(methods).sort();
  }

  getAllStatusCodes(): string[] {
    if (!this.spec) return [];
    
    const codes = new Set<string>();
    
    Object.values(this.spec.paths).forEach(pathItem => {
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];
      methods.forEach(method => {
        const operation = pathItem[method as keyof typeof pathItem] as Operation;
        if (operation?.responses) {
          Object.keys(operation.responses).forEach(code => codes.add(code));
        }
      });
    });

    return Array.from(codes).sort();
  }

  getSpec(): OpenAPISpec | null {
    return this.spec;
  }
}