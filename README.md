# LLM API Engine

Build and deploy AI-powered APIs in seconds. This project allows you to create custom APIs that extract structured data from websites using natural language descriptions, powered by LLMs and web scraping technology.

## Features

- 🤖 Natural Language API Creation - Describe your data needs in plain English
- 🔄 Automatic Schema Generation using OpenAI
- 🌐 Intelligent Web Scraping with Firecrawl
- ⚡ Real-time Data Updates with QStash scheduling
- 🚀 Instant API Deployment
- 📊 Structured Data Output with JSON Schema validation
- 💾 Redis-powered Caching and Storage

## Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS
- **APIs**: OpenAI, Firecrawl, Upstash Redis/QStash
- **Data Validation**: Zod
- **Animations**: Framer Motion
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm/yarn/pnpm
- Upstash Redis account
- OpenAI API key
- Firecrawl API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/llm-api-engine.git
cd llm-api-engine
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with the following variables:
```env
OPENAI_API_KEY=your_openai_key
FIRECRAWL_API_KEY=your_firecrawl_key
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Usage

1. **Describe Your API**: Enter a natural language description of the data you want to extract
2. **Generate Schema**: The system will automatically generate a JSON schema
3. **Configure Sources**: Select websites to extract data from
4. **Deploy**: Get an instant API endpoint with your structured data

### Example

```bash
# Create an API to extract company information
curl -X POST "https://your-domain.com/api/deploy" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Extract company name, revenue, and employee count",
    "urls": ["https://example.com/company"],
    "schedule": "0 5 * * *"
  }'
```

## API Documentation

### Endpoints

- `POST /api/generate-schema` - Generate JSON schema from description
- `POST /api/extract` - Extract data from URLs
- `POST /api/deploy` - Deploy a new API endpoint
- `GET /api/routes` - List all deployed routes
- `GET /api/results/:endpoint` - Get results for a specific endpoint

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [OpenAI](https://openai.com/)
- Web scraping by [Firecrawl](https://firecrawl.dev/)
- Data storage by [Upstash](https://upstash.com/)

## Roadmap

### 🚧 In Progress: CRON Functionality

Currently working on implementing scheduled data extraction with the following planned features:
- Backend CRON implementation using Vercel
- Rate limiting and retry mechanisms
- Job queue for concurrent scrapes
- Schedule management dashboard
- Job history and monitoring
- Email notifications for failed jobs
# llm-api-engine
