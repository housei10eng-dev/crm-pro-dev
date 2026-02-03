# 🚀 SRE/PLATFORM ENGINEERING - Observability & Operations

**Version:** v1.0  
**Type:** SRE/Platform Engineering Standards  
**Scope:** Logs, Tracing, Metrics, Alerting, Incident Response  
**Status:** Production Ready  
**Last Updated:** 2026-02-03

---

## 📑 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Structured Logging](#structured-logging)
3. [Distributed Tracing](#distributed-tracing)
4. [Metrics & SLIs/SLOs](#metrics--slislos)
5. [Alerting Strategy](#alerting-strategy)
6. [Access Audit Trail](#access-audit-trail)
7. [Rate Limiting & WAF](#rate-limiting--waf)
8. [Secrets Management](#secrets-management)
9. [Deployment Strategy](#deployment-strategy)
10. [Incident Runbooks](#incident-runbooks)
11. [Production Checklist](#production-checklist)

---

## 🎯 OVERVIEW

### SRE Pillars

```
1. Reliability (Confiabilidade)
   ├─ 99.95% uptime (4.38 hours/month downtime allowed)
   ├─ Graceful degradation
   ├─ Redundancy at every level
   └─ Chaos engineering (monthly tests)

2. Performance (Performance)
   ├─ P99 latency < 500ms (API)
   ├─ P99 latency < 5s (batch jobs)
   ├─ Throughput: 10,000 RPS
   └─ Cache hit ratio > 95%

3. Observability (Observabilidade)
   ├─ Logs: 100% correlation
   ├─ Traces: 100% sampled (critical), 10% normal
   ├─ Metrics: all endpoints instrumented
   └─ Alerts: <1 min MTTR

4. Security (Segurança)
   ├─ All traffic TLS 1.3
   ├─ All secrets encrypted (KMS)
   ├─ All access logged (audit trail)
   ├─ WAF (OWASP top 10)
   └─ Rate limiting (per user/IP)

5. Compliance (Conformidade)
   ├─ LGPD: no PII in logs
   ├─ SOC2: audit trail
   ├─ PCI-DSS: card data never stored
   └─ GDPR: data retention enforced
```

### Tech Stack

```
Logging      → ELK (Elasticsearch, Logstash, Kibana)
Tracing      → Jaeger + OpenTelemetry
Metrics      → Prometheus + Grafana
Alerting     → AlertManager + PagerDuty
Access Audit → PostgreSQL (WORM table)
WAF          → ModSecurity + NGINX
Rate Limit   → Redis + Token Bucket
Secrets      → AWS KMS + Vault
Deployment   → K8s + Helm + ArgoCD
```

---

## 📝 STRUCTURED LOGGING

### Principle: All Logs Are JSON

```
Every log line must be:
1. Valid JSON (parseable)
2. Include correlation_id (trace across requests)
3. Structured fields (not free-form text)
4. No PII values (only field names)
5. Consistent schema (same fields everywhere)
```

### Log Schema

```json
{
  "timestamp": "2026-02-03T10:30:45.123Z",
  "level": "INFO",
  "correlation_id": "req-550e8400-e29b-41d4-a716-446655440000",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  
  "service": "payment-api",
  "version": "v2.3.1",
  "environment": "production",
  
  "message": "Payment processed successfully",
  "event": "payment.succeeded",
  
  "request": {
    "method": "POST",
    "path": "/v1/invoices/inv-123/pay",
    "query": {},
    "headers": {
      "user-agent": "Mozilla/5.0",
      "authorization": "[REDACTED]"
    }
  },
  
  "response": {
    "status_code": 200,
    "latency_ms": 234,
    "size_bytes": 1024
  },
  
  "context": {
    "tenant_id": "tenant-456",
    "user_id": "user-789",
    "user_role": "FINANCEIRO",
    "ip_address": "192.168.1.100",
    "session_id": "sess-abc123"
  },
  
  "business": {
    "entity_type": "payment",
    "entity_id": "pmt-xyz789",
    "action": "create",
    "status": "SUCCEEDED",
    "amount": 5000.00,
    "currency": "BRL",
    "gateway": "stripe"
  },
  
  "performance": {
    "database_queries": 3,
    "database_latency_ms": 45,
    "cache_hits": 2,
    "cache_misses": 1
  },
  
  "errors": null,
  "custom_fields": {
    "deployment_region": "us-east-1",
    "pod_name": "payment-api-1a2b3c4d",
    "node": "worker-01"
  }
}
```

### Log Levels & Usage

```python
# DEBUG: Detailed debugging information
logger.debug(
    "Database query executed",
    extra={
        "query": "SELECT * FROM users WHERE id = ?",
        "params_count": 1,
        "duration_ms": 2
    }
)

# INFO: Normal operational events (happy path)
logger.info(
    "Payment processed",
    extra={
        "entity_id": "pmt-123",
        "amount": 5000,
        "status": "SUCCEEDED"
    }
)

# WARNING: Unexpected but recoverable situation
logger.warning(
    "Cache miss",
    extra={
        "cache_key": "user:789",
        "retry_count": 2
    }
)

# ERROR: Error occurred but system continues
logger.error(
    "Payment processing failed",
    extra={
        "error_code": "STRIPE_API_ERROR",
        "retry": True,
        "retry_in_seconds": 30
    },
    exc_info=True  # Include traceback
)

# CRITICAL: System must be stopped/escalated
logger.critical(
    "Database connection lost",
    extra={
        "database": "primary",
        "failover_initiated": True
    }
)
```

### Logger Implementation (Python/FastAPI)

```python
import logging
import json
from datetime import datetime
from uuid import uuid4
import contextvars

# Context variables (stored per request/thread)
correlation_id = contextvars.ContextVar('correlation_id', default=None)
trace_id = contextvars.ContextVar('trace_id', default=None)
current_user_id = contextvars.ContextVar('user_id', default=None)
current_tenant_id = contextvars.ContextVar('tenant_id', default=None)

class JSONFormatter(logging.Formatter):
    """
    Format logs as JSON
    """
    
    def format(self, record: logging.LogRecord) -> str:
        """
        Convert log record to JSON
        """
        
        # Get context values
        corr_id = correlation_id.get() or str(uuid4())
        trace = trace_id.get() or str(uuid4())
        
        # Build JSON
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "correlation_id": corr_id,
            "trace_id": trace,
            "span_id": record.name.split('.')[-1][:8],
            
            "service": "payment-api",
            "version": "v2.3.1",
            "environment": "production",
            
            "message": record.getMessage(),
            "event": getattr(record, 'event', None),
            
            "logger": record.name,
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            
            "context": {
                "user_id": current_user_id.get(),
                "tenant_id": current_tenant_id.get(),
                "ip_address": getattr(record, 'ip_address', None),
                "session_id": getattr(record, 'session_id', None)
            },
            
            "business": getattr(record, 'business', {}),
            "performance": getattr(record, 'performance', {}),
            
            "custom_fields": {
                "pod_name": os.getenv('POD_NAME'),
                "deployment_region": os.getenv('REGION')
            }
        }
        
        # Add extra fields from log call
        if hasattr(record, 'extra'):
            log_entry.update(record.extra)
        
        # Add error info if exception
        if record.exc_info:
            log_entry["error"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
                "traceback": self.formatException(record.exc_info)
            }
        
        return json.dumps(log_entry, default=str)

# Setup logger
logger = logging.getLogger(__name__)
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger.addHandler(handler)

# Usage in FastAPI
@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    """
    Add correlation_id to every request
    """
    
    corr_id = request.headers.get("X-Correlation-ID") or str(uuid4())
    correlation_id.set(corr_id)
    
    # Add to response header
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = corr_id
    return response

@app.post("/v1/invoices/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, request: Request):
    """
    Example endpoint with structured logging
    """
    
    user = get_current_user()
    current_user_id.set(user.id)
    current_tenant_id.set(user.tenant_id)
    
    logger.info(
        "Payment initiated",
        extra={
            "event": "payment.initiated",
            "business": {
                "entity_type": "payment",
                "entity_id": invoice_id,
                "action": "create"
            },
            "ip_address": request.client.host
        }
    )
    
    try:
        # Process payment
        result = process_payment(invoice_id, user.id)
        
        logger.info(
            "Payment processed",
            extra={
                "event": "payment.succeeded",
                "business": {
                    "entity_id": result['payment_id'],
                    "amount": result['amount'],
                    "status": "SUCCEEDED",
                    "gateway": "stripe"
                },
                "performance": {
                    "latency_ms": result['duration']
                }
            }
        )
        
        return {"success": True, "payment_id": result['payment_id']}
        
    except PaymentError as e:
        logger.error(
            "Payment failed",
            extra={
                "event": "payment.failed",
                "error_code": e.code,
                "business": {
                    "entity_id": invoice_id,
                    "status": "FAILED"
                }
            }
        )
        raise
```

### Log Examples

```json
// Example 1: Successful API call
{
  "timestamp": "2026-02-03T10:30:45.123Z",
  "level": "INFO",
  "correlation_id": "req-550e8400-e29b-41d4-a716-446655440000",
  "service": "payment-api",
  "message": "Payment processed",
  "event": "payment.succeeded",
  "response": {"status_code": 200, "latency_ms": 234},
  "context": {
    "tenant_id": "tenant-456",
    "user_id": "user-789",
    "user_role": "FINANCEIRO"
  },
  "business": {
    "entity_id": "pmt-xyz789",
    "amount": 5000.00,
    "gateway": "stripe"
  }
}

// Example 2: Failed payment (error)
{
  "timestamp": "2026-02-03T10:31:10.456Z",
  "level": "ERROR",
  "correlation_id": "req-550e8400-e29b-41d4-a716-446655440000",
  "service": "payment-api",
  "message": "Payment failed - Stripe API error",
  "event": "payment.failed",
  "error": {
    "type": "StripeAPIError",
    "message": "card_declined",
    "traceback": "..."
  },
  "business": {
    "entity_id": "pmt-abc123",
    "status": "FAILED",
    "retry": true,
    "retry_in_seconds": 30
  }
}

// Example 3: Database query
{
  "timestamp": "2026-02-03T10:32:20.789Z",
  "level": "DEBUG",
  "correlation_id": "req-550e8400-e29b-41d4-a716-446655440000",
  "service": "payment-api",
  "message": "Database query executed",
  "performance": {
    "database_queries": 1,
    "database_latency_ms": 45,
    "query_type": "SELECT"
  }
}

// Example 4: Cache miss (warning)
{
  "timestamp": "2026-02-03T10:33:00.111Z",
  "level": "WARNING",
  "correlation_id": "req-550e8400-e29b-41d4-a716-446655440000",
  "service": "payment-api",
  "message": "Cache miss for user profile",
  "performance": {
    "cache_misses": 1,
    "fallback": "database_query",
    "latency_ms": 125
  }
}
```

---

## 🔗 DISTRIBUTED TRACING

### OpenTelemetry Setup

```python
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

# Initialize Jaeger exporter
jaeger_exporter = JaegerExporter(
    agent_host_name=os.getenv("JAEGER_HOST", "localhost"),
    agent_port=int(os.getenv("JAEGER_PORT", 6831)),
)

# Setup tracer
trace.set_tracer_provider(TracerProvider())
trace.get_tracer_provider().add_span_processor(
    BatchSpanProcessor(jaeger_exporter)
)

# Auto-instrument FastAPI
FastAPIInstrumentor.instrument_app(app)

# Auto-instrument database
SQLAlchemyInstrumentor().instrument(engine=db_engine)

# Auto-instrument Redis
RedisInstrumentor().instrument()

# Auto-instrument HTTP requests
RequestsInstrumentor().instrument()

tracer = trace.get_tracer(__name__)
```

### Manual Span Creation

```python
@app.post("/v1/invoices/{invoice_id}/pay")
async def pay_invoice(invoice_id: str):
    """
    Trace payment processing flow
    """
    
    # Create top-level span
    with tracer.start_as_current_span("pay_invoice") as span:
        span.set_attribute("invoice_id", invoice_id)
        span.set_attribute("span.kind", "SERVER")
        
        # Span 1: Fetch invoice
        with tracer.start_as_current_span("fetch_invoice") as fetch_span:
            fetch_span.set_attribute("db.system", "postgresql")
            invoice = db.query(Invoice).filter_by(id=invoice_id).first()
            fetch_span.set_attribute("db.rows_returned", 1)
        
        # Span 2: Process payment gateway
        with tracer.start_as_current_span("call_stripe_api") as stripe_span:
            stripe_span.set_attribute("http.method", "POST")
            stripe_span.set_attribute("http.url", "https://api.stripe.com/v1/charges")
            result = stripe_client.charge(invoice.amount)
            stripe_span.set_attribute("http.status_code", 200)
        
        # Span 3: Update database
        with tracer.start_as_current_span("update_payment_status") as update_span:
            update_span.set_attribute("db.operation", "UPDATE")
            db.update_payment_status(invoice_id, "SUCCEEDED")
        
        # Span 4: Publish event
        with tracer.start_as_current_span("publish_payment_event") as event_span:
            event_span.set_attribute("messaging.system", "kafka")
            event_span.set_attribute("messaging.destination", "payment.events")
            kafka_producer.send("payment.events", {"payment_id": result['id']})
        
        return result
```

### Trace Visualization

```
Trace ID: 4bf92f3577b34da6a3ce929d0e0e4736

Timeline:
├─ pay_invoice [0ms - 250ms]
│  ├─ fetch_invoice [0ms - 45ms]
│  │  └─ SELECT FROM invoices WHERE id=?
│  ├─ call_stripe_api [50ms - 180ms]
│  │  └─ POST https://api.stripe.com/v1/charges
│  ├─ update_payment_status [185ms - 200ms]
│  │  └─ UPDATE payments SET status=SUCCEEDED
│  └─ publish_payment_event [210ms - 240ms]
│     └─ Kafka: payment.events

Total: 250ms
Critical path: call_stripe_api (130ms)
```

---

## 📊 METRICS & SLIs/SLOs

### Prometheus Metrics

```python
from prometheus_client import Counter, Histogram, Gauge

# Counters (increment only)
request_count = Counter(
    'api_requests_total',
    'Total API requests',
    ['method', 'endpoint', 'status']
)

payment_counter = Counter(
    'payments_total',
    'Total payments processed',
    ['status', 'gateway']
)

error_counter = Counter(
    'errors_total',
    'Total errors',
    ['error_type', 'severity']
)

# Histograms (latency distribution)
request_duration = Histogram(
    'api_request_duration_seconds',
    'API request duration',
    ['method', 'endpoint'],
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 5.0)
)

database_query_duration = Histogram(
    'db_query_duration_seconds',
    'Database query duration',
    ['query_type'],
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1)
)

# Gauges (current value)
active_connections = Gauge(
    'active_db_connections',
    'Number of active database connections'
)

cache_size = Gauge(
    'cache_size_bytes',
    'Current cache size in bytes'
)

queue_depth = Gauge(
    'job_queue_depth',
    'Number of jobs waiting in queue',
    ['queue_name']
)
```

### Middleware to Record Metrics

```python
@app.middleware("http")
async def record_metrics(request: Request, call_next):
    """
    Record metrics for every request
    """
    
    method = request.method
    path = request.url.path
    
    start_time = time.time()
    
    try:
        response = await call_next(request)
        status = response.status_code
    except Exception as e:
        status = 500
        raise
    finally:
        duration = time.time() - start_time
        
        # Record request metrics
        request_count.labels(
            method=method,
            endpoint=path,
            status=status
        ).inc()
        
        request_duration.labels(
            method=method,
            endpoint=path
        ).observe(duration)
        
        # Record errors
        if status >= 500:
            error_counter.labels(
                error_type='server_error',
                severity='critical'
            ).inc()
        elif status >= 400:
            error_counter.labels(
                error_type='client_error',
                severity='warning'
            ).inc()
    
    return response
```

### Key Metrics by Service

```
Payment API:
├─ api_requests_total (by endpoint, status)
├─ api_request_duration_seconds (P50, P95, P99)
├─ payments_total (by status: succeeded, failed, refunded)
├─ payment_processing_latency_seconds (P99)
├─ stripe_api_errors_total
├─ webhook_processing_latency_seconds
└─ cache_hit_ratio

Database:
├─ db_query_duration_seconds (by query type)
├─ db_pool_connections (active/total)
├─ db_transactions_total
├─ db_deadlocks_total
├─ replication_lag_seconds
└─ slow_queries_total

Cache (Redis):
├─ cache_hits_total
├─ cache_misses_total
├─ cache_hit_ratio
├─ cache_memory_bytes
├─ cache_evictions_total
└─ cache_ttl_distribution

Jobs:
├─ job_queue_depth (by queue)
├─ job_processing_duration_seconds
├─ job_failures_total
├─ job_retries_total
├─ dead_letter_queue_size
└─ job_lag_seconds
```

### SLIs/SLOs Definition

```
Service Level Objective (SLO): Target reliability goal
Service Level Indicator (SLI): Measured metric

Payment API SLO:
├─ Availability: 99.95%
│  └─ SLI: (total_requests - errors_5xx) / total_requests
│
├─ Latency P99: 500ms
│  └─ SLI: P99(api_request_duration_seconds)
│
├─ Error Rate: < 0.1%
│  └─ SLI: errors_total / total_requests
│
└─ Throughput: 10,000 RPS sustained
   └─ SLI: requests_per_second (5-minute average)

Database SLO:
├─ Query latency P99: 100ms
│  └─ SLI: P99(db_query_duration_seconds)
│
└─ Connection pool available: 90%
   └─ SLI: available_connections / total_connections

Error Budget:
├─ Monthly: 100% - 99.95% = 0.05% = 21.6 minutes
├─ Can use for: deployments, experiments, maintenance
└─ Once spent: no deployments allowed (stability first)
```

### SLO Dashboard Query (Prometheus)

```
# 99.95% uptime SLO
1 - (
  rate(api_requests_total{status=~"5.."}[5m]) /
  rate(api_requests_total[5m])
) > 0.9995

# P99 latency < 500ms
histogram_quantile(0.99, api_request_duration_seconds) < 0.5

# Error rate < 0.1%
rate(api_requests_total{status=~"[45].."}[5m]) /
rate(api_requests_total[5m]) < 0.001

# Cache hit ratio > 95%
rate(cache_hits_total[5m]) /
(rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) > 0.95
```

---

## 🚨 ALERTING STRATEGY

### Alert Channels

```
Severity 1 (CRITICAL)      → PagerDuty (page on-call)
Severity 2 (WARNING)       → Slack + Email
Severity 3 (INFO)          → Email only
Severity 4 (DEBUG)         → Logs only

Escalation:
├─ P1: 5min no acknowledge → page backup
├─ P2: 30min no acknowledge → escalate to manager
└─ Auto-resolve: when condition clears
```

### Critical Alerts

```yaml
# Alert 1: High Error Rate
alert: HighErrorRate
expr: |
  rate(api_requests_total{status=~"5.."}[5m]) /
  rate(api_requests_total[5m]) > 0.05
for: 2m
severity: critical
annotations:
  summary: "High error rate detected"
  description: "Error rate is {{ $value | humanizePercentage }}"
  runbook: "https://wiki/runbooks/high-error-rate"

# Alert 2: Payment Processing Failure
alert: PaymentProcessingFailure
expr: |
  rate(payments_total{status="FAILED"}[5m]) /
  rate(payments_total[5m]) > 0.1
for: 1m
severity: critical
annotations:
  summary: "Payment processing failing"
  description: "{{ $value | humanizePercentage }} of payments failing"
  runbook: "https://wiki/runbooks/payment-failure"

# Alert 3: Database Connection Pool Exhausted
alert: DBConnectionPoolExhausted
expr: |
  active_db_connections / max_db_connections > 0.9
for: 5m
severity: critical
annotations:
  summary: "Database connection pool near exhaustion"
  description: "{{ $value | humanizePercentage }} of connections in use"

# Alert 4: High Latency
alert: HighLatencyP99
expr: |
  histogram_quantile(0.99, api_request_duration_seconds) > 1.0
for: 5m
severity: warning
annotations:
  summary: "High P99 latency detected"
  description: "P99 latency is {{ $value }}s (threshold: 0.5s)"

# Alert 5: Cache Hit Ratio Low
alert: LowCacheHitRatio
expr: |
  rate(cache_hits_total[5m]) /
  (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) < 0.8
for: 10m
severity: warning
annotations:
  summary: "Cache hit ratio below threshold"
  description: "Cache hit ratio is {{ $value | humanizePercentage }}"

# Alert 6: Job Queue Backlog
alert: JobQueueBacklog
expr: |
  job_queue_depth > 10000
for: 10m
severity: warning
annotations:
  summary: "Job queue has significant backlog"
  description: "Queue depth: {{ $value }} jobs"

# Alert 7: Dead Letter Queue Growing
alert: DLQGrowing
expr: |
  rate(dead_letter_queue_size[5m]) > 0
for: 5m
severity: critical
annotations:
  summary: "Dead Letter Queue growing"
  description: "DLQ rate: {{ $value }} messages/sec"

# Alert 8: Deployment Failure
alert: DeploymentFailure
expr: |
  deployment_failed_total > deployment_failed_total offset 5m
for: 1m
severity: critical
annotations:
  summary: "Deployment failed"
  description: "Deployment status: FAILED"

# Alert 9: Pod Restart Rate High
alert: HighPodRestarts
expr: |
  rate(kube_pod_container_status_restarts_total[15m]) > 0.1
for: 5m
severity: warning
annotations:
  summary: "High pod restart rate"
  description: "Pod {{ $labels.pod }} restarting frequently"

# Alert 10: Audit Log Lag
alert: AuditLogLag
expr: |
  audit_log_processing_lag_seconds > 60
for: 5m
severity: warning
annotations:
  summary: "Audit log processing lagging"
  description: "Lag: {{ $value }}s"
```

---

## 📋 ACCESS AUDIT TRAIL

### Who Accessed What (Table)

```sql
CREATE TABLE access_audit (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Who accessed
  accessed_by_user_id UUID,
  accessed_by_role VARCHAR(100),
  accessed_by_ip INET,
  
  -- What was accessed
  entity_type VARCHAR(100),           -- 'invoice', 'payment', 'user'
  entity_id UUID,
  resource_path VARCHAR(500),         -- e.g., /v1/invoices/inv-123
  
  -- How it was accessed
  access_method VARCHAR(50),          -- 'api', 'batch_job', 'admin_ui'
  action VARCHAR(50),                 -- 'read', 'write', 'delete', 'export'
  
  -- Result
  access_granted BOOLEAN,
  denial_reason VARCHAR(255),
  
  -- Metadata
  query_filters JSONB,                -- What data was actually queried
  rows_affected INT,
  
  -- Timing
  accessed_at TIMESTAMP DEFAULT NOW(),
  duration_ms INT,
  
  -- Immutable (WORM)
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_access_audit_entity 
ON access_audit(entity_type, entity_id, accessed_at DESC);

CREATE INDEX idx_access_audit_user 
ON access_audit(accessed_by_user_id, accessed_at DESC);

-- Enforce immutability (no updates/deletes)
CREATE POLICY access_audit_no_update ON access_audit
  FOR UPDATE USING (false);

CREATE POLICY access_audit_no_delete ON access_audit
  FOR DELETE USING (false);
```

### Audit Query Examples

```sql
-- Who accessed a specific invoice?
SELECT
  accessed_by_user_id,
  accessed_by_role,
  action,
  accessed_at
FROM access_audit
WHERE entity_type = 'invoice'
  AND entity_id = 'inv-123'
ORDER BY accessed_at DESC;

-- What did user-456 access today?
SELECT
  entity_type,
  entity_id,
  action,
  accessed_at
FROM access_audit
WHERE accessed_by_user_id = 'user-456'
  AND accessed_at::date = CURRENT_DATE
ORDER BY accessed_at DESC;

-- Failed access attempts (security breach?)
SELECT
  accessed_by_user_id,
  resource_path,
  denial_reason,
  COUNT(*) as attempts
FROM access_audit
WHERE NOT access_granted
  AND accessed_at > NOW() - INTERVAL '1 hour'
GROUP BY accessed_by_user_id, resource_path, denial_reason
HAVING COUNT(*) > 5;
```

### Audit Logging in API

```python
async def log_access(
    user_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    access_granted: bool,
    rows_affected: int = None
):
    """
    Log data access
    """
    
    request = get_request_context()
    user = get_current_user()
    
    db.insert('access_audit', {
        'tenant_id': user.tenant_id,
        'accessed_by_user_id': user_id,
        'accessed_by_role': user.role,
        'accessed_by_ip': request.client.host,
        'entity_type': entity_type,
        'entity_id': entity_id,
        'resource_path': request.url.path,
        'access_method': 'api',
        'action': action,
        'access_granted': access_granted,
        'rows_affected': rows_affected,
        'accessed_at': datetime.utcnow()
    })

# Usage
@app.get("/v1/invoices/{invoice_id}")
async def get_invoice(invoice_id: str):
    user = get_current_user()
    
    invoice = db.query(Invoice).filter_by(id=invoice_id).first()
    
    await log_access(
        user_id=user.id,
        entity_type='invoice',
        entity_id=invoice_id,
        action='read',
        access_granted=True,
        rows_affected=1
    )
    
    return invoice
```

---

## 🔐 RATE LIMITING & WAF

### Rate Limiting (Token Bucket)

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from redis import Redis

redis_client = Redis(host='localhost', port=6379)
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="redis://localhost:6379"
)

# Global rate limits
@app.get("/v1/invoices")
@limiter.limit("100/minute")  # 100 requests per minute
async def list_invoices():
    return {"invoices": []}

# Per-user rate limits
@app.post("/v1/invoices/{invoice_id}/pay")
@limiter.limit("10/minute")  # 10 payments per minute per user
async def pay_invoice(invoice_id: str):
    user = get_current_user()
    
    # Check per-user limit
    rate_key = f"rate:{user.id}:payments"
    current = redis_client.incr(rate_key)
    
    if current == 1:
        redis_client.expire(rate_key, 60)  # 60 second window
    
    if current > 10:
        raise RateLimitExceeded(f"Max 10 payments per minute")
    
    return {"payment_id": "pmt-123"}

# Error handling
@app.errorhandler(RateLimitExceeded)
def ratelimit_handler(e):
    logger.warning(
        "Rate limit exceeded",
        extra={
            "event": "rate_limit_exceeded",
            "endpoint": e.description,
            "user_id": get_current_user().id
        }
    )
    return {
        "error": "Rate limit exceeded",
        "retry_after_seconds": 60
    }, 429
```

### WAF Rules (ModSecurity/NGINX)

```yaml
# ModSecurity rules

# Rule 1: Block SQL Injection
SecRule ARGS|HEADERS "@rx (?:union|select|insert|delete|drop|create|alter)" \
  "id:1001,phase:2,block,msg:'SQL Injection Attempt'"

# Rule 2: Block XSS
SecRule ARGS|HEADERS "@rx (?:<script|javascript:|onerror|onload)" \
  "id:1002,phase:2,block,msg:'XSS Attempt'"

# Rule 3: Block path traversal
SecRule ARGS|HEADERS "@rx \.\./|\.\\\\" \
  "id:1003,phase:2,block,msg:'Path Traversal Attempt'"

# Rule 4: Require valid JSON
SecRule REQUEST_METHOD "@eq POST|PUT" \
  "chain,id:1004,phase:2"
SecRule REQUEST_HEADERS:Content-Type "!@contains application/json" \
  "block,msg:'Invalid Content-Type'"

# Rule 5: Block large payloads
SecRule REQUEST_BODY_LENGTH "@gt 10485760" \
  "id:1005,phase:2,block,msg:'Payload too large (max 10MB)'"
```

### DDoS Protection

```nginx
# NGINX configuration

# Rate limit by IP
limit_req_zone $binary_remote_addr zone=ip_limit:10m rate=100r/s;

# Rate limit by User-Agent (detect bots)
limit_req_zone $http_user_agent zone=ua_limit:10m rate=1000r/s;

# Apply rate limiting
server {
  listen 443 ssl http2;
  
  # Per-IP: 100 req/sec
  limit_req zone=ip_limit burst=50 nodelay;
  
  # Per-UA: 1000 req/sec
  limit_req zone=ua_limit burst=500 nodelay;
  
  # Return 429 when exceeded
  limit_req_status 429;
  
  location / {
    proxy_pass http://backend;
  }
}
```

---

## 🔑 SECRETS MANAGEMENT

### AWS KMS + Vault

```python
import boto3
import hvac

# AWS KMS
kms_client = boto3.client('kms')

def encrypt_secret(plaintext: str, key_id: str) -> str:
    """
    Encrypt secret using KMS
    """
    response = kms_client.encrypt(
        KeyId=key_id,
        Plaintext=plaintext
    )
    return base64.b64encode(response['CiphertextBlob']).decode()

def decrypt_secret(ciphertext: str) -> str:
    """
    Decrypt secret from KMS
    """
    response = kms_client.decrypt(
        CiphertextBlob=base64.b64decode(ciphertext)
    )
    return response['Plaintext'].decode()

# HashiCorp Vault
vault_client = hvac.Client(
    url='https://vault.company.com',
    token=os.getenv('VAULT_TOKEN')
)

def get_secret(path: str, key: str) -> str:
    """
    Get secret from Vault
    """
    secret = vault_client.secrets.kv.read_secret_version(path)
    return secret['data']['data'][key]

# Usage
stripe_key = get_secret('secret/production/stripe', 'api_key')
db_password = get_secret('secret/production/database', 'password')

# Secrets rotation
def rotate_secrets():
    """
    Rotate all secrets (quarterly)
    """
    
    # Generate new keys
    new_stripe_key = generate_stripe_key()
    new_db_password = generate_db_password()
    
    # Store in Vault
    vault_client.secrets.kv.create_or_update_secret(
        path='secret/production/stripe',
        secret_data={'api_key': new_stripe_key}
    )
    
    # Rotate in systems
    update_stripe_config(new_stripe_key)
    update_db_password(new_db_password)
    
    # Log rotation
    logger.info("Secrets rotated successfully")
```

### Never Commit Secrets

```bash
# .gitignore
*.env
*.env.local
*.key
*.pem
*.p12
secrets.json
.vault-token

# .pre-commit-hook
# Scan for secrets before commit
git diff --cached | grep -E "(password|secret|key|token)" && exit 1
```

---

## 🚀 DEPLOYMENT STRATEGY

### Blue-Green Deployment (Zero Downtime)

```yaml
# Kubernetes deployment

apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-api-blue
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-api
      version: blue
  template:
    metadata:
      labels:
        app: payment-api
        version: blue
    spec:
      containers:
      - name: payment-api
        image: payment-api:v2.3.1
        ports:
        - containerPort: 8000
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5

---

apiVersion: v1
kind: Service
metadata:
  name: payment-api
spec:
  selector:
    app: payment-api
    version: blue  # Currently routes to blue
  ports:
  - port: 80
    targetPort: 8000
  type: LoadBalancer
```

### Blue-Green Switching Script

```bash
#!/bin/bash

# 1. Deploy new version to GREEN
kubectl set image deployment/payment-api-green \
  payment-api=payment-api:v2.4.0 \
  --record

# 2. Wait for Green to be ready
kubectl rollout status deployment/payment-api-green
GREEN_READY=$?

if [ $GREEN_READY -ne 0 ]; then
  echo "Green deployment failed, aborting switch"
  exit 1
fi

# 3. Run smoke tests against Green
curl -s http://payment-api-green:8000/health | grep -q "OK"
SMOKE_TEST=$?

if [ $SMOKE_TEST -ne 0 ]; then
  echo "Smoke tests failed, aborting switch"
  exit 1
fi

# 4. Switch traffic to Green (atomic)
kubectl patch service payment-api -p '{"spec":{"selector":{"version":"green"}}}'

# 5. Monitor for 5 minutes
echo "Monitoring Green for 5 minutes..."
sleep 300

# 6. Check metrics (error rate, latency)
ERROR_RATE=$(curl -s prometheus:9090/query?query=rate(errors_total[5m]) | jq '.data.result[0].value[1]')

if [ $(echo "$ERROR_RATE > 0.05" | bc) -eq 1 ]; then
  echo "Error rate too high, rolling back to Blue"
  kubectl patch service payment-api -p '{"spec":{"selector":{"version":"blue"}}}'
  exit 1
fi

# 7. Success - keep Green, decommission Blue
kubectl delete deployment payment-api-blue
echo "✓ Deployment successful"
```

### Database Migration (No Downtime)

```sql
-- Step 1: Add new column (backward compatible)
ALTER TABLE payments
ADD COLUMN payment_method_v2 VARCHAR(50);

-- Step 2: Backfill data
UPDATE payments
SET payment_method_v2 = payment_method
WHERE payment_method_v2 IS NULL;

-- Step 3: Deploy code (reads from NEW column)
-- Old instances: read from old column
-- New instances: read from new column
-- Both exist, so no downtime

-- Step 4: Cleanup old column (after 48 hours)
ALTER TABLE payments
DROP COLUMN payment_method;
```

### Zero-Downtime Schema Changes

```python
class MigrationStrategy:
    """
    Multi-step migrations for zero-downtime
    """
    
    def add_column_safe(self, table: str, column: str, type: str):
        """
        1. Add column with default
        2. Backfill
        3. Remove default (make required in code, not DB)
        """
        
        # Step 1: Add nullable column
        db.execute(f"""
            ALTER TABLE {table}
            ADD COLUMN {column} {type} DEFAULT NULL
        """)
        
        # Step 2: Backfill with safe default
        db.execute(f"""
            UPDATE {table}
            SET {column} = (SELECT default_value)
            WHERE {column} IS NULL
        """)
        
        # Step 3: Optional - make NOT NULL later
        # ALTER TABLE {table}
        # ALTER COLUMN {column} SET NOT NULL
    
    def rename_column_safe(self, table: str, old_name: str, new_name: str):
        """
        1. Create new column
        2. Copy data
        3. Trigger to keep in sync
        4. Deploy code (read new, write both)
        5. Later: drop old
        """
        
        # Step 1: Create new column
        db.execute(f"""
            ALTER TABLE {table}
            ADD COLUMN {new_name} VARCHAR(255)
        """)
        
        # Step 2: Copy existing data
        db.execute(f"""
            UPDATE {table}
            SET {new_name} = {old_name}
        """)
        
        # Step 3: Create trigger for sync
        db.execute(f"""
            CREATE TRIGGER {table}_sync_columns
            AFTER UPDATE ON {table}
            FOR EACH ROW
            BEGIN
              SET NEW.{new_name} = NEW.{old_name};
            END
        """)
```

---

## 🆘 INCIDENT RUNBOOKS

### Runbook 1: High Error Rate

```markdown
## Incident: High Error Rate (>5% errors for 2 minutes)

### Severity: CRITICAL

### Alert Triggered
- `rate(api_requests_total{status=~"5.."}[5m]) > 0.05`
- Error rate: 12%
- Affected endpoints: /v1/invoices/*/pay

### Initial Triage (0-5 minutes)

1. **Check service status**
   ```
   kubectl get pods -l app=payment-api
   kubectl logs -f deployment/payment-api
   ```
   - Check: Are pods crashing?
   - Check: Are there restart loops?

2. **Check logs for patterns**
   ```
   curl 'http://elasticsearch:9200/logs-*/_search' -d '{
     "query": {
       "range": {
         "timestamp": {"gte": "now-10m"}
       }
     }
   }' | jq '.hits.hits[] | .._source | select(.level=="ERROR")'
   ```
   - Look for: Same error repeated
   - Common causes: Database down, external API failure, memory leak

3. **Check metrics**
   ```
   # Database latency spiking?
   histogram_quantile(0.99, db_query_duration_seconds)
   
   # Cache hit ratio down?
   rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))
   
   # Payment gateway failing?
   rate(payments_total{status="FAILED"}[5m])
   ```

### Diagnosis Scenarios

#### Scenario A: Database Connection Pool Exhausted
```
Symptoms:
- All requests timeout
- Log error: "FATAL: remaining connection slots reserved"

Fix (5 minutes):
1. Scale up database connections
   ```
   UPDATE db_config SET max_connections = 200
   SELECT pg_reload_conf()
   ```

2. Restart connection pool
   ```
   kubectl set env deployment/payment-api RESTART=$(date +%s)
   ```

3. Monitor recovery
   ```
   watch 'curl metrics:9090/query?query=active_db_connections'
   ```
```

#### Scenario B: External API (Stripe) Failing
```
Symptoms:
- Logs: "Stripe API timeout"
- Only payment endpoint affected
- Stripe status page shows incident

Fix (5 minutes):
1. Enable fallback gateway (MercadoPago)
   ```
   kubectl patch deployment payment-api \
     -p '{"spec":{"template":{"spec":{"containers":[{
       "name":"payment-api",
       "env":[{
         "name":"FALLBACK_GATEWAY",
         "value":"mercadopago"
       }]
     }]}}}}'
   ```

2. Enable queue for retry
   ```
   UPDATE payments SET status='RETRY_PENDING'
   WHERE status='FAILED' AND created_at > NOW() - INTERVAL '2 minutes'
   ```

3. Monitor Stripe status
   ```
   curl -s https://status.stripe.com/api/v2/status.json | jq .
   ```
```

#### Scenario C: Memory Leak in Service
```
Symptoms:
- Pod memory usage growing
- Pods being OOMKilled
- Log: "java.lang.OutOfMemoryError"

Fix (10 minutes):
1. Restart pods (clear memory)
   ```
   kubectl rollout restart deployment/payment-api
   ```

2. Increase memory limit (temporary)
   ```
   kubectl set resources deployment/payment-api \
     --limits=memory=2Gi
   ```

3. Schedule code review (find leak)
   ```
   jmap -histo:live <pid> | head -20
   # Look for classes with large memory allocation
   ```

4. Deploy fix
   ```
   git checkout memory-leak-fix
   docker build -t payment-api:v2.3.2 .
   kubectl set image deployment/payment-api payment-api=payment-api:v2.3.2
   ```
```

### Recovery & Follow-up

1. **Restore full service**
   - All pods healthy
   - Error rate < 0.1%
   - P99 latency normal

2. **Communicate status**
   - Update incident in PagerDuty
   - Slack notification: `🟢 incident-123: RESOLVED`

3. **Post-mortem (within 24 hours)**
   - What happened?
   - Why did it happen?
   - How to prevent?
   - Action items with owners

### Escalation Path
- 5 min: No improvement → Page backup engineer
- 15 min: Still down → Page team lead
- 30 min: Still down → Emergency war room
```

### Runbook 2: Payment Processing Failure

```markdown
## Incident: Payment Processing Failure

### Symptoms
- Rate of failed payments > 10%
- Users reporting "payment declined" errors
- Webhook processing lag growing

### Step 1: Verify Scope (2 min)
```
SELECT
  status,
  COUNT(*) as count,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as minute
FROM payments
WHERE created_at > NOW() - INTERVAL '30 minutes'
GROUP BY status, minute
ORDER BY minute DESC;

-- Check: How many failed? Started when?
```

### Step 2: Check Gateways (3 min)
```
-- Stripe status
curl -s https://status.stripe.com/api/v2/status.json | jq '.status'

-- MercadoPago status
curl -s https://status.mercadopago.com/ | jq '.incidents'

-- Our logs
curl 'http://elasticsearch:9200/logs-*/_search' -d '{
  "query": {
    "bool": {
      "must": [
        {"term": {"event": "stripe.api_error"}},
        {"range": {"timestamp": {"gte": "now-30m"}}}
      ]
    }
  }
}' | jq -r '.hits.hits[]._source | "\(.timestamp): \(.error_message)"'
```

### Step 3: Database Check (2 min)
```
-- Connection pool status
SELECT count(*) FROM pg_stat_activity;

-- Slow queries
SELECT query, mean_exec_time FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 5;

-- Replication lag
SELECT pg_last_wal_receive_lsn() - pg_last_wal_replay_lsn();
```

### Step 4: Cache Status (1 min)
```
redis-cli INFO stats | grep -E "total_commands_processed|total_connections_received"
redis-cli MEMORY STATS | grep peak_allocated
```

### Actions
- If external API down: Enable fallback gateway
- If DB slow: Scale read replicas
- If cache down: Restart Redis
- If service down: Restart pods

### Monitoring Post-Fix
- Check payment success rate returning to > 99%
- Check webhook queue draining
- Check P99 latency back to normal
```

### Runbook 3: Authorization Bypass

```markdown
## CRITICAL SECURITY INCIDENT: Authorization Bypass

### Red Flags
- User accessing data they shouldn't
- Audit log showing unauthorized access
- SUPORTE role seeing financial data

### Immediate Actions (0-5 min)

1. **ISOLATE AFFECTED SYSTEMS**
   ```
   kubectl delete pod -l app=auth-service --all
   kubectl delete pod -l app=api-gateway --all
   ```

2. **REVOKE SUSPECT SESSIONS**
   ```
   DELETE FROM user_sessions 
   WHERE user_id = 'user-xyz'
   AND created_at > NOW() - INTERVAL '1 hour';
   ```

3. **Block IP if brute-force**
   ```
   nginx -c "deny 192.168.1.100;"
   ```

### Investigation (5-15 min)

1. **Find affected data**
   ```
   SELECT DISTINCT
     accessed_by_user_id,
     entity_type,
     COUNT(*) as access_count
   FROM access_audit
   WHERE access_granted = FALSE
     AND accessed_at > NOW() - INTERVAL '1 hour'
   GROUP BY accessed_by_user_id, entity_type;
   ```

2. **Check authorization code**
   ```
   git log --oneline -n 20 src/authorization/
   git diff HEAD~5 src/authorization/middleware.py
   # Look for: Removed checks, default-allow logic, role checks disabled
   ```

3. **Review recent deploys**
   ```
   kubectl rollout history deployment/auth-service
   kubectl rollout history deployment/api-gateway
   # Check: What changed in last 24 hours?
   ```

### Remediation

1. **Rollback to last known good**
   ```
   kubectl rollout undo deployment/auth-service
   kubectl rollout undo deployment/api-gateway
   ```

2. **Fix authorization**
   - Add missing permission checks
   - Restore field masking
   - Add approval workflow for SUPORTE access

3. **Redeploy**
   ```
   git revert <bad-commit>
   docker build -t auth-service:vX.X.X .
   kubectl set image deployment/auth-service auth-service=auth-service:vX.X.X
   ```

### Post-Incident

1. **Notify affected users**
   - List of users whose data was accessed
   - What data was viewed
   - Remediation steps

2. **Security audit**
   - Code review of authorization module
   - Penetration testing
   - Access control matrix review

3. **Preventive measures**
   - Add authorization tests to CI/CD
   - Enable security scanning (SAST)
   - Require auth approval on code changes
```

### Runbook 4: Audit Log Tampering Detection

```markdown
## Incident: Suspected Audit Log Tampering

### Detection
- Audit log shows impossible sequence
  (e.g., payment succeeded without processing)
- Deletion_audit entries found deleted
- WORM table has UPDATE/DELETE records

### Immediate Response (0-5 min)

1. **Stop all services writing to audit**
   ```
   kubectl scale deployment payment-api --replicas=0
   kubectl scale deployment auth-service --replicas=0
   ```

2. **Enable read-only mode**
   ```
   ALTER DATABASE crm_prod SET default_transaction_read_only = ON;
   ```

3. **Preserve forensic data**
   ```
   pg_dump --data-only crm_prod > /tmp/audit-dump-$(date +%s).sql
   ```

### Investigation

1. **Check database logs**
   ```
   SELECT * FROM pg_log
   WHERE operation IN ('UPDATE', 'DELETE')
     AND table_name IN ('access_audit', 'deletion_audit')
     AND timestamp > NOW() - INTERVAL '24 hours';
   ```

2. **Check filesystem**
   ```
   ls -la /var/lib/postgresql/
   find /backup -name "*.sql" -newer /tmp/last-good-audit
   ```

3. **Find root cause**
   - Compromised credentials?
   - SQL injection vulnerability?
   - Insider threat?

### Remediation

1. **Rotate all database credentials**
2. **Restore from backup (pre-tampering)**
3. **Enable audit log replication** (send copies to immutable storage)
4. **Enable database parameter protection** (prevent WORM rules change)
```

---

## ✅ PRODUCTION CHECKLIST

```
✅ Structured Logging
  ├─ All logs JSON format
  ├─ Correlation IDs on all requests
  ├─ No PII values in logs
  ├─ Structured fields (not free-form text)
  ├─ Log levels appropriate (not all DEBUG)
  └─ ELK stack configured (Elasticsearch + Kibana)

✅ Distributed Tracing
  ├─ Jaeger deployed
  ├─ OpenTelemetry instrumented
  ├─ All services reporting traces
  ├─ 100% sampled for critical paths
  ├─ 10% sampled for normal traffic
  └─ Trace visualization working

✅ Metrics & Monitoring
  ├─ Prometheus scraping all services
  ├─ All endpoints instrumented (latency, errors, throughput)
  ├─ Job metrics collected
  ├─ Database metrics collected
  ├─ Cache metrics collected
  ├─ SLO/SLI definitions in place
  └─ Grafana dashboards created

✅ Alerting
  ├─ AlertManager configured
  ├─ PagerDuty integration enabled
  ├─ Slack/Email notification channels
  ├─ Critical alerts (10 defined)
  ├─ Alert routing to on-call
  ├─ Escalation policies configured
  └─ Runbooks linked to alerts

✅ Access Audit
  ├─ Access audit table (WORM)
  ├─ All API calls logged
  ├─ All data accesses tracked
  ├─ Query results logged (rows affected)
  ├─ Failed access attempts logged
  ├─ Immutability enforced (no updates/deletes)
  └─ Audit log searchable (Kibana)

✅ Rate Limiting & WAF
  ├─ Rate limiters deployed (per-IP, per-user)
  ├─ WAF rules configured (OWASP)
  ├─ DDoS protection enabled
  ├─ ModSecurity rules updated
  ├─ Payload size limits enforced
  ├─ Suspicious patterns blocked
  └─ Monitoring for false positives

✅ Secrets Management
  ├─ KMS/Vault deployed
  ├─ All secrets encrypted
  ├─ No secrets in code/config
  ├─ Secrets rotation quarterly
  ├─ .gitignore configured
  ├─ Pre-commit hooks checking
  ├─ Backup encryption enabled
  └─ Key escrow procedures

✅ Deployment Strategy
  ├─ Blue-green deployment working
  ├─ Smoke tests running pre-switch
  ├─ Rollback procedures tested
  ├─ Zero-downtime schema changes
  ├─ Load balancer health checks
  ├─ Graceful shutdown implemented
  └─ Deployment runbook documented

✅ Incident Response
  ├─ Runbooks written (5+)
  ├─ On-call schedule configured
  ├─ War room procedures
  ├─ Post-mortem template
  ├─ Communication plan
  ├─ Escalation paths clear
  └─ Team trained on procedures

✅ Infrastructure
  ├─ Kubernetes cluster (3+ replicas)
  ├─ Multi-AZ deployment
  ├─ Database replication (primary + 2 replicas)
  ├─ Redis cluster
  ├─ Elasticsearch cluster (3+ nodes)
  ├─ SSL/TLS everywhere
  ├─ Backup strategy (daily, monthly archives)
  └─ Disaster recovery tested

✅ Testing
  ├─ Load tests (10,000+ RPS)
  ├─ Failure scenario tests
  ├─ Blue-green switch tests
  ├─ Incident simulation drills
  ├─ Alert threshold tests
  └─ Chaos engineering experiments (monthly)

✅ Documentation
  ├─ Architecture diagrams
  ├─ Runbooks for all critical scenarios
  ├─ On-call handbook
  ├─ Configuration guide
  ├─ Troubleshooting guide
  └─ Metrics glossary
```

---

## 📊 SAMPLE DASHBOARDS

### Dashboard 1: System Health

```
┌─────────────────────────────────────────────────────┐
│ SYSTEM HEALTH (Last 24 hours)                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Availability: 99.98% ✓  |  Error Rate: 0.02% ✓   │
│ P99 Latency: 245ms ✓    |  Throughput: 8,234 RPS │
│                                                     │
│ Request Rate          Error Distribution           │
│ ┌────────────────┐   ┌──────────────────┐         │
│ │  ▁▂▄▆██▆▄▂▁  │   │ 200: 99.9%       │         │
│ │ 8234 RPS ►   │   │ 400: 0.05%       │         │
│ └────────────────┘   │ 500: 0.05%       │         │
│                      └──────────────────┘         │
│                                                     │
│ P99 Latency                 Cache Hit Ratio        │
│ ┌────────────────┐   ┌──────────────────┐         │
│ │  ▄▆█▆▅▄▃▂▂▁  │   │ 96.2% ✓          │         │
│ │ 245ms         │   │ ▆▆▆▆▆▆▆▆▆▆       │         │
│ └────────────────┘   └──────────────────┘         │
│                                                     │
│ Database Connections: 12/50  |  Pod Restarts: 0   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Dashboard 2: Payment Metrics

```
┌─────────────────────────────────────────────────────┐
│ PAYMENT PROCESSING (Last hour)                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Total Payments    Successful       Failed           │
│     12,456           12,340           116           │
│                                                     │
│ Success Rate: 99.07%    |    Avg Amount: R$ 2,543  │
│                                                     │
│ Payment Status Distribution                         │
│ ┌─────────────────────────────────────────────────┐ │
│ │ SUCCEEDED: ███████████████████████ 99.07%       │ │
│ │ FAILED:    ▌ 0.93%                              │ │
│ │ PENDING:   ▌ 0%                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Processing Latency by Gateway                       │
│ ┌────────────────┐ ┌────────────────┐ ┌──────────┐│
│ │ Stripe: 150ms  │ │ MercadoPago:   │ │ Pagar.me││
│ │ ▆▆▆▆▆▆▆▆▆▆     │ │ 120ms          │ │ 180ms   ││
│ └────────────────┘ │ ▆▆▆▆▆▆▆▆▆      │ │▆▆▆▆▆▆▆▆▆││
│                     │                │ │         ││
│                     └────────────────┘ └──────────┘│
│                                                     │
│ Webhook Processing: 45,230 processed, 0 in DLQ    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 KEY TAKEAWAYS

```
1. OBSERVABILITY
   ├─ Structured JSON logs with correlation IDs
   ├─ Distributed tracing (Jaeger + OpenTelemetry)
   ├─ Comprehensive metrics (Prometheus)
   └─ SLI/SLO alignment

2. SECURITY
   ├─ Rate limiting (token bucket)
   ├─ WAF (ModSecurity + NGINX)
   ├─ Secrets encrypted (KMS/Vault)
   └─ All access audited (WORM table)

3. RELIABILITY
   ├─ Blue-green deployment (zero downtime)
   ├─ Zero-downtime migrations
   ├─ Circuit breakers + fallbacks
   └─ Disaster recovery tested

4. INCIDENT RESPONSE
   ├─ Runbooks for all critical scenarios
   ├─ <5 min triage procedures
   ├─ Automated remediation where possible
   └─ Post-mortem driven improvements

5. COMPLIANCE
   ├─ No PII in logs
   ├─ Immutable audit trail
   ├─ 7-year retention enforced
   └─ Regular access reviews
```

---

**Version:** 1.0  
**Status:** Production Ready  
**Scope:** SRE, Platform Engineering, DevOps  
**Last Updated:** 2026-02-03

Integration with: LGPD_COMPLIANCE.md + AUTHORIZATION_SYSTEM.md + IMMUTABLE_AUDIT_SYSTEM.md
