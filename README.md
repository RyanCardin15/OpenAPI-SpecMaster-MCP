# OpenAPI Spec Master MCP Server

MCP server for OpenAPI-Spec-Master.

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Usage

Start the MCP server:

```bash
npm start
```

This will start the stdio transport by default.

To start with HTTP transport:
```bash
node dist/cli.js mcp --http
``` 