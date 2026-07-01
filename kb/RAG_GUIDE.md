# RAG Architecture Guide — Axis Bank Credit Card Knowledge Base

> **Purpose:** This guide explains how to optimally ingest, chunk, embed, and retrieve the KB files in this directory for a Retrieval-Augmented Generation (RAG) system powering the Axis Bank credit card bot.

---

## 1. Knowledge Base Structure

```
credit_card_kb/
├── kb_01_credit_card_products.md       # Card portfolio, comparisons
├── kb_02_eligibility_application.md    # Who can apply, documents, process
├── kb_03_fees_charges.md               # Interest, annual fees, late fees
├── kb_04_rewards_benefits.md           # EDGE Points, cashback, lounge access
├── kb_05_billing_payments.md           # Billing cycle, how to pay, EMI
├── kb_06_disputes_fraud_security.md    # Fraud, chargebacks, card security
├── kb_07_rbi_regulations.md            # Customer rights, RBI rules
├── kb_08_account_management.md         # PIN, limit, closure, contactless
└── RAG_GUIDE.md                        # This file
```

**Total chunks across all files:** ~70 discrete Q&A chunks

---

## 2. Chunking Strategy

### How to Chunk These Files

Each `## CHUNK N — Topic Name` section is **one retrieval unit**. Do NOT split across chunk boundaries.

**Recommended chunk size:** 200–500 tokens per chunk (already designed this way)

**Chunking logic for ingestion:**
```python
# Pseudocode — adapt for your stack (LangChain / LlamaIndex / custom)
import re

def extract_chunks(filepath):
    with open(filepath) as f:
        content = f.read()

    # Split on CHUNK headers
    chunks = re.split(r'(?=## CHUNK \d+)', content)

    # First segment is frontmatter + file-level context — keep as a summary chunk
    return [c.strip() for c in chunks if c.strip()]
```

**Overlap:** No overlap needed between chunks — each chunk is self-contained.
If your vector DB requires overlap windows (e.g., 50 tokens), apply it only within chunk boundaries.

---

## 3. Metadata Schema for Vector Store

Every chunk should be stored with the following metadata fields for filtered retrieval:

```json
{
  "chunk_id": "kb_01_chunk_3",
  "file_id": "kb_01",
  "topic": "Credit Card Products Portfolio",
  "subtopic": "ACE Credit Card",
  "tags": ["axis-bank", "credit-card", "ACE", "cashback"],
  "last_updated": "2026-03-31",
  "source": "Axis Bank official website",
  "language": "en",
  "is_regulatory": false,
  "card_names": ["ACE"],
  "intent_types": ["product-info", "comparison"],
  "text": "< full chunk text >"
}
```

**Metadata fields explained:**

| Field | Type | Use |
|---|---|---|
| `chunk_id` | string | Unique identifier for each chunk |
| `file_id` | string | Parent file (kb_01–kb_08) |
| `topic` | string | High-level topic for filtering |
| `subtopic` | string | Specific sub-topic within the chunk |
| `tags` | array | Keywords for hybrid search |
| `last_updated` | date | Staleness detection — re-embed on update |
| `is_regulatory` | boolean | True for RBI-related chunks (kb_07) |
| `card_names` | array | Card names mentioned — enables card-specific queries |
| `intent_types` | array | Intent classification for routing (see Section 5) |

---

## 4. Embedding Recommendations

### Recommended Embedding Models

| Model | Notes |
|---|---|
| **text-embedding-3-small** (OpenAI) | Fast, cost-effective, 1536-dim. Good baseline. |
| **text-embedding-3-large** (OpenAI) | Higher accuracy, 3072-dim. Use for production. |
| **intfloat/multilingual-e5-large** | Best if Hindi/regional language queries expected |
| **BAAI/bge-large-en-v1.5** | Open-source, strong for financial Q&A |

### Embedding Best Practices

1. **Prefix your query and document texts** (especially for BGE/E5 models):
   - Document: `passage: <chunk_text>`
   - Query: `query: <user_question>`

2. **Embed questions + answers together** in each chunk — this improves semantic matching when users ask natural questions

3. **Re-embed chunks** when `last_updated` changes — stale embeddings reduce accuracy

4. **Dimension:** 1536 (OpenAI small) or 768 (open-source) are practical for production

---

## 5. Recommended Vector Database Setup

### Vector DB Options (ranked for this use case)

| DB | Why Suitable |
|---|---|
| **Pinecone** | Fully managed, fast filtering by metadata, good scaling |
| **pgvector (PostgreSQL)** | Already in Axis Bank infra likely, supports hybrid search |
| **Weaviate** | Strong hybrid search (BM25 + vector), good metadata filtering |
| **Qdrant** | Open-source, payload filtering, efficient for <1M vectors |
| **Azure AI Search** | If Azure stack is used — built-in hybrid search |

### Index Configuration

```yaml
# Example Pinecone / Qdrant-style config
index:
  name: axis_credit_card_kb
  dimension: 1536           # Match your embedding model
  metric: cosine
  metadata_fields:
    - file_id
    - topic
    - tags
    - is_regulatory
    - card_names
    - intent_types
    - last_updated
```

---

## 6. Query Processing Pipeline

### Recommended RAG Pipeline Architecture

```
User Query
    │
    ▼
[Query Classification]          ← Detect intent (see Intent Types below)
    │
    ▼
[Query Expansion / Rewriting]   ← "what are the fees" → "What fees does Axis Bank charge on credit cards?"
    │
    ▼
[Hybrid Retrieval]
    ├── Vector Search (semantic)   → top-k=5 chunks by cosine similarity
    └── BM25 / Keyword Search      → top-k=3 chunks by keyword match
    │
    ▼
[Re-ranking]                    ← Use cross-encoder for re-ranking (e.g., ms-marco-MiniLM)
    │
    ▼
[Context Assembly]              ← Top 3–5 chunks assembled as context
    │
    ▼
[LLM Generation]                ← Claude / GPT-4 with system prompt
    │
    ▼
Bot Response
```

### Intent Types for Routing

Pre-classify user queries into intent types to filter retrieval:

| Intent Type | Example Queries | Relevant KB Files |
|---|---|---|
| `product-info` | "Tell me about Magnus card", "Best card for travel" | kb_01 |
| `eligibility` | "Can I apply?", "Minimum salary for SELECT card" | kb_02 |
| `fees-charges` | "Annual fee", "Interest rate", "Late payment charge" | kb_03 |
| `rewards` | "How to earn points", "Redeem miles", "Lounge access" | kb_04 |
| `billing-payment` | "Pay my bill", "Due date", "Convert to EMI" | kb_05 |
| `fraud-security` | "Card lost", "Unauthorized transaction", "Block card" | kb_06 |
| `regulatory-rights` | "RBI rules", "My rights", "Complaint to Ombudsman" | kb_07 |
| `account-mgmt` | "Change PIN", "Increase limit", "Close card" | kb_08 |

---

## 7. Bot System Prompt Template

Use this system prompt when calling the LLM with retrieved context:

```
You are a helpful credit card assistant for Axis Bank customers in India.
Answer the user's question using ONLY the information in the provided context.
If the context does not contain sufficient information to answer, say:
"I don't have specific information on that. Please contact Axis Bank customer care at 1860-419-5555 or visit axisbank.com for accurate details."

Rules:
1. Never guess or hallucinate figures (interest rates, fees, credit limits) — only use what is in the context
2. For urgent issues (fraud, card lost), always advise calling 1860-419-5555 immediately
3. Always recommend verifying current rates/fees on the official Axis Bank website as they may change
4. If the user's question involves regulatory rights, cite the relevant RBI guideline
5. Be concise and direct — answer in 3–5 sentences unless a detailed breakdown is needed

Context:
{retrieved_chunks}

User Question: {user_query}
```

---

## 8. Maintenance and Update Schedule

| Activity | Frequency | Responsible |
|---|---|---|
| Review KB files for accuracy | **Quarterly** | Axis Bank Product/Compliance team |
| Re-embed chunks after updates | On each update | Data/ML team |
| Add new card products | When new cards launch | KB author |
| Update fees/charges | On Axis Bank fee revision announcements | KB author |
| Update RBI regulatory section | When RBI issues new circulars | Compliance team |
| Evaluate retrieval accuracy | Monthly | ML/QA team |

### Version Control Recommendation

Store all KB files in a **Git repository** to track changes. When files change:
1. Update `last_updated` in frontmatter
2. Re-ingest and re-embed changed files
3. Tag the git commit with the change reason

---

## 9. Alternative and Complementary Approaches

### Beyond Simple RAG — What Works Better for Banking FAQs

| Approach | When to Use | Advantage |
|---|---|---|
| **Structured FAQ Database** (relational + vector) | When you have a known fixed set of questions | Exact match for common questions; vector for fuzzy queries |
| **Graph RAG** | When relationships matter (e.g., "which card gives best reward for travel AND dining") | Multi-hop reasoning across card attributes |
| **Fine-tuned embedding model** | When you have historical query logs | Domain-adapted embeddings for banking terminology |
| **Intent + Slot-filling (Hybrid)** | For structured queries ("what's the fee for Magnus card") | Faster, cheaper than full LLM for deterministic answers |
| **Tabular data + SQL** | Fees tables, eligibility matrices | Precise numerical queries without hallucination risk |

### Recommended Hybrid Architecture for Production

```
User Query
    │
    ├─ [Rule-based FAQ matching]     ← Fast exact-match for top-50 FAQs (zero latency)
    │
    ├─ [Intent classifier → Slot fill → Structured DB lookup]
    │     └── For fee/rate queries, use a fees table in SQL, not LLM
    │
    └─ [RAG pipeline]                ← For complex, nuanced, or long-tail questions
```

This hybrid approach reduces LLM calls by ~40–60% for common queries, lowering cost and latency.
