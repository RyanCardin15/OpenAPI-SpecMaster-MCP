import { EndpointData, AnalyticsData } from '../types/openapi.js';

export function generateAnalytics(endpoints: EndpointData[]): AnalyticsData {
  const methodDistribution: { [method: string]: number } = {};
  const tagDistribution: { [tag: string]: number } = {};
  const complexityDistribution: { [complexity: string]: number } = {};
  const responseCodeDistribution: { [code: string]: number } = {};
  const securitySchemes = new Set<string>();
  const pathPatterns = new Set<string>();
  
  let deprecatedCount = 0;
  let totalParameters = 0;

  endpoints.forEach(endpoint => {
    // Method distribution
    methodDistribution[endpoint.method] = (methodDistribution[endpoint.method] || 0) + 1;

    // Tag distribution
    endpoint.tags.forEach(tag => {
      tagDistribution[tag] = (tagDistribution[tag] || 0) + 1;
    });

    // Complexity distribution
    const complexity = endpoint.complexity || 'medium';
    complexityDistribution[complexity] = (complexityDistribution[complexity] || 0) + 1;

    // Response code distribution
    Object.keys(endpoint.responses).forEach(code => {
      responseCodeDistribution[code] = (responseCodeDistribution[code] || 0) + 1;
    });

    // Security schemes
    if (endpoint.security) {
      endpoint.security.forEach(sec => {
        Object.keys(sec).forEach(scheme => {
          securitySchemes.add(scheme);
        });
      });
    }

    // Path patterns
    const pathSegments = endpoint.path.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      // Extract base path pattern
      const basePattern = `/${pathSegments[0]}`;
      pathPatterns.add(basePattern);
      
      // Extract common patterns
      const pattern = endpoint.path.replace(/\{[^}]+\}/g, '{id}');
      pathPatterns.add(pattern);
    }

    // Count deprecated
    if (endpoint.deprecated) {
      deprecatedCount++;
    }

    // Count parameters
    totalParameters += endpoint.parameters.length;
  });

  return {
    totalEndpoints: endpoints.length,
    methodDistribution,
    tagDistribution,
    complexityDistribution,
    deprecatedCount,
    securitySchemes: Array.from(securitySchemes),
    averageParametersPerEndpoint: endpoints.length > 0 ? totalParameters / endpoints.length : 0,
    pathPatterns: Array.from(pathPatterns).slice(0, 20), // Limit to top 20 patterns
    responseCodeDistribution
  };
}