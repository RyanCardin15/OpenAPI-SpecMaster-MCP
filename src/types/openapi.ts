export interface OpenAPISpec {
  openapi: string;
  info: Info;
  servers?: Server[];
  paths: Paths;
  components?: Components;
  security?: SecurityRequirement[];
  tags?: Tag[];
  externalDocs?: ExternalDocumentation;
}

export interface Info {
  title: string;
  description?: string;
  termsOfService?: string;
  contact?: Contact;
  license?: License;
  version: string;
}

export interface Contact {
  name?: string;
  url?: string;
  email?: string;
}

export interface License {
  name: string;
  url?: string;
}

export interface Server {
  url: string;
  description?: string;
  variables?: { [key: string]: ServerVariable };
}

export interface ServerVariable {
  enum?: string[];
  default: string;
  description?: string;
}

export interface Paths {
  [path: string]: PathItem;
}

export interface PathItem {
  $ref?: string;
  summary?: string;
  description?: string;
  get?: Operation;
  put?: Operation;
  post?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
  patch?: Operation;
  trace?: Operation;
  servers?: Server[];
  parameters?: (Parameter | Reference)[];
}

export interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  externalDocs?: ExternalDocumentation;
  operationId?: string;
  parameters?: (Parameter | Reference)[];
  requestBody?: RequestBody | Reference;
  responses: Responses;
  callbacks?: { [key: string]: Callback | Reference };
  deprecated?: boolean;
  security?: SecurityRequirement[];
  servers?: Server[];
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  schema?: Schema | Reference;
  example?: any;
  examples?: { [key: string]: Example | Reference };
}

export interface RequestBody {
  description?: string;
  content: { [mediaType: string]: MediaType };
  required?: boolean;
}

export interface Responses {
  [statusCode: string]: Response | Reference;
}

export interface Response {
  description: string;
  headers?: { [key: string]: Header | Reference };
  content?: { [mediaType: string]: MediaType };
  links?: { [key: string]: Link | Reference };
}

export interface MediaType {
  schema?: Schema | Reference;
  example?: any;
  examples?: { [key: string]: Example | Reference };
  encoding?: { [key: string]: Encoding };
}

export interface Schema {
  title?: string;
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: boolean;
  minimum?: number;
  exclusiveMinimum?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  enum?: any[];
  type?: string;
  allOf?: (Schema | Reference)[];
  oneOf?: (Schema | Reference)[];
  anyOf?: (Schema | Reference)[];
  not?: Schema | Reference;
  items?: Schema | Reference;
  properties?: { [key: string]: Schema | Reference };
  additionalProperties?: boolean | Schema | Reference;
  description?: string;
  format?: string;
  default?: any;
  nullable?: boolean;
  discriminator?: Discriminator;
  readOnly?: boolean;
  writeOnly?: boolean;
  xml?: XML;
  externalDocs?: ExternalDocumentation;
  example?: any;
  deprecated?: boolean;
}

export interface Reference {
  $ref: string;
}

export interface Example {
  summary?: string;
  description?: string;
  value?: any;
  externalValue?: string;
}

export interface Header {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  schema?: Schema | Reference;
  example?: any;
  examples?: { [key: string]: Example | Reference };
}

export interface Tag {
  name: string;
  description?: string;
  externalDocs?: ExternalDocumentation;
}

export interface ExternalDocumentation {
  description?: string;
  url: string;
}

export interface Components {
  schemas?: { [key: string]: Schema | Reference };
  responses?: { [key: string]: Response | Reference };
  parameters?: { [key: string]: Parameter | Reference };
  examples?: { [key: string]: Example | Reference };
  requestBodies?: { [key: string]: RequestBody | Reference };
  headers?: { [key: string]: Header | Reference };
  securitySchemes?: { [key: string]: SecurityScheme | Reference };
  links?: { [key: string]: Link | Reference };
  callbacks?: { [key: string]: Callback | Reference };
}

export interface SecurityScheme {
  type: string;
  description?: string;
  name?: string;
  in?: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: OAuthFlows;
  openIdConnectUrl?: string;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: { [key: string]: string };
}

export interface SecurityRequirement {
  [key: string]: string[];
}

export interface Link {
  operationRef?: string;
  operationId?: string;
  parameters?: { [key: string]: any };
  requestBody?: any;
  description?: string;
  server?: Server;
}

export interface Callback {
  [expression: string]: PathItem;
}

export interface Discriminator {
  propertyName: string;
  mapping?: { [key: string]: string };
}

export interface XML {
  name?: string;
  namespace?: string;
  prefix?: string;
  attribute?: boolean;
  wrapped?: boolean;
}

export interface Encoding {
  contentType?: string;
  headers?: { [key: string]: Header | Reference };
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
}

export interface EndpointData {
  id: string;
  path: string;
  method: string;
  operation: Operation;
  tags: string[];
  summary?: string;
  description?: string;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: { [key: string]: Response };
  deprecated?: boolean;
  businessContext?: string;
  aiSuggestions?: string[];
  complexity?: 'low' | 'medium' | 'high';
  security?: SecurityRequirement[];
  pathSegments?: string[];
  hasPathParams?: boolean;
  hasQueryParams?: boolean;
  hasRequestBody?: boolean;
  responseTypes?: string[];
  estimatedResponseTime?: 'fast' | 'medium' | 'slow';
}

export interface FilterState {
  methods: string[];
  tags: string[];
  statusCodes: string[];
  deprecated: boolean | null;
  search: string;
  complexity: string[];
  security: string[];
  pathPattern: string;
  hasParameters: boolean | null;
  hasRequestBody: boolean | null;
  responseTime: string[];
}

export interface GroupingState {
  groupBy: 'none' | 'tag' | 'method' | 'path' | 'complexity' | 'security';
  sortBy: 'path' | 'method' | 'summary' | 'complexity' | 'responseTime';
  sortOrder: 'asc' | 'desc';
}

export interface ViewState {
  layout: 'list' | 'grid' | 'compact' | 'table';
  showDetails: boolean;
  showBusinessContext: boolean;
  showAISuggestions: boolean;
  showCodeExamples: boolean;
  density: 'comfortable' | 'compact' | 'spacious';
}

export interface AnalyticsData {
  totalEndpoints: number;
  methodDistribution: { [method: string]: number };
  tagDistribution: { [tag: string]: number };
  complexityDistribution: { [complexity: string]: number };
  deprecatedCount: number;
  securitySchemes: string[];
  averageParametersPerEndpoint: number;
  pathPatterns: string[];
  responseCodeDistribution: { [code: string]: number };
}