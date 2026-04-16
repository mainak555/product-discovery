# Product Discovery

Agent-based product roadmap planning tool — OKR to Product Backlog.  
Django SPA with HTMX, SCSS, and MongoDB (PyMongo).

---

## Quick Start (Local — .venv)

```bash
# 1. Create and activate virtual environment
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS/Linux
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
#    Edit .env with your MongoDB URI and admin secret key

# 4. Run the development server
python manage.py runserver
```

Open **http://localhost:8000** in your browser.

---

## Docker

```bash
# Build
docker build -t product-discovery .

# Run (uses .env file for configuration)
docker run -p 8000:8000 --env-file .env product-discovery
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `APP_SECRET_KEY` | Admin password for write access | *(required)* |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_NAME` | MongoDB database name | `product_discovery` |
| `DEBUG` | Django debug mode | `True` |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts | `localhost,127.0.0.1` |

---

## Project Structure

See [AGENTS.md](AGENTS.md) for full architecture and development instructions.

## Configuration Notes

- Supported agent models are defined in `agent_models.json` at the repository root.
- The future AutoGen runtime lives in the root `agents/` package, separate from the Django `server/` app.
