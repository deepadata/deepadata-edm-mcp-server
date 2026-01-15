# Deployment Guide

This guide covers deploying `deepadata-edm-mcp-server` in various environments, from personal use to enterprise deployments.

## Deployment Scenarios

| Scenario | Auth | Storage | Network | Complexity |
|----------|------|---------|---------|------------|
| Personal/Development | None or env token | Local filesystem | localhost | Low |
| Team/Small Org | Token map or JWT | Shared filesystem/NFS | Internal network | Medium |
| Enterprise | OAuth2/SAML | S3/Database | VPN/Private cloud | High |
| Multi-tenant | Per-tenant auth | Isolated storage | API Gateway | Very High |

## Personal Use

### Claude Desktop Setup

1. **Build or install the server:**

```bash
npm install -g deepadata-edm-mcp-server
# or
cd deepadata-edm-mcp-server && npm run build
```

2. **Configure Claude Desktop:**

**macOS/Linux:** `~/.claude/config.json`
**Windows:** `%APPDATA%\Claude\config.json`

```json
{
  "mcpServers": {
    "edm": {
      "command": "node",
      "args": ["/path/to/deepadata-edm-mcp-server/dist/server.js"],
      "env": {
        "EDM_STORAGE_PATH": "/Users/you/.edm-artifacts",
        "ANTHROPIC_API_KEY": "your-api-key"
      }
    }
  }
}
```

3. **Create storage directory:**

```bash
mkdir -p ~/.edm-artifacts
```

4. **Restart Claude Desktop**

### Using npx (No Install)

```json
{
  "mcpServers": {
    "edm": {
      "command": "npx",
      "args": ["deepadata-edm-mcp-server"],
      "env": {
        "EDM_STORAGE_PATH": "/Users/you/.edm-artifacts"
      }
    }
  }
}
```

## Team Deployment

### Shared Server

1. **Set up a dedicated server/VM**

2. **Install and configure:**

```bash
# Clone and build
git clone https://github.com/deepadata/deepadata-edm-mcp-server.git
cd deepadata-edm-mcp-server
npm install
npm run build

# Create data directory
sudo mkdir -p /var/lib/edm-server
sudo chown $USER:$USER /var/lib/edm-server

# Create config
cat > /etc/edm-server/config.json << 'EOF'
{
  "storagePath": "/var/lib/edm-server",
  "authTokens": {
    "team-token-1": { "userId": "alice", "roles": ["admin"] },
    "team-token-2": { "userId": "bob", "roles": ["user"] }
  }
}
EOF
```

3. **Create systemd service:**

```ini
# /etc/systemd/system/edm-server.service
[Unit]
Description=EDM MCP Server
After=network.target

[Service]
Type=simple
User=edm-server
Environment=EDM_STORAGE_PATH=/var/lib/edm-server
Environment=EDM_CONFIG=/etc/edm-server/config.json
ExecStart=/usr/bin/node /opt/edm-server/dist/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

4. **Configure team members' Claude Desktop** to connect via SSH tunnel or internal network.

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist/ ./dist/

ENV EDM_STORAGE_PATH=/data
VOLUME /data

USER node
CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  edm-server:
    build: .
    volumes:
      - edm-data:/data
    environment:
      - EDM_AUTH_TOKEN=${EDM_AUTH_TOKEN}
    restart: unless-stopped

volumes:
  edm-data:
```

## Enterprise Deployment

### With OAuth2 Authentication

```typescript
// enterprise-server.ts
import { createServer } from 'deepadata-edm-mcp-server';
import { createOAuth2Client } from './auth/oauth2.js';

const oauth2 = createOAuth2Client({
  issuer: process.env.OAUTH2_ISSUER!,
  clientId: process.env.OAUTH2_CLIENT_ID!,
  clientSecret: process.env.OAUTH2_CLIENT_SECRET!,
});

const { server } = createServer({
  auth: async (request) => {
    const token = extractBearerToken(request);
    if (!token) return null;

    const tokenInfo = await oauth2.introspect(token);
    if (!tokenInfo.active) return null;

    return {
      userId: tokenInfo.sub,
      roles: tokenInfo.roles || ['user'],
      organizationId: tokenInfo.organization,
    };
  },
  storage: {
    type: 'filesystem',
    path: process.env.EDM_STORAGE_PATH!,
  },
});
```

### With AWS S3 Storage

```typescript
// s3-storage.ts
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { ArtifactStorage, EdmArtifact } from 'deepadata-edm-mcp-server';

export class S3ArtifactStorage implements ArtifactStorage {
  private s3: S3Client;
  private bucket: string;

  constructor(bucket: string, region: string) {
    this.s3 = new S3Client({ region });
    this.bucket = bucket;
  }

  async load(id: string): Promise<EdmArtifact> {
    const response = await this.s3.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: `artifacts/${id}.json`,
    }));

    const body = await response.Body?.transformToString();
    return JSON.parse(body!);
  }

  async save(artifact: EdmArtifact): Promise<string> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `artifacts/${artifact.artifact_id}.json`,
      Body: JSON.stringify(artifact, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
    }));

    return artifact.artifact_id;
  }

  // Implement other methods...
}
```

### Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: edm-mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: edm-mcp-server
  template:
    metadata:
      labels:
        app: edm-mcp-server
    spec:
      containers:
      - name: server
        image: deepadata/edm-mcp-server:latest
        env:
        - name: EDM_STORAGE_PATH
          value: /data
        - name: OAUTH2_ISSUER
          valueFrom:
            secretKeyRef:
              name: edm-secrets
              key: oauth2-issuer
        volumeMounts:
        - name: data
          mountPath: /data
        resources:
          limits:
            memory: "256Mi"
            cpu: "500m"
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: edm-data-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: edm-mcp-server
spec:
  selector:
    app: edm-mcp-server
  ports:
  - port: 8080
    targetPort: 8080
```

## Security Configuration

### TLS/HTTPS

If exposing via HTTP instead of stdio:

```typescript
import https from 'https';
import fs from 'fs';

const httpsOptions = {
  key: fs.readFileSync('/etc/ssl/private/server.key'),
  cert: fs.readFileSync('/etc/ssl/certs/server.crt'),
};

// Use with HTTP transport
```

### Network Security

```yaml
# Network policy (Kubernetes)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: edm-server-policy
spec:
  podSelector:
    matchLabels:
      app: edm-mcp-server
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: ai-assistant
    ports:
    - protocol: TCP
      port: 8080
```

### Secrets Management

```bash
# Using AWS Secrets Manager
export EDM_AUTH_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id edm-server/auth-token \
  --query SecretString --output text)

# Using HashiCorp Vault
export EDM_AUTH_TOKEN=$(vault kv get -field=token secret/edm-server)
```

## Monitoring

### Health Checks

```typescript
// Add health endpoint
server.setRequestHandler('health', async () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    storage: await checkStorageHealth(),
  };
});
```

### Metrics

```typescript
import { Counter, Histogram } from 'prom-client';

const resourceReads = new Counter({
  name: 'edm_resource_reads_total',
  help: 'Total resource read operations',
  labelNames: ['uri_prefix', 'status'],
});

const toolCalls = new Histogram({
  name: 'edm_tool_call_duration_seconds',
  help: 'Tool call duration',
  labelNames: ['tool'],
});
```

### Logging

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

// Structured logging
logger.info({
  event: 'resource_read',
  uri: 'edm://artifact/123',
  userId: 'user-456',
  duration: 42,
});
```

## Troubleshooting

### Common Issues

**"Storage not found" errors:**
- Ensure `EDM_STORAGE_PATH` exists and is writable
- Check file permissions

**"Authentication failed" errors:**
- Verify token format and expiration
- Check auth middleware configuration
- Review auth provider logs

**"Governance violation" errors:**
- Check artifact `exportability` field
- Verify user has access based on `visibility`
- Review organization membership

### Debug Mode

```bash
# Enable debug logging
DEBUG=edm:* node dist/server.js

# Or with environment variable
NODE_DEBUG=edm node dist/server.js
```

### Connection Testing

```bash
# Test MCP connection
echo '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":1}' | \
  node dist/server.js

# Should return capabilities response
```

## Backup and Recovery

### Backup Script

```bash
#!/bin/bash
# backup-edm.sh

BACKUP_DIR=/var/backups/edm
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
tar -czf "$BACKUP_DIR/edm-data-$DATE.tar.gz" \
  -C /var/lib/edm-server .

# Retain last 7 days
find $BACKUP_DIR -name "edm-data-*.tar.gz" -mtime +7 -delete
```

### Restore

```bash
# Stop server
systemctl stop edm-server

# Restore from backup
tar -xzf /var/backups/edm/edm-data-20240115.tar.gz \
  -C /var/lib/edm-server

# Start server
systemctl start edm-server
```

## Migration

### Upgrading Versions

1. **Backup current data**
2. **Stop the server**
3. **Update the package:** `npm update deepadata-edm-mcp-server`
4. **Run migrations if needed**
5. **Start the server**
6. **Verify functionality**

### Schema Migrations

```typescript
// migrate.ts
import { createFileSystemStorage } from 'deepadata-edm-mcp-server';

async function migrate() {
  const storage = createFileSystemStorage('/var/lib/edm-server');
  const artifactStorage = storage.createArtifactStorage();

  const ids = await artifactStorage.list();

  for (const id of ids) {
    const artifact = await artifactStorage.load(id);

    // Apply migration
    if (artifact.schema_version === '0.3.0') {
      artifact.schema_version = '0.4.0';
      // ... other migrations
      await artifactStorage.save(artifact);
    }
  }
}
```
