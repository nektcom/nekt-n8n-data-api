# nekt-n8n-data-api

n8n community node for the [Nekt Data API](https://docs.nekt.ai/data-api-v1/introduction). Query your data warehouse directly from n8n workflows — no HTTP Request nodes, no manual pagination, no Parquet parsing.

## Operations

### Run Query

Executes a SQL query and returns a presigned download URL pointing to a Parquet or CSV file. Best for large exports and pipelines where you process the file externally.

**Inputs:** SQL Query, Output Format (Parquet or CSV)
**Output:** One n8n item with `downloadUrl`, `format`, and `executedAt`.

### Run Query and Get Results

Executes a SQL query and returns **each row as an individual n8n item**, ready to connect to any downstream node (Send Email, Create Jira Issue, HTTP Request, etc.).

**Inputs:** SQL Query, Max Pages (default: 10), Application Start Timeout
**Output:** N items — one per row returned by the query.

Handles the full v1 API flow automatically: starts the Explorer application, waits for it to be ready, creates the query, paginates through all result pages, downloads and parses the Parquet files.

## Installation

In your n8n instance: **Settings → Community Nodes → Install → `nekt-n8n-data-api`**

## Authentication

Create an API key at [app.nekt.ai/settings/api-keys](https://app.nekt.ai/settings/api-keys) and add it as a **Nekt API** credential in n8n.

## SQL Dialect

Nekt uses [Spark SQL](https://spark.apache.org/docs/latest/sql-programming-guide.html). Reference tables using the `"layer"."table_name"` format:

```sql
SELECT *
FROM "nekt_raw"."my_table"
LIMIT 200
```

## Notes

- The Explorer application takes ~2 minutes to start on the first run of the day. Subsequent runs within the same session are faster.
- Each page contains up to 100 rows. Increase **Max Pages** for large result sets (e.g., set to 100 for up to 10,000 rows).
- Presigned download URLs are valid for 1 hour.
- The Data API is available on all Nekt paid plans.

## Links

- [Nekt Data API docs](https://docs.nekt.ai/data-api-v1/introduction)
- [Create API key](https://app.nekt.ai/settings/api-keys)
- [Report issues](https://github.com/nektcom/nekt-n8n-data-api/issues)
